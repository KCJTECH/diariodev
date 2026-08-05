// Regras de autenticação e sessão. O access token é JWT curto; o refresh é
// opaco, guardado apenas como hash, rotacionado a cada uso, com detecção de
// reuso (§15.2). Toda autorização real acontece no servidor.
import { randomBytes } from 'node:crypto';
import type { User } from '@prisma/client';
import type { Db } from '../../common/database/prisma.js';
import { Errors } from '../../common/errors/app-error.js';
import { sendMail } from '../../common/mail/mailer.js';
import { logger } from '../../common/logging/logger.js';
import { hashPassword, verifyPassword, isTrivialPassword } from '../../common/auth/password.js';
import {
  signAccessToken,
  generateRefreshToken,
  sha256,
  hashIp,
} from '../../common/auth/tokens.js';
import { LEVEL_TO_API, type AuthUser } from '../../common/auth/types.js';
import { env, isProduction } from '../../config/env.js';

export type AuthResult = { user: AuthUser; accessToken: string; refreshToken: string };
type Ctx = { ua?: string | undefined; ip?: string | undefined };

function toAuthUser(u: User, sessionId: string): AuthUser {
  return {
    id: u.id,
    publicKey: u.publicKey,
    name: u.name,
    roleTitle: u.roleTitle,
    email: u.email,
    initials: u.initials,
    color: u.color,
    active: u.active,
    level: LEVEL_TO_API[u.effectiveLevel],
    timezone: u.timezone,
    sessionId,
  };
}

async function createSession(db: Db, userId: string, ctx: Ctx): Promise<{ sessionId: string; refreshToken: string }> {
  const refreshToken = generateRefreshToken();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL * 1000);
  const session = await db.session.create({
    data: {
      userId,
      refreshTokenHash: sha256(refreshToken),
      userAgent: ctx.ua ?? null,
      ipHash: hashIp(ctx.ip),
      expiresAt,
      lastUsedAt: new Date(),
    },
  });
  return { sessionId: session.id, refreshToken };
}

async function issue(db: Db, user: User, ctx: Ctx): Promise<AuthResult> {
  const { sessionId, refreshToken } = await createSession(db, user.id, ctx);
  const accessToken = signAccessToken({ sub: user.id, sid: sessionId, lvl: LEVEL_TO_API[user.effectiveLevel] });
  return { user: toAuthUser(user, sessionId), accessToken, refreshToken };
}

export async function login(db: Db, email: string, password: string, ctx: Ctx): Promise<AuthResult> {
  const user = await db.user.findFirst({
    where: { email: email.toLowerCase(), deletedAt: null },
  });
  // Verifica sempre para reduzir enumeração de usuário por diferença de tempo.
  const ok = user ? await verifyPassword(user.passwordHash, password) : false;
  if (!user || !ok) throw Errors.invalidCredentials();
  if (!user.active) throw Errors.forbidden('Usuário inativo.');

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return issue(db, user, ctx);
}

// "Entrar como" — apenas desenvolvimento, controlado por ALLOW_DEV_LOGIN.
export async function devLogin(db: Db, publicKey: string, ctx: Ctx): Promise<AuthResult> {
  if (!env.ALLOW_DEV_LOGIN) throw Errors.notFound('NOT_FOUND', 'Recurso não encontrado.');
  const user = await db.user.findFirst({ where: { publicKey, deletedAt: null, active: true } });
  if (!user) throw Errors.notFound('USER_NOT_FOUND', 'Colaborador não encontrado.');
  return issue(db, user, ctx);
}

