// Rotas de integrações sob /api/v1. Todas exigem gestor+. O teste de disparo
// (POST /:id/test) chega na Fase 7 junto com a entrega confiável de webhooks.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../../common/database/prisma.js';
import { ok } from '../../common/http/envelope.js';
import { requestMeta } from '../../common/http/request-meta.js';
import * as svc from './integrations.service.js';

const writeBody = z.object({
  name: z.string().min(1).max(120),
  abbr: z.string().max(10).nullable().optional(),
  type: z.string().min(1).max(40),
  enabled: z.boolean().optional(),
  endpoint: z.string().max(500).nullable().optional(),
  events: z.array(z.string().max(60)).max(50).optional(),
  notes: z.string().max(2000).nullable().optional(),
  secret: z.string().max(500).optional(),
});
const updateBody = writeBody.partial();
const idParam = z.object({ id: z.string().uuid() });

export function registerIntegrationRoutes(app: FastifyInstance, db: Db): void {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireLevel('gestor'));

  app.get('/', async (req) => ok(await svc.listIntegrations(db), req.id));

  app.post('/', async (req, reply) => {
    const body = writeBody.parse(req.body);
    reply.code(201);
    return ok(await svc.createIntegration(db, req.authUser!, body, requestMeta(req)), req.id);
  });

  app.patch('/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const body = updateBody.parse(req.body);
    return ok(await svc.updateIntegration(db, req.authUser!, id, body, requestMeta(req)), req.id);
  });

  app.delete('/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    await svc.deleteIntegration(db, req.authUser!, id, requestMeta(req));
    return ok({ ok: true }, req.id);
  });

  app.post('/:id/test', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const { id } = idParam.parse(req.params);
    return ok(await svc.testIntegration(db, req.authUser!, id, requestMeta(req)), req.id);
  });
}

// Histórico de execuções fica sob /api/v1/integration-runs (§17.10).
export function registerIntegrationRunRoutes(app: FastifyInstance, db: Db): void {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireLevel('gestor'));

  const query = z.object({ limit: z.coerce.number().int().positive().max(200).optional() });
  app.get('/', async (req) => {
    const { limit } = query.parse(req.query);
    return ok(await svc.listRuns(db, limit ?? 50), req.id);
  });
}
