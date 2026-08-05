// Logger estruturado (Pino). Em desenvolvimento usa pino-pretty; em produção
// emite JSON. Campos sensíveis são redigidos globalmente.
// `loggerOptions` alimenta o logger do Fastify (mantém o tipo base do Fastify);
// `logger` é a instância avulsa para logs fora do ciclo de requisição.
import { pino, type LoggerOptions } from 'pino';
import { env, isProduction } from '../../config/env.js';

const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.password_hash',
  '*.token',
  '*.refreshToken',
  '*.secret',
  '*.encryptedSecret',
  '*.encryption_key',
];

export const loggerOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  redact: { paths: redactPaths, censor: '[REDACTED]' },
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
};

export const logger = pino(loggerOptions);

export type Logger = typeof logger;