export async function refresh(db: Db, refreshToken: string | undefined, ctx: Ctx): Promise<AuthResult> {
  if (!refreshToken) throw Errors.unauthorized('Sem token de atualização.');
  const hash = sha256(refreshToken);
  const session = await db.session.findUnique({ where: { refreshTokenHash: hash }, include: { user: true } });

  if (!session) throw Errors.unauthorized('Sessão inválida.');

  // Detecção de reuso: token de sessão já revogada foi reapresentado.
  if (session.revokedAt) {
    await db.session.updateMany({
      where: { userId: session.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw Errors.unauthorized('Sessão revogada.');
  }
  if (session.expiresAt.getTime() <= Date.now()) throw Errors.unauthorized('Sessão expirada.');
  if (!session.user.active || session.user.deletedAt) throw Errors.forbidden('Usuário inativo.');

  // Rotação em lugar: novo refresh substitui o anterior.
  const newRefresh = generateRefreshToken();
  await db.session.update({
    where: { id: session.id },
    data: {
      refreshTokenHash: sha256(newRefresh),
      rotatedAt: new Date(),
      lastUsedAt: new Date(),
      userAgent: ctx.ua ?? session.userAgent,
      ipHash: hashIp(ctx.ip) ?? session.ipHash,
    },
  });
  const accessToken = signAccessToken({
    sub: session.user.id,
    sid: session.id,
    lvl: LEVEL_TO_API[session.user.effectiveLevel],
  });
  return { user: toAuthUser(session.user, session.id), accessToken, refreshToken: newRefresh };
}

export async function logout(db: Db, refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;
  await db.session.updateMany({
    where: { refreshTokenHash: sha256(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function changePassword(
  db: Db,
  userId: string,
  sessionId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw Errors.unauthorized();
  const ok = await verifyPassword(user.passwordHash, currentPassword);
  if (!ok) throw Errors.invalidCredentials('Senha atual incorreta.');
  if (newPassword.length < 8) throw Errors.validation([{ field: 'newPassword', message: 'Mínimo de 8 caracteres.' }]);
  if (isTrivialPassword(newPassword)) {
    throw Errors.validation([{ field: 'newPassword', message: 'Senha muito comum.' }]);
  }

  const passwordHash = await hashPassword(newPassword);
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { passwordHash, passwordChangedAt: new Date() } }),
    // Invalida as demais sessões, preservando a atual (§15.1).
    db.session.updateMany({
      where: { userId, revokedAt: null, id: { not: sessionId } },
      data: { revokedAt: new Date() },
    }),
  ]);
}

// Solicitação de reset pelo próprio usuário, a partir da tela de login.
// Nunca revela se o e-mail existe: o retorno é o mesmo para conta existente,
// inexistente ou inativa (evita enumeração de usuários). O `userId` volta só
// para a rota registrar a auditoria e o `token` só para teste e log de
// desenvolvimento: a resposta HTTP não pode conter nenhum dos dois.
export async function requestPasswordReset(
  db: Db,
  email: string,
): Promise<{ userId: string | null; token: string | null }> {
  const user = await db.user.findFirst({
    where: { email: email.trim().toLowerCase(), deletedAt: null, active: true },
  });
  if (!user) return { userId: null, token: null };

  // Um pedido novo invalida os anteriores ainda abertos, para não deixar
  // vários links válidos circulando por e-mail.
  await db.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });

  const token = randomBytes(32).toString('base64url');
  const ttlMs = env.PASSWORD_RESET_TTL_MINUTES * 60 * 1000;
  await db.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + ttlMs),
      // Pedido do próprio titular: não há terceiro solicitante.
      requestedBy: null,
    },
  });

  // Token no fragmento (#), não na query: o fragmento não é enviado ao servidor,
  // então o token não entra no log de requisição, no Referer nem em log de proxy.
  const link = `${env.APP_ORIGIN}/login.dc.html#reset=${encodeURIComponent(token)}`;
  const minutes = env.PASSWORD_RESET_TTL_MINUTES;

  // Contas declaradas em PASSWORD_RESET_VIA_GESTOR não têm caixa que alguém leia,
  // então o link nem é tentado nelas: vai direto para os gestores, que repassam ao
  // responsável. Enviar ao titular deixaria um link válido parado numa caixa que
  // ninguém abre. Ver docs/AUTENTICACAO_E_PERMISSOES.md.
  const semCaixaPropria = env.PASSWORD_RESET_VIA_GESTOR.has(user.email.toLowerCase());

  // Envio sem await: a resposta não espera o SMTP. Além de não travar a requisição,
  // isso encurta a diferença de tempo entre e-mail existente e inexistente, que de
  // outro modo permitiria descobrir quem tem conta medindo a demora.
  void (async () => {
    if (!semCaixaPropria) {
      const enviado = await sendMail({
        to: user.email,
        subject: 'Diário Dev: redefinição de senha',
        text: [
          `Olá, ${user.name}.`,
          '',
          'Recebemos um pedido para redefinir a senha da sua conta no Diário Dev.',
          `Abra o endereço abaixo para cadastrar uma nova senha. O link vale ${minutes} minutos e só pode ser usado uma vez.`,
          '',
          link,
          '',
          'Se não foi você que pediu, ignore esta mensagem. Sua senha atual continua válida.',
          '',
          'Diário Dev ITS',
        ].join('\n'),
      });
      if (enviado) {
        // Registrar o sucesso é o que permite distinguir "enviado" de "não existe
        // conta para esse e-mail", que sem isso ficam os dois sem rastro no log.
        logger.info({ userId: user.id }, 'e-mail de redefinição de senha enviado');
        return;
      }
      logger.warn({ userId: user.id }, 'envio ao titular falhou; tentando pelos gestores');
    }

    // Destino alternativo: os gestores ativos. É o papel, não um endereço fixo.
    const gestores = await db.user.findMany({
      where: { effectiveLevel: 'GESTOR', active: true, deletedAt: null, id: { not: user.id } },
      select: { email: true },
    });
    const destinos = gestores.map((g) => g.email).filter(Boolean);
    if (destinos.length === 0) {
      logger.error(
        { userId: user.id },
        'reset solicitado para conta sem caixa própria, mas não há gestor ativo para receber o link',
      );
      if (!isProduction) logger.warn({ resetLink: link }, 'link de redefinição (apenas desenvolvimento)');
      return;
    }

    const enviadoGestor = await sendMail({
      to: destinos.join(', '),
      subject: `Diário Dev: redefinição de senha de ${user.name}`,
      text: [
        'Olá.',
        '',
        `Foi solicitada a redefinição de senha da conta de ${user.name} (${user.email}), que não recebe e-mail.`,
        `Repasse o endereço abaixo ao responsável por essa conta. O link vale ${minutes} minutos e só pode ser usado uma vez.`,
        '',
        link,
        '',
        'Quem abrir este link define uma nova senha para essa conta. Não encaminhe para mais ninguém.',
        '',
        'Diário Dev ITS',
      ].join('\n'),
    });

    if (enviadoGestor) {
      logger.info({ userId: user.id, gestores: destinos.length }, 'link de redefinição enviado aos gestores');
    } else {
      logger.error({ userId: user.id }, 'reset solicitado, mas nem o titular nem os gestores receberam o link');
      if (!isProduction) logger.warn({ resetLink: link }, 'link de redefinição (apenas desenvolvimento)');
    }
  })();

  return { userId: user.id, token };
}

// Confirma um reset de senha via token (§15). Marca o token como usado e
// revoga todas as sessões do usuário.
export async function confirmPasswordReset(db: Db, token: string, newPassword: string): Promise<void> {
  if (newPassword.length < 8) throw Errors.validation([{ field: 'newPassword', message: 'Mínimo de 8 caracteres.' }]);
  if (isTrivialPassword(newPassword)) {
    throw Errors.validation([{ field: 'newPassword', message: 'Senha muito comum.' }]);
  }
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
    throw Errors.unauthorized('Token de redefinição inválido ou expirado.');
  }
  const passwordHash = await hashPassword(newPassword);
  await db.$transaction([
    db.user.update({ where: { id: record.userId }, data: { passwordHash, passwordChangedAt: new Date() } }),
    db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    db.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
}

// Carrega o usuário autenticado a partir do access token (usado no guard).
export async function loadAuthUser(db: Db, userId: string, sessionId: string): Promise<AuthUser | null> {
  const user = await db.user.findFirst({ where: { id: userId, deletedAt: null, active: true } });
  if (!user) return null;
  return toAuthUser(user, sessionId);
}
