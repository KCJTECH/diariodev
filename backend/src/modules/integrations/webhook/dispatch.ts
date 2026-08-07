// Enfileira webhooks para as integrações habilitadas que assinam o evento.
// Chamado pelo publicador da outbox após o commit (entrega assíncrona via fila).
import type { Db } from '../../../common/database/prisma.js';
import { webhookQueue } from './queue.js';
import { toExternalEvent } from './events.js';

// Filtro por projeto: integração com projetos escolhidos só recebe eventos
// daqueles projetos. Lista vazia significa todos, para não alterar o
// comportamento das integrações que já existem. Evento sem projeto no escopo (o
// resumo diário, por exemplo) passa sempre: restringi-lo por projeto silenciaria
// a integração sem nenhuma explicação visível na tela.
export function atendeProjeto(projectIds: string[], eventProjectId?: string): boolean {
  if (projectIds.length === 0) return true;
  if (!eventProjectId) return true;
  return projectIds.includes(eventProjectId);
}

export async function enqueueWebhooks(
  db: Db,
  internalEvent: string,
  eventId: string | null,
  payload: unknown,
  scope?: { type?: string; id?: string | null } | null,
): Promise<void> {
  const external = toExternalEvent(internalEvent);
  if (!external) return;

  const integrations = await db.integration.findMany({
    where: { deletedAt: null, enabled: true, events: { has: external }, endpoint: { not: null } },
    select: { id: true, maxAttempts: true, projectIds: true },
  });

  const projetoDoEvento = scope?.type === 'project' ? (scope.id ?? undefined) : undefined;
  const alvos = integrations.filter((i) => atendeProjeto(i.projectIds, projetoDoEvento));

  for (const i of alvos) {
    await webhookQueue.add(
      external,
      { integrationId: i.id, externalEvent: external, eventId, payload },
      { attempts: i.maxAttempts },
    );
  }
}
