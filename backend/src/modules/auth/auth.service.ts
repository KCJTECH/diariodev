// Regras de autenticação e sessão. O access token é JWT curto; o refresh é
// opaco, guardado apenas como hash, rotacionado a cada uso, com detecção de
// reuso (§15.2). Toda autorização real acontece no servidor.
import type { Prisma, User } from '@prisma/client';
import type { Db } from '../../common/database/prisma.js';
import { redis } from '../../common/database/redis.js';
import { AppError, Errors } from '../../common/errors/app-error.js';
import { logger } from '../../common/logging/logger.js';
import { hashPassword, verifyPassword, isTrivialPassword } from '../../common/auth/password.js';
import {
  signAccessToken,
  generateRefreshToken,
  sha256,
  hashIp,
} from '../../common/auth/tokens.js';
import { LEVEL_TO_API, type AuthUser } from '../../common/auth/types.js';
import { writeOutbox } from '../../common/events/outbox.js';
import { env } from '../../config/env.js';

export type AuthResult = { user: AuthUser; accessToken: string; refreshToken: string };
type Ctx = { ua?: string | undefined; ip?: string | undefined };

// Contador de falhas de login por conta, em Redis. Falha aberta de propósito: se
// o Redis estiver fora, o login continua funcionando sem o bloqueio, porque
// indisponibilizar a autenticação inteira seria pior que perder a contagem.
const chaveFalha = (email: string): string => `login:fail:${email}`;

async function assertNotLocked(email: string): Promise<void> {
  try {
    const atual = await redis.get(chaveFalha(email));
    if (atual && Number(atual) >= env.LOGIN_MAX_ATTEMPTS) {
      throw Errors.rateLimited(
        `Muitas tentativas para esta conta. Aguarde ${env.LOGIN_LOCK_MINUTES} minutos.`,
      );
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.warn({ err: (err as Error).message }, 'contador de tentativas de login indisponível');
  }
}

async function registerFailure(email: string): Promise<void> {
  try {
    const chave = chaveFalha(email);
    const total = await redis.incr(chave);
    // A janela recomeça a cada falha: tentativas seguidas prolongam o bloqueio.
    await redis.expire(chave, env.LOGIN_LOCK_MINUTES * 60);
    if (total === env.LOGIN_MAX_ATTEMPTS) {
      logger.warn({ tentativas: total }, 'conta bloqueada temporariamente por tentativas de login');
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'não foi possível registrar tentativa de login');
  }
}

async function clearFailures(email: string): Promise<void> {
  try {
    await redis.del(chaveFalha(email));
  } catch {
    // Sem efeito prático: a chave expira sozinha.
  }
}

// Evento de sessão revogada (§18.3), na mesma transação da revogação. O
// publicador da outbox usa este evento para derrubar os sockets abertos do
// usuário: sem isso, um socket já conectado sobreviveria ao logout, à troca de
// senha e à desativação da conta até o access token expirar.
export async function revokedEvent(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await writeOutbox(tx, {
    eventName: 'session.revoked',
    aggregateType: 'session',
    aggregateId: userId,
    payload: { userId },
    scope: { type: 'user', id: userId },
  });
}

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
  const alvo = email.toLowerCase();
  // Bloqueio por conta, e não só por IP: o limite por IP sozinho é contornável
  // distribuindo as tentativas, e não protege uma conta específica.
  await assertNotLocked(alvo);

  const user = await db.user.findFirst({ where: { email: alvo, deletedAt: null } });
  // Verifica sempre para reduzir enumeração de usuário por diferença de tempo.
  const ok = user ? await verifyPassword(user.passwordHash, password) : false;
  if (!user || !ok) {
    await registerFailure(alvo);
    throw Errors.invalidCredentials();
  }
  if (!user.active) throw Errors.forbidden('Usuário inativo.');

  await clearFailures(alvo);
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
    await db.$transaction(async (tx) => {
      await tx.session.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await revokedEvent(tx, session.userId);
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
  const session = await db.session.findFirst({
    where: { refreshTokenHash: sha256(refreshToken), revokedAt: null },
    select: { id: true, userId: true },
  });
  if (!session) return;
  await db.$transaction(async (tx) => {
    await tx.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    await revokedEvent(tx, session.userId);
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
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash, passwordChangedAt: new Date() } });
    // Invalida as demais sessões, preservando a atual (§15.1).
    await tx.session.updateMany({
      where: { userId, revokedAt: null, id: { not: sessionId } },
      data: { revokedAt: new Date() },
    });
    await revokedEvent(tx, userId);
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Carrega o usuário autenticado a partir do access token (usado no guard HTTP e
// no handshake do Socket.IO).
//
// A consulta é na sessão, não no usuário: antes daqui o guard só conferia se o
// usuário estava ativo, e o `sid` do token era repassado sem verificação. Com
// isso, um access token continuava autorizando por até ACCESS_TOKEN_TTL depois
// de logout, troca de senha, redefinição por link ou desativação da conta. É uma
// consulta só, como antes, porque a sessão traz o usuário incluído.
export async function loadAuthUser(db: Db, userId: string, sessionId: string): Promise<AuthUser | null> {
  // Claim malformado é 401, não 500 no Prisma.
  if (!UUID.test(userId) || !UUID.test(sessionId)) return null;

  const session = await db.session.findFirst({
    where: { id: sessionId, userId, revokedAt: null, expiresAt: { gt: new Date() } },
    include: { user: true },
  });
  if (!session || !session.user.active || session.user.deletedAt) return null;
  return toAuthUser(session.user, session.id);
}
