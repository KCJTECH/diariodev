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

function isPrivateIpV4(ip: string): boolean {
  const p = ip.split('.').map(Number) as [number, number, number, number];
  if (p[0] === 0 || p[0] === 10 || p[0] === 127) return true; // "este host" e loopback
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  if (p[0] === 192 && p[1] === 168) return true;
  if (p[0] === 192 && p[1] === 0 && p[2] === 0) return true; // IETF protocol assignments
  if (p[0] === 169 && p[1] === 254) return true; // link-local (metadados de nuvem)
  if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT
  if (p[0] === 198 && (p[1] === 18 || p[1] === 19)) return true; // benchmark
  if (p[0] >= 224) return true; // multicast, reservado e broadcast
  return false;
}

function isPrivateIp(ip: string): boolean {
  if (ip === '::' || ip === '::1') return true;
  if (isIP(ip) === 4) return isPrivateIpV4(ip);

  const low = ip.toLowerCase();
  // IPv4 embutido em IPv6 escapava da checagem: ::ffff:127.0.0.1 e
  // ::ffff:169.254.169.254 passavam e alcançavam loopback e metadados de nuvem.
  // Cobre também o prefixo de tradução NAT64 (64:ff9b::/96).
  const embutido = /(?:^::ffff:|^64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/i.exec(low);
  if (embutido?.[1]) return isPrivateIpV4(embutido[1]);
  // Forma hexadecimal do IPv4 mapeado: ::ffff:7f00:1
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(low);
  if (hex?.[1] && hex[2]) {
    const alto = parseInt(hex[1], 16);
    const baixo = parseInt(hex[2], 16);
    const v4 = [alto >> 8, alto & 0xff, baixo >> 8, baixo & 0xff].join('.');
    return isPrivateIpV4(v4);
  }
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
  if (targets.length === 0) throw new SsrfError(`Host ${url.hostname} não resolveu.`);
  for (const ip of targets) {
    if (isPrivateIp(ip)) {
      throw new SsrfError(`Endereço não permitido para o host ${url.hostname}.`);
    }
  }
  return url;
}

// Endereços aprovados para o host, para a entrega usar o IP já validado em vez de
// resolver o DNS de novo. Entre validar e conectar, o DNS pode mudar para um
// endereço interno: é a janela de DNS rebinding.
export async function resolveApproved(url: URL): Promise<string[]> {
  if (isIP(url.hostname)) return [url.hostname];
  const enderecos = (await lookup(url.hostname, { all: true })).map((a) => a.address);
  return enderecos.filter((ip) => !isPrivateIp(ip));
}
