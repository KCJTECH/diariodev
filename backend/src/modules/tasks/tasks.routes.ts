// Rotas de tarefas sob /api/v1/tasks. Exigem autenticação; planejamento e
// exclusão exigem gestor+ (validado no serviço).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../../common/database/prisma.js';
import { ok, paginated } from '../../common/http/envelope.js';
import { requestMeta } from '../../common/http/request-meta.js';
import * as svc from './tasks.service.js';

const priority = z.enum(['baixa', 'média', 'alta']);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const listQuery = z.object({
  project: z.string().max(120).optional(),
  person: z.string().max(60).optional(),
  status: z.enum(['open', 'late', 'done']).optional(),
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().optional(),
});

const writeBody = z.object({
  title: z.string().min(1).max(300),
  desc: z.string().max(5000).optional(),
  proj: z.string().min(1).max(120),
  who: z.string().max(60).nullable().optional(),
  due: dateOnly.nullable().optional(),
  pri: priority,
  cat: z.string().max(60).nullable().optional(),
  clientMutationId: z.string().max(100).optional(),
});
const updateBody = writeBody.extend({ version: z.number().int().positive() });
const idParam = z.object({ id: z.string().uuid() });

export function registerTaskRoutes(app: FastifyInstance, db: Db): void {
  app.addHook('preHandler', app.authenticate);

  app.get('/', async (req) => {
    const f = listQuery.parse(req.query);
    const r = await svc.listTasks(db, req.authUser!, f);
    return paginated(r.items, req.id, r.page, r.perPage, r.total);
  });

  app.get('/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    return ok(await svc.getTask(db, req.authUser!, id), req.id);
  });

  app.post('/', async (req, reply) => {
    const body = writeBody.parse(req.body);
    const dto = await svc.createTask(db, req.authUser!, body, requestMeta(req));
    reply.code(201);
    return ok(dto, req.id);
  });

  app.patch('/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const { version, ...body } = updateBody.parse(req.body);
    return ok(await svc.updateTask(db, req.authUser!, id, body, version, requestMeta(req)), req.id);
  });

  app.post('/:id/complete', async (req) => {
    const { id } = idParam.parse(req.params);
    return ok(await svc.completeTask(db, req.authUser!, id, requestMeta(req)), req.id);
  });

  app.post('/:id/reopen', async (req) => {
    const { id } = idParam.parse(req.params);
    return ok(await svc.reopenTask(db, req.authUser!, id, requestMeta(req)), req.id);
  });

  app.delete('/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    await svc.removeTask(db, req.authUser!, id, requestMeta(req));
    reply.code(204);
    return null;
  });
}
