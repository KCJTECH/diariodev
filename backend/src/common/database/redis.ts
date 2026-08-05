// Cliente Redis compartilhado (Socket.IO adapter, filas, locks). Conexão
// preguiçosa: só abre quando usada, para não bloquear o boot da API.
import Redis from 'ioredis';
import { env } from '../../config/env.js';

export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});
