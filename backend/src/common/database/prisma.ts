// Instância única do Prisma Client. Injetada explicitamente nos serviços; não
// importar diretamente dentro de regras de domínio para manter testabilidade.
import { PrismaClient } from '@prisma/client';
import { env, isProduction } from '../../config/env.js';

export const prisma = new PrismaClient({
  log: isProduction ? ['warn', 'error'] : ['warn', 'error'],
  datasources: { db: { url: env.DATABASE_URL } },
});

export type Db = PrismaClient;
