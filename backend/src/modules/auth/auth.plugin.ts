// Plugin que expõe os guardas de rota: `authenticate` (exige sessão válida) e
// `requireLevel` (exige nível mínimo). A autorização é sempre do servidor.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { verifyAccessToken } from '../../common/auth/tokens.js';
import { Errors } from '../../common/errors/app-error.js';
import { rankOf, type ApiLevel } from '../../common/auth/types.js';
import { ACCESS_COOKIE } from './auth.cookies.js';
import { loadAuthUser } from './auth.service.js';
import type { Db } from '../../common/database/prisma.js';

type PreHandler = (req: FastifyRequest, reply: FastifyReply) => Promise<void>;

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: PreHandler;
    requireLevel: (min: ApiLevel) => PreHandler;
  }
}

export const authPlugin = fp(function (app: FastifyInstance, opts: { db: Db }, done: () => void) {
  const { db } = opts;

  app.decorate('authenticate', async function (req: FastifyRequest): Promise<void> {
    const token = req.cookies[ACCESS_COOKIE];
    if (!token) throw Errors.unauthorized();
    const claims = verifyAccessToken(token); // lança se inválido/expirado
    const user = await loadAuthUser(db, claims.sub, claims.sid);
    if (!user) throw Errors.unauthorized('Sessão inválida.');
    req.authUser = user;
  });

  app.decorate('requireLevel', function (min: ApiLevel): PreHandler {
    return async function (req: FastifyRequest): Promise<void> {
      if (!req.authUser) throw Errors.unauthorized();
      if (rankOf(req.authUser.level) < rankOf(min)) {
        throw Errors.forbidden();
      }
    };
  });

  done();
});
