// Emissão de tokens: access (JWT curto) e refresh (opaco, armazenado só como
// hash). Também deriva o hash de IP para o log de sessões (sem PII em claro).
import { createHash, randomBytes } from 'node:crypto';
import { env } from '../../config/env.js';
import { signJwt, verifyJwt } from './jwt.js';

export type AccessClaims = {
  sub: string; // userId
  sid: string; // sessionId
  lvl: 'dev' | 'gestor' | 'ceo';
};

export function signAccessToken(claims: AccessClaims): string {
  return signJwt(claims, env.JWT_ACCESS_SECRET, env.ACCESS_TOKEN_TTL);
}

export function verifyAccessToken(token: string): AccessClaims {
  return verifyJwt<AccessClaims>(token, env.JWT_ACCESS_SECRET);
}

export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hashIp(ip: string | undefined): string | null {
  if (!ip) return null;
  // Salt com o segredo de cookie para não guardar IP identificável em claro.
  return createHash('sha256').update(`${env.COOKIE_SECRET}:${ip}`).digest('hex');
}
