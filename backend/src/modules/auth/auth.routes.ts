// Rotas de autenticação sob /api/v1/auth. Validação com Zod; rate limit
// específico em login, refresh e troca de senha (§26.2). Auditoria dos eventos.
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Db } from '../../common/database/prisma.js';
import { ok } from '../../common/http/envelope.js';
import { Errors } from '../../common/errors/app-error.js';
import { hashIp } from '../../common/auth/tokens.js';
import { setAuthCookies, clearAuthCookies, REFRESH_COOKIE } from './auth.cookies.js';
import * as auth from './auth.service.js';
import { writeAudit } from '../audit/audit.service.js';
import { env } from '../../config/env.js';

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1).max(200) });
const devLoginSchema = z.object({ publicKey: z.string().min(1).max(60) });
const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});
const tight = { rateLimit: { max: 10, timeWindow: '1 minute' } };
// Rota pública que dispara e-mail: limite menor que o das demais, para não virar
// ferramenta de disparo em massa nem sonda de enumeração de contas.
const resetRequest = { rateLimit: { max: 5, timeWindow: '15 minutes' } };
const resetRequestSchema = z.object({ email: z.string().email().max(200) });
const resetConfirmSchema = z.object({
  token: z.string().min(10).max(200),
  newPassword: z.string().min(8).max(200),
});

function ctxOf(req: FastifyRequest): { ua: string | undefined; ip: string | undefined } {
  return { ua: req.headers['user-agent'], ip: req.ip };
}

export function registerAuthRoutes(app: FastifyInstance, db: Db): void {
  app.post('/login', { config: tight }, async (req, reply) => {
    const { email, password } = loginSchema.parse(req.body);
    const result = await auth.login(db, email, password, ctxOf(req));
    setAuthCookies(reply, result.accessToken, result.refreshToken);
    await writeAudit(db, {
      actorUserId: result.user.id,
      action: 'auth.login',
      entityType: 'user',
      entityId: result.user.id,
      requestId: req.id,
      ipHash: hashIp(req.ip),
      userAgent: req.headers['user-agent'] ?? null,
    });
    return ok({ user: result.user }, req.id);
  });

  // Lista de colaboradores para o atalho "entrar como" da tela de login.
  // Só existe em desenvolvimento (ALLOW_DEV_LOGIN); 404 em produção.
  app.get('/dev-accounts', async (req) => {
    if (!env.ALLOW_DEV_LOGIN) throw Errors.notFound('NOT_FOUND', 'Recurso não encontrado.');
    const rows = await db.user.findMany({
      where: { deletedAt: null, active: true },
      select: { publicKey: true, name: true, roleTitle: true, email: true, initials: true, color: true, effectiveLevel: true },
      orderBy: { name: 'asc' },
    });
    const data = rows.map((u) => ({
      id: u.publicKey, name: u.name, role: u.roleTitle, email: u.email,
      ini: u.initials, color: u.color, active: true,
      level: u.effectiveLevel === 'CEO' ? 'ceo' : u.effectiveLevel === 'GESTOR' ? 'gestor' : 'dev',
    }));
    return ok(data, req.id);
  });

  app.post('/dev-login', { config: tight }, async (req, reply) => {
    if (!env.ALLOW_DEV_LOGIN) throw Errors.notFound('NOT_FOUND', 'Recurso não encontrado.');
    const { publicKey } = devLoginSchema.parse(req.body);
    const result = await auth.devLogin(db, publicKey, ctxOf(req));
    setAuthCookies(reply, result.accessToken, result.refreshToken);
    return ok({ user: result.user }, req.id);
  });

  app.post('/refresh', { config: tight }, async (req, reply) => {
    const token = req.cookies[REFRESH_COOKIE];
    const result = await auth.refresh(db, token, ctxOf(req));
    setAuthCookies(reply, result.accessToken, result.refreshToken);
    return ok({ user: result.user }, req.id);
  });

  app.post('/logout', async (req, reply) => {
    const token = req.cookies[REFRESH_COOKIE];
    await auth.logout(db, token);
    clearAuthCookies(reply);
    return ok({ ok: true }, req.id);
  });

  // Solicitação de redefinição pela tela de entrada. Rota pública, por isso o
  // rate limit é mais apertado. A resposta é sempre a mesma, com ou sem conta
  // para o e-mail informado, e nunca contém o token nem o id do usuário.
  app.post('/password-reset/request', { config: resetRequest }, async (req) => {
    const { email } = resetRequestSchema.parse(req.body);
    const result = await auth.requestPasswordReset(db, email);
    if (result.userId) {
      await writeAudit(db, {
        actorUserId: result.userId,
        action: 'auth.password_reset_requested',
        entityType: 'user',
        entityId: result.userId,
        requestId: req.id,
        ipHash: hashIp(req.ip),
        userAgent: req.headers['user-agent'] ?? null,
      });
    }
    return ok({ ok: true }, req.id);
  });

  app.post('/password-reset/confirm', { config: tight }, async (req) => {
    const { token, newPassword } = resetConfirmSchema.parse(req.body);
    await auth.confirmPasswordReset(db, token, newPassword);
    return ok({ ok: true }, req.id);
  });

  app.get('/me', { preHandler: app.authenticate }, async (req) => {
    return ok({ user: req.authUser }, req.id);
  });

  app.post('/password', { preHandler: app.authenticate, config: tight }, async (req) => {
    const { currentPassword, newPassword } = passwordSchema.parse(req.body);
    const u = req.authUser!;
    await auth.changePassword(db, u.id, u.sessionId, currentPassword, newPassword);
    await writeAudit(db, {
      actorUserId: u.id,
      action: 'auth.password_changed',
      entityType: 'user',
      entityId: u.id,
      requestId: req.id,
      ipHash: hashIp(req.ip),
      userAgent: req.headers['user-agent'] ?? null,
    });
    return ok({ ok: true }, req.id);
  });
}
