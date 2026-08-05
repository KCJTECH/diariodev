// Resumo diário (§22). Idempotente por dia via lock no Redis (SET NX): mesmo com
// múltiplas instâncias ou reinício, dispara uma vez por dia. Enfileira o evento
// resumo.diario para as integrações inscritas.
import type Redis from 'ioredis';
import type { Db } from '../common/database/prisma.js';
import { logger } from '../common/logging/logger.js';
import { env } from '../config/env.js';
import { civilTodayISO } from '../common/domain/time.js';
import { webhookQueue } from '../modules/integrations/webhook/queue.js';

export async function runDailySummary(db: Db, redis: Redis): Promise<{ dispatched: number; skipped?: boolean }> {
  const date = civilTodayISO(env.ORGANIZATION_TIMEZONE);
  const lockKey = `dv:daily:${date}`;
  const acquired = await redis.set(lockKey, '1', 'EX', 172_800, 'NX');
  if (!acquired) {
    logger.info({ date }, 'resumo diário já disparado hoje; ignorando');
    return { dispatched: 0, skipped: true };
  }

  const startOfDay = new Date(`${date}T00:00:00-03:00`);
  const totalActivities = await db.activity.count({ where: { deletedAt: null, occurredAt: { gte: startOfDay } } });

  const integrations = await db.integration.findMany({
    where: { deletedAt: null, enabled: true, events: { has: 'resumo.diario' }, endpoint: { not: null } },
    select: { id: true, maxAttempts: true },
  });

  const payload = { date, totalActivities };
  for (const i of integrations) {
    await webhookQueue.add(
      'resumo.diario',
      { integrationId: i.id, externalEvent: 'resumo.diario', eventId: null, payload },
      { attempts: i.maxAttempts },
    );
  }
  logger.info({ date, dispatched: integrations.length, totalActivities }, 'resumo diário disparado');
  return { dispatched: integrations.length };
}
