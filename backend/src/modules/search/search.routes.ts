// Rota de pesquisa sob /api/v1/search. Exige autenticação; rate limit para
// conter buscas excessivas.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../../common/database/prisma.js';
import { ok } from '../../common/http/envelope.js';
import { search } from './search.service.js';

const query = z.object({ q: z.string().min(1).max(200) });

export function registerSearchRoutes(app: FastifyInstance, db: Db): void {
  app.addHook('preHandler', app.authenticate);

  app.get('/', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const { q } = query.parse(req.query);
    return ok(await search(db, req.authUser!, q), req.id);
  });
}
