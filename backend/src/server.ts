// Ponto de entrada da API HTTP. Sobe o Fastify e trata encerramento gracioso
// (SIGTERM/SIGINT), fechando conexões de banco e Redis.
import { buildApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './common/logging/logger.js';
import { prisma } from './common/database/prisma.js';
import { redis } from './common/database/redis.js';
import { createSocketServer } from './modules/realtime/socket.js';
import { startOutboxPublisher } from './modules/realtime/publisher.js';

async function main(): Promise<void> {
  const app = await buildApp();

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
  } catch (err) {
    logger.fatal({ err }, 'falha ao iniciar a API');
    process.exit(1);
  }

  // Realtime: Socket.IO sobre o mesmo servidor HTTP + publicador da outbox.
  const io = await createSocketServer(app.server, prisma);
  const stopPublisher = startOutboxPublisher(io, prisma);

  const close = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'encerrando aplicação');
    stopPublisher();
    await io.close();
    await app.close();
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => void close('SIGTERM'));
  process.on('SIGINT', () => void close('SIGINT'));
}

void main();
