// Rotas de relatórios sob /api/v1/reports. Exigem autenticação; o escopo por
// nível é aplicado no serviço (dev = visão pessoal).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../../common/database/prisma.js';
import { ok } from '../../common/http/envelope.js';
import * as svc from './reports.service.js';

const query = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  project: z.string().max(120).optional(),
  person: z.string().max(60).optional(),
  category: z.string().max(60).optional(),
});

export function registerReportRoutes(app: FastifyInstance, db: Db): void {
  app.addHook('preHandler', app.authenticate);

  app.get('/summary', async (req) => ok(await svc.summary(db, req.authUser!, query.parse(req.query)), req.id));
  app.get('/by-person', async (req) => ok(await svc.byPerson(db, req.authUser!, query.parse(req.query)), req.id));
  app.get('/by-project', async (req) => ok(await svc.byProject(db, req.authUser!, query.parse(req.query)), req.id));
  app.get('/by-category', async (req) => ok(await svc.byCategory(db, req.authUser!, query.parse(req.query)), req.id));
  app.get('/daily', async (req) => ok(await svc.daily(db, req.authUser!, query.parse(req.query)), req.id));
}
