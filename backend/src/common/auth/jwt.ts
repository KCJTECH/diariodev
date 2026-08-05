// JWT HS256 mínimo sobre a stdlib (sem dependência externa). Algoritmo fixo em
// HS256 e verificado explicitamente para evitar ataques de confusão de alg.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Errors } from '../errors/app-error.js';

type Header = { alg: 'HS256'; typ: 'JWT' };

function encodeSegment(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

export function signJwt(payload: Record<string, unknown>, secret: string, ttlSeconds: number): string {
  const header: Header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlSeconds };
  const data = `${encodeSegment(header)}.${encodeSegment(body)}`;
  const sig = createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyJwt<T extends Record<string, unknown>>(token: string, secret: string): T {
  const parts = token.split('.');
  if (parts.length !== 3) throw Errors.unauthorized('Token inválido.');
  const [h, p, s] = parts as [string, string, string];

  const expected = createHmac('sha256', secret).update(`${h}.${p}`).digest();
  const got = Buffer.from(s, 'base64url');
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) {
    throw Errors.unauthorized('Assinatura inválida.');
  }

  const header = JSON.parse(Buffer.from(h, 'base64url').toString()) as Header;
  if (header.alg !== 'HS256') throw Errors.unauthorized('Algoritmo não suportado.');

  const body = JSON.parse(Buffer.from(p, 'base64url').toString()) as T & { exp?: number };
  if (typeof body.exp === 'number' && Math.floor(Date.now() / 1000) >= body.exp) {
    throw Errors.unauthorized('Sessão expirada.');
  }
  return body;
}
