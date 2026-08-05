// Rotas de anexos: upload sob /api/v1/activities/:id/attachments (multipart);
// download e remoção sob /api/v1/attachments/:id. Todas exigem autenticação.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../../common/database/prisma.js';
import { ok } from '../../common/http/envelope.js';
import { Errors } from '../../common/errors/app-error.js';
import { requestMeta } from '../../common/http/request-meta.js';
import * as svc from './attachments.service.js';

const idParam = z.object({ id: z.string().uuid() });

export function registerActivityAttachmentRoutes(app: FastifyInstance, db: Db): void {
  app.addHook('preHandler', app.authenticate);

  app.post('/:id/attachments', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const data = await req.file();
    if (!data) throw Errors.validation([{ message: 'Nenhum arquivo enviado.' }]);
    let buffer: Buffer;
    try {
      buffer = await data.toBuffer();
    } catch {
      throw Errors.validation([{ message: 'Arquivo excede o tamanho máximo permitido.' }]);
    }
    const dto = await svc.uploadAttachment(db, req.authUser!, id, { filename: data.filename, buffer }, requestMeta(req));
    reply.code(201);
    return ok(dto, req.id);
  });
}

export function registerAttachmentRoutes(app: FastifyInstance, db: Db): void {
  app.addHook('preHandler', app.authenticate);

  app.get('/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const f = await svc.downloadAttachment(db, req.authUser!, id);
    reply.header('Content-Type', f.mime);
    reply.header('Content-Length', String(f.size));
    reply.header(
      'Content-Disposition',
      `attachment; filename="${f.filename}"; filename*=UTF-8''${encodeURIComponent(f.filename)}`,
    );
    return reply.send(f.stream);
  });

  app.delete('/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    await svc.removeAttachment(db, req.authUser!, id, requestMeta(req));
    return ok({ ok: true }, req.id);
  });
}
