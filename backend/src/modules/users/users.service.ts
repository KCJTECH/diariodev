// Administração de usuários (§13.1, §16, §17.6). Restrito a gestor+ nas rotas.
// Salvaguardas: ninguém se desativa/exclui na mesma operação; o último CEO
// ativo não pode ser removido nem rebaixado.
import { randomBytes } from 'node:crypto';
import type { Db } from '../../common/database/prisma.js';
import { Errors } from '../../common/errors/app-error.js';
import { API_TO_LEVEL, type ApiLevel, type AuthUser } from '../../common/auth/types.js';
import { hashPassword } from '../../common/auth/password.js';
import { sha256 } from '../../common/auth/tokens.js';
import { slugify } from '../../common/utils/format.js';
import { sendMail } from '../../common/mail/mailer.js';
import { logger } from '../../common/logging/logger.js';
import { writeAudit } from '../audit/audit.service.js';
import { userSelect, userToPerson, type PersonDto } from './users.mapper.js';
import { env, isProduction } from '../../config/env.js';

type Meta = { requestId: string; ipHash: string | null; userAgent: string | null };

export type UserWrite = {
  name: string;
  role: string;
  email: string;
  initials?: string;
  color?: string;
  level?: ApiLevel;
  active?: boolean;
};

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || 'US';
}

async function uniquePublicKey(db: Db, name: string, email: string): Promise<string> {
  const base = slugify(email.split('@')[0] ?? name) || slugify(name) || 'user';
  let key = base;
  let n = 1;
  while (await db.user.findUnique({ where: { publicKey: key }, select: { id: true } })) {
    n += 1;
    key = `${base}-${n}`;
  }
  return key;
}

async function activeCeoCount(db: Db, excludeUserId?: string): Promise<number> {
  return db.user.count({
    where: { effectiveLevel: 'CEO', active: true, deletedAt: null, id: excludeUserId ? { not: excludeUserId } : undefined },
  });
}

export async function listUsers(db: Db): Promise<PersonDto[]> {
  const rows = await db.user.findMany({ where: { deletedAt: null }, select: userSelect, orderBy: { name: 'asc' } });
  return rows.map(userToPerson);
}

export async function createUser(
  db: Db,
  actor: AuthUser,
  input: UserWrite,
  meta: Meta,
): Promise<{ user: PersonDto; tempPassword?: string }> {
  const email = input.email.toLowerCase();
  const exists = await db.user.findFirst({ where: { email } });
  if (exists) throw Errors.conflict('EMAIL_IN_USE', 'E-mail já cadastrado.');

  // Senha inicial: usa INITIAL_USER_PASSWORD quando configurada (a tela de
  // administração não tem campo de senha), senão gera uma aleatória.
  const tempPassword = env.INITIAL_USER_PASSWORD ?? randomBytes(9).toString('base64url');
  const publicKey = await uniquePublicKey(db, input.name, email);
  const row = await db.user.create({
    data: {
      publicKey,
      name: input.name.trim(),
      roleTitle: input.role.trim(),
      email,
      passwordHash: await hashPassword(tempPassword),
      initials: (input.initials?.trim() || initialsFrom(input.name)).slice(0, 3),
      color: input.color?.trim() || '#64748b',
      active: input.active ?? true,
      effectiveLevel: API_TO_LEVEL[input.level ?? 'dev'],
      passwordChangedAt: new Date(),
    },
    select: userSelect,
  });
  await db.userPreference.create({ data: { userId: row.id } });
  await writeAudit(db, {
    actorUserId: actor.id, action: 'user.created', entityType: 'user', entityId: row.id,
    requestId: meta.requestId, after: { publicKey, email }, ipHash: meta.ipHash, userAgent: meta.userAgent,
  });
  // A senha temporária só é devolvida fora de produção, para o admin repassar.
  return { user: userToPerson(row), tempPassword: isProduction ? undefined : tempPassword };
}

export async function updateUser(
  db: Db,
  actor: AuthUser,
  targetPublicKey: string,
  input: Partial<UserWrite>,
  meta: Meta,
): Promise<PersonDto> {
  const current = await db.user.findFirst({ where: { publicKey: targetPublicKey, deletedAt: null } });
  if (!current) throw Errors.notFound('USER_NOT_FOUND', 'Usuário não encontrado.');

  const demotingSelfFromCeo = current.id === actor.id && input.level && input.level !== 'ceo';
  const deactivatingSelf = current.id === actor.id && input.active === false;
  if (deactivatingSelf) throw Errors.forbidden('Não é possível desativar a própria conta.');

  // Último CEO ativo não pode ser rebaixado nem desativado.
  const wouldLoseCeo =
    current.effectiveLevel === 'CEO' &&
    ((input.level && input.level !== 'ceo') || input.active === false);
  if (wouldLoseCeo && (await activeCeoCount(db, current.id)) === 0) {
    throw Errors.conflict('LAST_CEO', 'Não é possível rebaixar ou desativar o último CEO ativo.');
  }
  if (demotingSelfFromCeo && (await activeCeoCount(db, current.id)) === 0) {
    throw Errors.conflict('LAST_CEO', 'Não é possível rebaixar o último CEO ativo.');
  }

  const row = await db.user.update({
    where: { id: current.id },
    data: {
      name: input.name?.trim(),
      roleTitle: input.role?.trim(),
      email: input.email?.toLowerCase(),
      initials: input.initials?.trim().slice(0, 3),
      color: input.color?.trim(),
      active: input.active,
      effectiveLevel: input.level ? API_TO_LEVEL[input.level] : undefined,
    },
    select: userSelect,
  });
  await writeAudit(db, {
    actorUserId: actor.id, action: 'user.updated', entityType: 'user', entityId: current.id,
    requestId: meta.requestId, ipHash: meta.ipHash, userAgent: meta.userAgent,
  });
  return userToPerson(row);
}

