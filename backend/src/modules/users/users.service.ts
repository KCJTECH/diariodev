// Administração de usuários (§13.1, §16, §17.6). Restrito a gestor+ nas rotas.
// Salvaguardas: ninguém se desativa/exclui na mesma operação; o último CEO
// ativo não pode ser removido nem rebaixado.
import { randomBytes } from 'node:crypto';
import type { Db } from '../../common/database/prisma.js';
import { Errors } from '../../common/errors/app-error.js';
import { API_TO_LEVEL, type ApiLevel, type AuthUser } from '../../common/auth/types.js';
import {
  assertCanGrantLevel,
  assertCanManageCredentials,
  assertCanManageUser,
} from '../../common/auth/policy.js';
import { hashPassword, isTrivialPassword } from '../../common/auth/password.js';
import { slugify } from '../../common/utils/format.js';
import { logger } from '../../common/logging/logger.js';
import { writeAudit } from '../audit/audit.service.js';
import { revokedEvent } from '../auth/auth.service.js';
import { userSelect, userToPerson, userToPersonFor, type PersonDto } from './users.mapper.js';
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

export async function listUsers(db: Db, actor: AuthUser): Promise<PersonDto[]> {
  const rows = await db.user.findMany({ where: { deletedAt: null }, select: userSelect, orderBy: { name: 'asc' } });
  return rows.map((r) => userToPersonFor(actor, r));
}

export async function createUser(
  db: Db,
  actor: AuthUser,
  input: UserWrite,
  meta: Meta,
): Promise<{ user: PersonDto; tempPassword?: string }> {
  // Antes de qualquer consulta: sem o teto de nível, um gestor criaria conta CEO.
  // Vem primeiro para que quem não tem permissão não descubra se um e-mail existe.
  assertCanGrantLevel(actor, input.level ?? 'dev');

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

  // Autorização depois do 404 e antes das salvaguardas abaixo: inverter a ordem
  // trocaria o 409 de LAST_CEO por 403 e mudaria o contrato de uma regra que já
  // existe. O teto de concessão é o que impede a autopromoção, sem impedir o
  // gestor de editar o próprio nome, e-mail ou cargo, porque a tela envia o
  // corpo completo, com o nível atual, em toda gravação.
  assertCanManageUser(actor, current);
  if (input.level) assertCanGrantLevel(actor, input.level);

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
  // Sem esta linha, havendo dois CEOs ativos um gestor excluiria um deles: a
  // salvaguarda do último CEO só barra quando sobraria zero.
  assertCanManageUser(actor, current);
  if (current.effectiveLevel === 'CEO' && (await activeCeoCount(db, current.id)) === 0) {
    throw Errors.conflict('LAST_CEO', 'Não é possível remover o último CEO ativo.');
  }

  // Exclusão administrativa = desativar + soft delete; sessões são revogadas.
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: current.id }, data: { active: false, deletedAt: new Date() } });
    await tx.session.updateMany({ where: { userId: current.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await revokedEvent(tx, current.id);
  });
  await writeAudit(db, {
    actorUserId: actor.id, action: 'user.deactivated', entityType: 'user', entityId: current.id,
    requestId: meta.requestId, ipHash: meta.ipHash, userAgent: meta.userAgent,
  });
}

// Definição direta da senha por gestor+, usada pelos campos de senha da tela de
// administração. Revoga as sessões do colaborador e invalida links de redefinição
// em aberto, senão um link antigo continuaria valendo depois da troca.
export async function setUserPassword(
  db: Db,
  actor: AuthUser,
  targetPublicKey: string,
  newPassword: string,
  meta: Meta,
): Promise<void> {
  const user = await db.user.findFirst({ where: { publicKey: targetPublicKey, deletedAt: null } });
  if (!user) throw Errors.notFound('USER_NOT_FOUND', 'Usuário não encontrado.');
  assertCanManageCredentials(actor, user);

  if (newPassword.length < 8) throw Errors.validation([{ field: 'newPassword', message: 'Mínimo de 8 caracteres.' }]);
  if (isTrivialPassword(newPassword)) {
    throw Errors.validation([{ field: 'newPassword', message: 'Senha muito comum.' }]);
  }

  const passwordHash = await hashPassword(newPassword);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash, passwordChangedAt: new Date() } });
    await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await revokedEvent(tx, user.id);
  });
  await writeAudit(db, {
    actorUserId: actor.id, action: 'user.password_set', entityType: 'user', entityId: user.id,
    requestId: meta.requestId, ipHash: meta.ipHash, userAgent: meta.userAgent,
  });
  logger.info({ actorUserId: actor.id, targetUserId: user.id }, 'senha definida pelo administrador');
}

