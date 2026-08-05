// GET /api/v1/sync?cursor= (§17.14). Após reconectar o Socket.IO, o cliente
// pede os eventos publicados com sequence > cursor. Retorna apenas os eventos
// cujas salas o usuário tem direito de receber (mesma regra do publicador),
// evitando vazamento.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../../common/database/prisma.js';
import { ok } from '../../common/http/envelope.js';
import { eventRooms, userRooms } from './rooms.js';

const query = z.object({ cursor: z.string().regex(/^\d+$/).optional() });
const MAX = 500;

export function registerSyncRoutes(app: FastifyInstance, db: Db): void {
  app.addHook('preHandler', app.authenticate);

  app.get('/', async (req) => {
    const { cursor } = query.parse(req.query);
    const since = cursor ? BigInt(cursor) : 0n;

    const rows = await db.outboxEvent.findMany({
      where: { publishedAt: { not: null }, sequence: { gt: since } },
      orderBy: { sequence: 'asc' },
      take: MAX,
    });

    const allowed = new Set(await userRooms(db, req.authUser!));
    const events = [];
    let lastCursor = since;
    for (const r of rows) {
      lastCursor = r.sequence;
      const scope = (r.scope as { type: string; id: string | null } | null) ?? null;
      const rooms = eventRooms(r.eventName, scope);
      if (!rooms.some((room) => allowed.has(room))) continue;
      events.push({
        eventId: r.id,
        event: r.eventName,
        occurredAt: r.createdAt.toISOString(),
        cursor: r.sequence.toString(),
        scope,
        data: r.payload,
      });
    }

    return ok({ events, cursor: lastCursor.toString() }, req.id);
  });
}