export async function deactivateUser(db: Db, actor: AuthUser, targetPublicKey: string, meta: Meta): Promise<void> {
  const current = await db.user.findFirst({ where: { publicKey: targetPublicKey, deletedAt: null } });
  if (!current) throw Errors.notFound('USER_NOT_FOUND', 'Usuário não encontrado.');
  if (current.id === actor.id) throw Errors.forbidden('Não é possível excluir a própria conta.');
  if (current.effectiveLevel === 'CEO' && (await activeCeoCount(db, current.id)) === 0) {
    throw Errors.conflict('LAST_CEO', 'Não é possível remover o último CEO ativo.');
  }

  // Exclusão administrativa = desativar + soft delete; sessões são revogadas.
  await db.$transaction([
    db.user.update({ where: { id: current.id }, data: { active: false, deletedAt: new Date() } }),
    db.session.updateMany({ where: { userId: current.id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await writeAudit(db, {
    actorUserId: actor.id, action: 'user.deactivated', entityType: 'user', entityId: current.id,
    requestId: meta.requestId, ipHash: meta.ipHash, userAgent: meta.userAgent,
  });
}

// Reset acionado por gestor+ para outro colaborador. O link vai por e-mail para
// quem acionou, não para o titular da conta: o caso de uso é justamente o
// colaborador que não consegue acessar o próprio e-mail, e aí o gestor repassa o
// link pelo canal que já usa com a equipe (telefone, WhatsApp, presencialmente).
export async function adminResetPassword(
  db: Db,
  actor: AuthUser,
  targetPublicKey: string,
  meta: Meta,
): Promise<{ resetToken?: string; mailSent: boolean }> {
  const user = await db.user.findFirst({ where: { publicKey: targetPublicKey, deletedAt: null } });
  if (!user) throw Errors.notFound('USER_NOT_FOUND', 'Usuário não encontrado.');

  // Um pedido novo invalida os anteriores ainda abertos, para não deixar vários
  // links válidos circulando para a mesma conta.
  await db.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });

  const token = randomBytes(32).toString('base64url');
  const minutes = env.PASSWORD_RESET_TTL_MINUTES;
  await db.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + minutes * 60 * 1000),
      requestedBy: actor.id,
    },
  });
  await writeAudit(db, {
    actorUserId: actor.id, action: 'user.password_reset_requested', entityType: 'user', entityId: user.id,
    requestId: meta.requestId, ipHash: meta.ipHash, userAgent: meta.userAgent,
  });

  // Token no fragmento (#), não na query: o fragmento não é enviado ao servidor,
  // então não entra em log de requisição, Referer nem log de proxy.
  const link = `${env.APP_ORIGIN}/login.dc.html#reset=${encodeURIComponent(token)}`;
  const mailSent = await sendMail({
    to: actor.email,
    subject: `Diário Dev: link de redefinição de senha de ${user.name}`,
    text: [
      `Olá, ${actor.name}.`,
      '',
      `Você solicitou a redefinição de senha da conta de ${user.name} (${user.email}).`,
      `Repasse o endereço abaixo para ${user.name} pelo canal que vocês já usam. O link vale ${minutes} minutos e só pode ser usado uma vez.`,
      '',
      link,
      '',
      'Quem abrir este link define uma nova senha para essa conta. Não encaminhe para mais ninguém.',
      '',
      'Diário Dev ITS',
    ].join('\n'),
  });

  if (mailSent) {
    logger.info(
      { actorUserId: actor.id, targetUserId: user.id },
      'link de redefinição enviado ao gestor que solicitou',
    );
  } else {
    logger.warn(
      { actorUserId: actor.id, targetUserId: user.id },
      'reset administrativo criado, mas o e-mail para o gestor não foi enviado',
    );
    if (!isProduction) logger.warn({ resetLink: link }, 'link de redefinição (apenas desenvolvimento)');
  }

  // Fora de produção o token também volta na resposta, para teste e para o admin
  // repassar sem SMTP. Em produção nunca: o caminho é o e-mail.
  return { resetToken: isProduction ? undefined : token, mailSent };
}
