// Servidor Socket.IO (§18). Autentica pela sessão via cookie httpOnly, valida a
// origem, entra o usuário apenas nas salas autorizadas pelo servidor e usa o
// adaptador Redis quando disponível (escala para múltiplas instâncias).
import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { env } from '../../config/env.js';
import { logger } from '../../common/logging/logger.js';
import { verifyAccessToken } from '../../common/auth/tokens.js';
import { loadAuthUser } from '../auth/auth.service.js';
import { ACCESS_COOKIE } from '../auth/auth.cookies.js';
import type { Db } from '../../common/database/prisma.js';
import { userRooms } from './rooms.js';

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    out[k] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export async function createSocketServer(httpServer: HttpServer, db: Db): Promise<Server> {
  const io = new Server(httpServer, {
    cors: { origin: env.APP_ORIGIN, credentials: true },
    // Serve o client em /socket.io/socket.io.js para o frontend carregar sem bundler.
    serveClient: true,
  });

  // Adaptador Redis: permite emitir entre instâncias. Sem ele, funciona só em
  // uma instância (dev). Falha na conexão não derruba o realtime local.
  try {
    const pub = new Redis(env.REDIS_URL, { lazyConnect: true });
    const sub = pub.duplicate();
    await pub.connect();
    await sub.connect();
    io.adapter(createAdapter(pub, sub));
    logger.info('Socket.IO com adaptador Redis');
  } catch (err) {
    logger.warn({ err }, 'Socket.IO sem adaptador Redis (apenas instância única)');
  }

  io.use(async (socket: Socket, next) => {
    try {
      const origin = socket.handshake.headers.origin;
      if (origin && origin !== env.APP_ORIGIN) return next(new Error('origem não permitida'));
      const cookies = parseCookies(socket.handshake.headers.cookie);
      const token = cookies[ACCESS_COOKIE];
      if (!token) return next(new Error('não autenticado'));
      const claims = verifyAccessToken(token);
      const user = await loadAuthUser(db, claims.sub, claims.sid);
      if (!user) return next(new Error('sessão inválida'));
      socket.data.user = user;
      return next();
    } catch {
      return next(new Error('não autenticado'));
    }
  });

  io.on('connection', async (socket: Socket) => {
    const user = socket.data.user;
    const rooms = await userRooms(db, user);
    await socket.join(rooms);
    logger.debug({ userId: user.id, rooms: rooms.length }, 'socket conectado');
  });

  return io;
}
