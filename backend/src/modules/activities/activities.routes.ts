// Rotas de atividades sob /api/v1/activities. Todas exigem autenticação; o
// escopo por nível é aplicado no serviço.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../../common/database/prisma.js';
import { ok, paginated } from '../../common/http/envelope.js';
import { requestMeta } from '../../common/http/request-meta.js';
import * as svc from './activities.service.js';

const priority = z.enum(['baixa', 'média', 'alta']);

const listQuery = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  person: z.string().max(60).optional(),
  project: z.string().max(120).optional(),
  category: z.string().max(60).optional(),
  q: z.string().max(200).optional(),
  priority: priority.optional(),
  tags: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').map((t) => t.trim()).filter(Boolean) : undefined)),
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().optional(),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

const writeBody = z.object({
  proj: z.string().min(1).max(120),
  cat: z.string().min(1).max(60),
  title: z.string().min(1).max(300),
  desc: z.string().max(5000).optional(),
  occurredAt: z.string().datetime({ offset: true }),
  durationMinutes: z.number().int().min(0).max(100000).nullable().optional(),
  priority,
  tags: z.array(z.string().max(40)).max(30).optional(),
  clientMutationId: z.string().max(100).optional(),
  sourceTaskId: z.string().uuid().nullable().optional(),
});

const updateBody = writeBody.extend({ version: z.number().int().positive() });
const idParam = z.object({ id: z.string().uuid() });

export function registerActivityRoutes(app: FastifyInstance, db: Db): void {
  app.addHook('preHandler', app.authenticate);

  app.get('/', async (req) => {
    const f = listQuery.parse(req.query);
    const r = await svc.listActivities(db, req.authUser!, f);
    return paginated(r.items, req.id, r.page, r.perPage, r.total);
  });

  app.get('/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    return ok(await svc.getActivity(db, req.authUser!, id), req.id);
  });

  app.post('/', async (req, reply) => {
    const body = writeBody.parse(req.body);
    const dto = await svc.createActivity(db, req.authUser!, body, requestMeta(req));
    reply.code(201);
    return ok(dto, req.id);
  });

  app.patch('/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const { version, ...body } = updateBody.parse(req.body);
    return ok(await svc.updateActivity(db, req.authUser!, id, body, version, requestMeta(req)), req.id);
  });

  app.delete('/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    await svc.removeActivity(db, req.authUser!, id, requestMeta(req));
    reply.code(204);
    return null;
  });
}
