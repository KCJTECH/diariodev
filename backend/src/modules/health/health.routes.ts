// Health checks. /health/live confirma que o processo responde;
// /health/ready valida dependências essenciais (PostgreSQL e Redis).
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../common/database/prisma.js';
import type Redis from 'ioredis';

type Deps = { db: Db; redis: Redis };

export function registerHealthRoutes(app: FastifyInstance, deps: Deps): void {
  app.get('/health/live', async () => ({ status: 'ok' }));

  app.get('/health/ready', async (_req, reply) => {
    const checks: Record<string, 'ok' | 'fail'> = {
      database: 'fail',
      redis: 'fail',
    };

    try {
      await deps.db.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch {
      checks.database = 'fail';
    }

    try {
      const pong = await deps.redis.ping();
      checks.redis = pong === 'PONG' ? 'ok' : 'fail';
    } catch {
      checks.redis = 'fail';
    }

    const ready = Object.values(checks).every((c) => c === 'ok');
    return reply.code(ready ? 200 : 503).send({ status: ready ? 'ok' : 'degraded', checks });
  });
}
