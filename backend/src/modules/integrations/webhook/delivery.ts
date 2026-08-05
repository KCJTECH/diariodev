// Entrega de um webhook (uma tentativa). Valida SSRF, assina com HMAC, aplica
// timeout e limite de redirecionamento, registra a execução em integration_runs
// e publica integration.run.updated para o realtime dos administradores.
import { IntegrationRunStatus, type Integration } from '@prisma/client';
import type { Db } from '../../../common/database/prisma.js';
import { logger } from '../../../common/logging/logger.js';
import { decryptSecret } from '../../../common/utils/crypto.js';
import { assertSafeUrl, signPayload, SsrfError } from './security.js';

export type DeliverInput = {
  integration: Integration;
  externalEvent: string;
  eventId: string | null;
  payload: unknown;
  attempt: number;
  isFinalAttempt: boolean;
};

export type DeliverResult = { ok: boolean; httpStatus?: number; errorCode?: string };

const MAX_EXCERPT = 500;

export async function deliverWebhook(db: Db, input: DeliverInput): Promise<DeliverResult> {
  const { integration, externalEvent, eventId, payload, attempt, isFinalAttempt } = input;
  const startedAt = new Date();
  const timestamp = String(startedAt.getTime());
  const envelope = { event: externalEvent, id: eventId, occurredAt: startedAt.toISOString(), data: payload };
  const rawBody = JSON.stringify(envelope);

  let status: IntegrationRunStatus = IntegrationRunStatus.FAILED;
  let httpStatus: number | undefined;
  let errorCode: string | undefined;
  let errorMessage: string | undefined;
  let responseExcerpt: string | undefined;

  try {
    if (!integration.endpoint) throw new SsrfError('Integração sem endpoint.');
    const url = await assertSafeUrl(integration.endpoint);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-DiarioDev-Event': externalEvent,
      'X-DiarioDev-Event-Id': eventId ?? '',
      'X-DiarioDev-Timestamp': timestamp,
    };
    if (integration.encryptedSecret) {
      const secret = decryptSecret(integration.encryptedSecret);
      headers['X-DiarioDev-Signature'] = `sha256=${signPayload(secret, timestamp, rawBody)}`;
      headers['X-DiarioDev-Secret'] = secret; // compatibilidade (§21.2)
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: rawBody,
      redirect: 'error', // não segue redirecionamentos (§21.3)
      signal: AbortSignal.timeout(integration.timeoutMs),
    });
    httpStatus = res.status;
    responseExcerpt = (await res.text()).slice(0, MAX_EXCERPT);
    if (res.ok) status = IntegrationRunStatus.SUCCESS;
    else errorCode = `HTTP_${res.status}`;
  } catch (err) {
    if (err instanceof SsrfError) {
      errorCode = err.code;
      errorMessage = err.message;
    } else if (err instanceof Error) {
      errorCode = err.name === 'TimeoutError' ? 'TIMEOUT' : 'DELIVERY_ERROR';
      errorMessage = err.message.slice(0, 300);
    }
  }

  const finishedAt = new Date();
  if (status !== IntegrationRunStatus.SUCCESS && isFinalAttempt) status = IntegrationRunStatus.DEAD;

  await db.integrationRun.create({
    data: {
      integrationId: integration.id,
      eventId,
      eventName: externalEvent,
      payload: envelope as never,
      attempt,
      status,
      httpStatus: httpStatus ?? null,
      responseExcerpt: responseExcerpt ?? null,
      errorCode: errorCode ?? null,
      errorMessage: errorMessage ?? null,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      startedAt,
      finishedAt,
    },
  });

  // Notifica administradores em tempo real (drenado pelo publicador da API).
  await db.outboxEvent.create({
    data: {
      eventName: 'integration.run.updated',
      aggregateType: 'integration',
      aggregateId: integration.id,
      payload: { integrationId: integration.id, event: externalEvent, ok: status === IntegrationRunStatus.SUCCESS } as never,
    },
  });

  const ok = status === IntegrationRunStatus.SUCCESS;
  if (!ok) logger.warn({ integrationId: integration.id, externalEvent, attempt, errorCode }, 'webhook não entregue');
  return { ok, httpStatus, errorCode };
}
