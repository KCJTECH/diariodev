// Processo de workers: consome a fila de webhooks (com retries/backoff do BullMQ)
// e executa o resumo diário agendado. Roda separado da API (`npm run start:worker`).
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../common/logging/logger.js';
import { prisma } from '../common/database/prisma.js';
import {
  WEBHOOK_QUEUE,
  DAILY_QUEUE,
  dailyQueue,
  webhookConnection,
  type WebhookJob,
} from '../modules/integrations/webhook/queue.js';
import { deliverWebhook } from '../modules/integrations/webhook/delivery.js';
import { runDailySummary } from '../jobs/daily-summary.js';

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

const webhookWorker = new Worker<WebhookJob>(
  WEBHOOK_QUEUE,
  async (job) => {
    const { integrationId, externalEvent, eventId, payload } = job.data;
    const integration = await prisma.integration.findFirst({
      where: { id: integrationId, deletedAt: null, enabled: true },
    });
    if (!integration) return; // integração removida/desabilitada: descarta o job
    const attempt = job.attemptsMade + 1;
    const max = job.opts.attempts ?? 5;
    const res = await deliverWebhook(prisma, {
      integration,
      externalEvent,
      eventId,
      payload,
      attempt,
      isFinalAttempt: attempt >= max,
    });
    if (!res.ok) throw new Error(res.errorCode ?? 'delivery_failed'); // dispara retry
  },
  { connection, concurrency: 5 },
);

const dailyWorker = new Worker(
  DAILY_QUEUE,
  async () => {
    await runDailySummary(prisma, webhookConnection);
  },
  { connection },
);

async function scheduleDaily(): Promise<void> {
  const parts = env.DAILY_SUMMARY_TIME.split(':');
  const hh = Number(parts[0]);
  const mm = Number(parts[1]);
  await dailyQueue.add(
    'resumo-diario',
    {},
    {
      repeat: { pattern: `${mm} ${hh} * * *`, tz: env.ORGANIZATION_TIMEZONE },
      jobId: 'daily-summary', // chave estável: não duplica ao reiniciar
    },
  );
  logger.info({ time: env.DAILY_SUMMARY_TIME, tz: env.ORGANIZATION_TIMEZONE }, 'resumo diário agendado');
}

webhookWorker.on('failed', (job, err) => logger.warn({ jobId: job?.id, err: err.message }, 'job de webhook falhou'));

async function main(): Promise<void> {
  await scheduleDaily();
  logger.info('workers iniciados (webhooks + resumo diário)');
}

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, 'encerrando workers');
  await webhookWorker.close();
  await dailyWorker.close();
  await prisma.$disconnect();
  connection.disconnect();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

void main();
