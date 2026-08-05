// Tipos e helpers de nível de acesso, e aumento do tipo do Fastify para expor
// o usuário autenticado em req.authUser.
import type { AccessLevel } from '@prisma/client';

export type ApiLevel = 'dev' | 'gestor' | 'ceo';

export type AuthUser = {
  id: string;
  publicKey: string;
  name: string;
  roleTitle: string;
  email: string;
  initials: string;
  color: string;
  active: boolean;
  level: ApiLevel;
  timezone: string;
  sessionId: string;
};

export const LEVEL_TO_API: Record<AccessLevel, ApiLevel> = {
  DEV: 'dev',
  GESTOR: 'gestor',
  CEO: 'ceo',
};

export const API_TO_LEVEL: Record<ApiLevel, AccessLevel> = {
  dev: 'DEV',
  gestor: 'GESTOR',
  ceo: 'CEO',
};

export const RANK: Record<ApiLevel, number> = { dev: 1, gestor: 2, ceo: 3 };

export function rankOf(level: ApiLevel): number {
  return RANK[level];
}

// gestor e ceo veem a equipe inteira
export function seesAll(level: ApiLevel): boolean {
  return RANK[level] >= RANK.gestor;
}

// somente ceo tem visão executiva
export function isExec(level: ApiLevel): boolean {
  return RANK[level] >= RANK.ceo;
}

// gestor e ceo planejam/atribuem tarefas
export function canPlan(level: ApiLevel): boolean {
  return RANK[level] >= RANK.gestor;
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}
