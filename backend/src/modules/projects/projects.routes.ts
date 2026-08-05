// Rotas de projetos sob /api/v1/projects. Leitura autenticada (com escopo);
// escrita gestor+.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../../common/database/prisma.js';
import { ok } from '../../common/http/envelope.js';
import { requestMeta } from '../../common/http/request-meta.js';
import * as svc from './projects.service.js';

const writeBody = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).nullable().optional(),
  active: z.boolean().optional(),
});
const updateBody = writeBody.partial();
const idParam = z.object({ id: z.string().uuid() });

export function registerProjectRoutes(app: FastifyInstance, db: Db): void {
  app.addHook('preHandler', app.authenticate);

  app.get('/', async (req) => ok(await svc.listProjects(db, req.authUser!), req.id));

  app.post('/', { preHandler: app.requireLevel('gestor') }, async (req, reply) => {
    const body = writeBody.parse(req.body);
    reply.code(201);
    return ok(await svc.createProject(db, req.authUser!, body, requestMeta(req)), req.id);
  });

  app.patch('/:id', { preHandler: app.requireLevel('gestor') }, async (req) => {
    const { id } = idParam.parse(req.params);
    const body = updateBody.parse(req.body);
    return ok(await svc.updateProject(db, req.authUser!, id, body, requestMeta(req)), req.id);
  });

  app.delete('/:id', { preHandler: app.requireLevel('gestor') }, async (req) => {
    const { id } = idParam.parse(req.params);
    await svc.archiveProject(db, req.authUser!, id, requestMeta(req));
    return ok({ ok: true }, req.id);
  });
}
