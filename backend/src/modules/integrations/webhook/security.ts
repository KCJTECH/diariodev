// Segurança de entrega de webhook (§21.2, §21.3): assinatura HMAC-SHA256 e
// proteção contra SSRF (bloqueia esquemas não-HTTP e endereços privados/loopback,
// salvo hosts explicitamente liberados na allowlist).
import { createHmac } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { env } from '../../../config/env.js';

// Assinatura sobre "timestamp + '.' + corpo bruto" (§21.2).
export function signPayload(secret: string, timestamp: string, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

function isPrivateIp(ip: string): boolean {
  if (ip === '0.0.0.0' || ip === '::' || ip === '::1') return true;
  if (isIP(ip) === 4) {
    const p = ip.split('.').map(Number) as [number, number, number, number];
    if (p[0] === 10 || p[0] === 127) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 169 && p[1] === 254) return true; // link-local (metadados de nuvem)
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT
    return false;
  }
  const low = ip.toLowerCase();
  return low.startsWith('fc') || low.startsWith('fd') || low.startsWith('fe80');
}

export class SsrfError extends Error {
  code = 'SSRF_BLOCKED';
}

// Valida o endpoint antes de qualquer requisição. Retorna a URL parseada.
export async function assertSafeUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfError('URL inválida.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SsrfError('Somente HTTP/HTTPS são permitidos.');
  }
  if (env.WEBHOOK_ALLOWED_HOSTS.has(url.hostname)) return url;

  // Se o host já é IP, valida direto; senão resolve e valida todos os endereços.
  const targets = isIP(url.hostname) ? [url.hostname] : (await lookup(url.hostname, { all: true })).map((a) => a.address);
  for (const ip of targets) {
    if (isPrivateIp(ip)) {
      throw new SsrfError(`Endereço não permitido para o host ${url.hostname}.`);
    }
  }
  return url;
}
