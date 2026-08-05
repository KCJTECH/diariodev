// Fila BullMQ para entrega assíncrona de webhooks. Conexão dedicada ao Redis.
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../../../config/env.js';

export const WEBHOOK_QUEUE = 'dv-webhooks';

export const webhookConnection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

export type WebhookJob = {
  integrationId: string;
  externalEvent: string;
  eventId: string | null;
  payload: unknown;
};

export const webhookQueue = new Queue<WebhookJob>(WEBHOOK_QUEUE, {
  connection: webhookConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 }, // 2s, 4s, 8s... + jitter do BullMQ
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

// Fila do resumo diário (job repetível agendado no worker).
export const DAILY_QUEUE = 'dv-daily';
export const dailyQueue = new Queue(DAILY_QUEUE, { connection: webhookConnection });
