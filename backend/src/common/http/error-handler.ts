// Tratamento central de erros: converte AppError, erros de validação Zod e
// erros do Fastify no envelope de erro. Nunca vaza stack trace em produção.
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../errors/app-error.js';
import type { ErrorBody } from './envelope.js';
import { isProduction } from '../../config/env.js';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setNotFoundHandler((req: FastifyRequest, reply: FastifyReply) => {
    const body: ErrorBody = {
      error: {
        code: 'NOT_FOUND',
        message: 'Recurso não encontrado.',
        details: [],
        requestId: req.id,
      },
    };
    reply.code(404).send(body);
  });

  app.setErrorHandler((err: FastifyError, req: FastifyRequest, reply: FastifyReply) => {
    if (err instanceof AppError) {
      const body: ErrorBody = {
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
          requestId: req.id,
        },
      };
      return reply.code(err.statusCode).send(body);
    }

    if (err instanceof ZodError) {
      const body: ErrorBody = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dados inválidos.',
          details: err.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
          requestId: req.id,
        },
      };
      return reply.code(422).send(body);
    }

    // Erros de validação do próprio Fastify (schemas de rota)
    if (typeof err.statusCode === 'number' && err.statusCode < 500) {
      const body: ErrorBody = {
        error: {
          code: err.code ?? 'BAD_REQUEST',
          message: err.message,
          details: [],
          requestId: req.id,
        },
      };
      return reply.code(err.statusCode).send(body);
    }

    // Erro inesperado: loga completo internamente, responde genérico.
    req.log.error({ err }, 'erro não tratado');
    const body: ErrorBody = {
      error: {
        code: 'INTERNAL_ERROR',
        message: isProduction ? 'Erro interno.' : err.message,
        details: [],
        requestId: req.id,
      },
    };
    return reply.code(500).send(body);
  });
}
