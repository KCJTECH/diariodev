// Escrita de eventos no padrão outbox transacional (§13.16). A gravação do dado
// e do evento ocorre na MESMA transação; um publicador (Fase 6/7) drena a
// tabela e entrega via Socket.IO/webhook. Aqui só persistimos o evento.
import type { Prisma } from '@prisma/client';

export type OutboxScope = { type: string; id: string | null };

export type OutboxInput = {
  eventName: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  scope?: OutboxScope | null;
};

// Recebe o client de transação do Prisma para garantir atomicidade.
export async function writeOutbox(tx: Prisma.TransactionClient, input: OutboxInput): Promise<void> {
  await tx.outboxEvent.create({
    data: {
      eventName: input.eventName,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      payload: input.payload as never,
      scope: (input.scope ?? undefined) as never,
    },
  });
}
