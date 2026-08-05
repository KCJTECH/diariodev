// Rotas de usuários sob /api/v1/users. Listagem exige autenticação; escrita
// exige gestor+. O :id é a chave pública (publicKey), como o frontend usa.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../../common/database/prisma.js';
import { ok } from '../../common/http/envelope.js';
import { Errors } from '../../common/errors/app-error.js';
import { requestMeta } from '../../common/http/request-meta.js';
import { userSelect, userToPerson } from './users.mapper.js';
import * as svc from './users.service.js';

const level = z.enum(['dev', 'gestor', 'ceo']);
const createBody = z.object({
  name: z.string().min(1).max(120),
  role: z.string().min(1).max(120),
  email: z.string().email(),
  initials: z.string().max(3).optional(),
  color: z.string().max(40).optional(),
  level: level.optional(),
  active: z.boolean().optional(),
});
const updateBody = createBody.partial();
const keyParam = z.object({ id: z.string().min(1).max(60) });
const setPasswordBody = z.object({ newPassword: z.string().min(8).max(200) });

// As duas rotas que mexem em senha de outro colaborador têm limite próprio: são
// alvo óbvio para tentativa de tomada de conta a partir de uma sessão obtida.
const tight = { rateLimit: { max: 10, timeWindow: '1 minute' } };

export function registerUserRoutes(app: FastifyInstance, db: Db): void {
  app.addHook('preHandler', app.authenticate);

  app.get('/', async (req) => ok(await svc.listUsers(db), req.id));

  app.get('/:id', async (req) => {
    const { id } = keyParam.parse(req.params);
    const row = await db.user.findFirst({ where: { publicKey: id, deletedAt: null }, select: userSelect });
    if (!row) throw Errors.notFound('USER_NOT_FOUND', 'Usuário não encontrado.');
    return ok(userToPerson(row), req.id);
  });

  app.post('/', { preHandler: app.requireLevel('gestor') }, async (req, reply) => {
    const body = createBody.parse(req.body);
    const result = await svc.createUser(db, req.authUser!, body, requestMeta(req));
    reply.code(201);
    return ok(result, req.id);
  });

  app.patch('/:id', { preHandler: app.requireLevel('gestor') }, async (req) => {
    const { id } = keyParam.parse(req.params);
    const body = updateBody.parse(req.body);
    return ok(await svc.updateUser(db, req.authUser!, id, body, requestMeta(req)), req.id);
  });

  app.delete('/:id', { preHandler: app.requireLevel('gestor') }, async (req) => {
    const { id } = keyParam.parse(req.params);
    await svc.deactivateUser(db, req.authUser!, id, requestMeta(req));
    return ok({ ok: true }, req.id);
  });

  app.post('/:id/password-reset', { preHandler: app.requireLevel('gestor'), config: tight }, async (req) => {
    const { id } = keyParam.parse(req.params);
    return ok(await svc.adminResetPassword(db, req.authUser!, id, requestMeta(req)), req.id);
  });

  // Define a senha do colaborador direto, para os campos de senha da tela de
  // administração. Só age sobre nível estritamente menor e nunca sobre a própria
  // conta; as duas regras estão em users.service (assertCanActOnPassword).
  app.post('/:id/password', { preHandler: app.requireLevel('gestor'), config: tight }, async (req) => {
    const { id } = keyParam.parse(req.params);
    const { newPassword } = setPasswordBody.parse(req.body);
    await svc.setUserPassword(db, req.authUser!, id, newPassword, requestMeta(req));
    return ok({ ok: true }, req.id);
  });
}
