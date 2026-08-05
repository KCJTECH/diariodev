// Rotas de configuração/preferências sob /api/v1. Aparência: leitura
// autenticada, escrita gestor+. Preferências: sempre do próprio usuário.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../../common/database/prisma.js';
import { ok } from '../../common/http/envelope.js';
import * as svc from './settings.service.js';

const appearanceBody = z.object({
  mark: z.string().max(10).optional(),
  markImg: z.string().max(500000).optional(),
  name: z.string().max(120).optional(),
  sub: z.string().max(200).optional(),
  brand: z.string().max(40).optional(),
  accent: z.string().max(40).optional(),
  radius: z.number().int().min(0).max(40).optional(),
  density: z.string().max(20).optional(),
  sidebarStyle: z.string().max(20).optional(),
}).passthrough();

const prefsBody = z.object({
  collapsed: z.boolean().optional(),
  density: z.string().max(20).optional(),
  theme: z.enum(['light', 'dark']).optional(),
  defaultProjectId: z.string().uuid().nullable().optional(),
  extra: z.record(z.unknown()).optional(),
});

export function registerSettingsRoutes(app: FastifyInstance, db: Db): void {
  app.addHook('preHandler', app.authenticate);

  app.get('/settings/appearance', async (req) => ok(await svc.getAppearance(db), req.id));
  app.put(
    '/settings/appearance',
    { preHandler: app.requireLevel('gestor') },
    async (req) => ok(await svc.updateAppearance(db, req.authUser!, appearanceBody.parse(req.body)), req.id),
  );

  app.get('/preferences', async (req) => ok(await svc.getPreferences(db, req.authUser!), req.id));
  app.put('/preferences', async (req) => ok(await svc.updatePreferences(db, req.authUser!, prefsBody.parse(req.body)), req.id));
}
