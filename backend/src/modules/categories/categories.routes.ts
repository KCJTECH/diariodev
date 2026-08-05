// Rotas de categorias sob /api/v1/categories. Leitura autenticada; escrita gestor+.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../../common/database/prisma.js';
import { ok } from '../../common/http/envelope.js';
import { requestMeta } from '../../common/http/request-meta.js';
import * as svc from './categories.service.js';

const writeBody = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(500).nullable().optional(),
  color: z.string().max(40).nullable().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});
const updateBody = writeBody.partial();
const idParam = z.object({ id: z.string().uuid() });

export function registerCategoryRoutes(app: FastifyInstance, db: Db): void {
  app.addHook('preHandler', app.authenticate);

  app.get('/', async (req) => ok(await svc.listCategories(db), req.id));

  app.post('/', { preHandler: app.requireLevel('gestor') }, async (req, reply) => {
    const body = writeBody.parse(req.body);
    reply.code(201);
    return ok(await svc.createCategory(db, req.authUser!, body, requestMeta(req)), req.id);
  });

  app.patch('/:id', { preHandler: app.requireLevel('gestor') }, async (req) => {
    const { id } = idParam.parse(req.params);
    const body = updateBody.parse(req.body);
    return ok(await svc.updateCategory(db, req.authUser!, id, body, requestMeta(req)), req.id);
  });

  app.delete('/:id', { preHandler: app.requireLevel('gestor') }, async (req) => {
    const { id } = idParam.parse(req.params);
    await svc.archiveCategory(db, req.authUser!, id, requestMeta(req));
    return ok({ ok: true }, req.id);
  });
}
