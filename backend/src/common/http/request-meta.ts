// Extrai metadados de auditoria da requisição (requestId, hash de IP, UA).
import type { FastifyRequest } from 'fastify';
import { hashIp } from '../auth/tokens.js';

export function requestMeta(req: FastifyRequest): {
  requestId: string;
  ipHash: string | null;
  userAgent: string | null;
} {
  return {
    requestId: req.id,
    ipHash: hashIp(req.ip),
    userAgent: req.headers['user-agent'] ?? null,
  };
}
