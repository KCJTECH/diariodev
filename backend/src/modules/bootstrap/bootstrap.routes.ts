// GET /api/v1/bootstrap — estado inicial do frontend. Exige autenticação.
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../common/database/prisma.js';
import { ok } from '../../common/http/envelope.js';
import { buildBootstrap } from './bootstrap.service.js';

export function registerBootstrapRoutes(app: FastifyInstance, db: Db): void {
  app.get('/', { preHandler: app.authenticate }, async (req) => {
    const data = await buildBootstrap(db, req.authUser!);
    return ok(data, req.id);
  });
}
