// Enfileira webhooks para as integrações habilitadas que assinam o evento.
// Chamado pelo publicador da outbox após o commit (entrega assíncrona via fila).
import type { Db } from '../../../common/database/prisma.js';
import { webhookQueue } from './queue.js';
import { toExternalEvent } from './events.js';

export async function enqueueWebhooks(
  db: Db,
  internalEvent: string,
  eventId: string | null,
  payload: unknown,
): Promise<void> {
  const external = toExternalEvent(internalEvent);
  if (!external) return;

  const integrations = await db.integration.findMany({
    where: { deletedAt: null, enabled: true, events: { has: external }, endpoint: { not: null } },
    select: { id: true, maxAttempts: true },
  });
  for (const i of integrations) {
    await webhookQueue.add(
      external,
      { integrationId: i.id, externalEvent: external, eventId, payload },
      { attempts: i.maxAttempts },
    );
  }
}
