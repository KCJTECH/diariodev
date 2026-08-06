// Publicador da outbox (§13.16, §18). Em intervalos, reivindica eventos ainda
// não publicados (FOR UPDATE SKIP LOCKED, seguro com várias instâncias),
// emite via Socket.IO às salas de destino e marca como publicados. Entrega
// "pelo menos uma vez": o cliente deduplica por eventId/clientMutationId.
import { Prisma } from '@prisma/client';
import type { Server } from 'socket.io';
import type { Db } from '../../common/database/prisma.js';
import { logger } from '../../common/logging/logger.js';
import { eventRooms } from './rooms.js';
import { enqueueWebhooks } from '../integrations/webhook/dispatch.js';

type OutboxRow = {
  id: string;
  sequence: bigint;
  event_name: string;
  payload: unknown;
  scope: { type: string; id: string | null } | null;
  created_at: Date;
};

const BATCH = 100;
const INTERVAL_MS = 750;

export function startOutboxPublisher(io: Server, db: Db): () => void {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  async function tick(): Promise<void> {
    if (stopped) return;
    let claimed: OutboxRow[] = [];
    try {
      await db.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<OutboxRow[]>`
          SELECT id, sequence, event_name, payload, scope, created_at
          FROM outbox_events
          WHERE published_at IS NULL
          ORDER BY sequence ASC
          LIMIT ${BATCH}
          FOR UPDATE SKIP LOCKED`;
        if (rows.length === 0) return;

        for (const r of rows) {
          const rooms = eventRooms(r.event_name, r.scope);
          io.to(rooms).emit('dv:event', {
            eventId: r.id,
            event: r.event_name,
            occurredAt: r.created_at.toISOString(),
            cursor: r.sequence.toString(),
            scope: r.scope ?? null,
            data: r.payload,
          });

          // Sessão revogada derruba os sockets abertos do usuário (§18.1). Não é
          // logout à força: quem ainda tem sessão válida reconecta e o handshake
          // aprova de novo; quem foi revogado é recusado, porque o handshake
          // passou a validar a sessão. Com o adaptador Redis, vale entre instâncias.
          if (r.event_name === 'session.revoked' && r.scope?.id) {
            io.in(`user:${r.scope.id}`).disconnectSockets(true);
          }
        }

        const ids = rows.map((r) => Prisma.sql`${r.id}::uuid`);
        await tx.$executeRaw`
          UPDATE outbox_events SET published_at = now()
          WHERE id IN (${Prisma.join(ids)})`;
        claimed = rows;
      });

      // Despacho de webhooks fora da transação (entrega assíncrona via fila).
      for (const r of claimed) {
        try {
          await enqueueWebhooks(db, r.event_name, r.id, r.payload);
        } catch (err) {
          logger.error({ err, event: r.event_name }, 'falha ao enfileirar webhook');
        }
      }
    } catch (err) {
      logger.error({ err }, 'falha no publicador da outbox');
    }
    if (!stopped) timer = setTimeout(() => void tick(), INTERVAL_MS);
  }

  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
