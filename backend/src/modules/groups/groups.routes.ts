// Rotas de grupos sob /api/v1/groups. Todas exigem gestor+.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../../common/database/prisma.js';
import { ok } from '../../common/http/envelope.js';
import { requestMeta } from '../../common/http/request-meta.js';
import * as svc from './groups.service.js';

const level = z.enum(['dev', 'gestor', 'ceo']);
const writeBody = z.object({
  name: z.string().min(1).max(120),
  desc: z.string().max(500).optional(),
  level,
  perms: z.array(z.string().max(60)).max(50).optional(),
});
const updateBody = writeBody.partial();
const membersBody = z.object({ members: z.array(z.string().max(60)).max(200) });
const idParam = z.object({ id: z.string().uuid() });

export function registerGroupRoutes(app: FastifyInstance, db: Db): void {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireLevel('gestor'));

  app.get('/', async (req) => ok(await svc.listGroups(db), req.id));

  app.post('/', async (req, reply) => {
    const body = writeBody.parse(req.body);
    reply.code(201);
    return ok(await svc.createGroup(db, req.authUser!, body, requestMeta(req)), req.id);
  });

  app.patch('/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const body = updateBody.parse(req.body);
    return ok(await svc.updateGroup(db, req.authUser!, id, body, requestMeta(req)), req.id);
  });

  app.put('/:id/members', async (req) => {
    const { id } = idParam.parse(req.params);
    const { members } = membersBody.parse(req.body);
    return ok(await svc.setGroupMembers(db, req.authUser!, id, members, requestMeta(req)), req.id);
  });

  app.delete('/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    await svc.deleteGroup(db, req.authUser!, id, requestMeta(req));
    return ok({ ok: true }, req.id);
  });
}
