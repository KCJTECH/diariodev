// Configuração dos cookies httpOnly de acesso e refresh (§15.2). O refresh tem
// path restrito às rotas de auth; ambos são Secure em produção e SameSite=Lax.
import type { FastifyReply } from 'fastify';
import { env, isProduction } from '../../config/env.js';

export const ACCESS_COOKIE = 'dv_access';
export const REFRESH_COOKIE = 'dv_refresh';
const REFRESH_PATH = '/api/v1/auth';

// Secure por padrão em produção; COOKIE_SECURE permite desligar em rede interna
// sem HTTPS (o navegador descartaria um cookie Secure em conexão http://).
const base = {
  httpOnly: true,
  secure: env.COOKIE_SECURE ?? isProduction,
  sameSite: 'lax' as const,
};

export function setAuthCookies(reply: FastifyReply, accessToken: string, refreshToken: string): void {
  reply.setCookie(ACCESS_COOKIE, accessToken, {
    ...base,
    path: '/',
    maxAge: env.ACCESS_TOKEN_TTL,
  });
  reply.setCookie(REFRESH_COOKIE, refreshToken, {
    ...base,
    path: REFRESH_PATH,
    maxAge: env.REFRESH_TOKEN_TTL,
  });
}

export function clearAuthCookies(reply: FastifyReply): void {
  reply.clearCookie(ACCESS_COOKIE, { path: '/' });
  reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_PATH });
}
