// Construção da aplicação Fastify: plugins de segurança, CORS restrito por
// origem, cookies, rate limit base, tratamento de erros e rotas.
// As rotas de domínio são registradas em fases seguintes.
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { env, isTest } from './config/env.js';
import { loggerOptions } from './common/logging/logger.js';
import { registerErrorHandler } from './common/http/error-handler.js';
import { registerHealthRoutes } from './modules/health/health.routes.js';
import { prisma } from './common/database/prisma.js';
import { redis } from './common/database/redis.js';
import { Errors } from './common/errors/app-error.js';
import { authPlugin } from './modules/auth/auth.plugin.js';
import { registerAuthRoutes } from './modules/auth/auth.routes.js';
import { registerBootstrapRoutes } from './modules/bootstrap/bootstrap.routes.js';
import { registerActivityRoutes } from './modules/activities/activities.routes.js';
import { registerTaskRoutes } from './modules/tasks/tasks.routes.js';
import { registerUserRoutes } from './modules/users/users.routes.js';
import { registerCategoryRoutes } from './modules/categories/categories.routes.js';
import { registerProjectRoutes } from './modules/projects/projects.routes.js';
import { registerGroupRoutes } from './modules/groups/groups.routes.js';
import { registerIntegrationRoutes, registerIntegrationRunRoutes } from './modules/integrations/integrations.routes.js';
import { registerReportRoutes } from './modules/reports/reports.routes.js';
import { registerSearchRoutes } from './modules/search/search.routes.js';
import { registerSettingsRoutes } from './modules/settings/settings.routes.js';
import { registerSyncRoutes } from './modules/realtime/sync.routes.js';
import { registerActivityAttachmentRoutes, registerAttachmentRoutes } from './modules/attachments/attachments.routes.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerOptions,
    genReqId: () => randomUUID(),
    // Só confia em X-Forwarded-For vindo dos proxies declarados. Confiar em
    // qualquer origem deixaria o próprio cliente escolher o IP que o servidor
    // registra, furando o rate limit por IP e envenenando o ipHash gravado em
    // auditoria e sessões. Sem TRUST_PROXY configurado, usa o IP da conexão.
    trustProxy: env.TRUST_PROXY.length > 0 ? env.TRUST_PROXY : false,
    bodyLimit: 1_048_576, // 1 MiB para JSON; uploads têm limite próprio
  });

  await app.register(helmet, { contentSecurityPolicy: false });

  // Origens permitidas: a configurada (APP_ORIGIN) e a própria do servidor, para
  // funcionar tanto servindo o frontend junto (mesma origem) quanto separado.
  const allowedOrigins = new Set([
    env.APP_ORIGIN,
    `http://localhost:${env.PORT}`,
    `http://127.0.0.1:${env.PORT}`,
  ]);

  await app.register(cors, {
    origin: [...allowedOrigins],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  });

  await app.register(cookie, { secret: env.COOKIE_SECRET });

  await app.register(multipart, { limits: { fileSize: env.MAX_UPLOAD_BYTES, files: 1, fields: 5 } });

  // Rate limit desligado em teste para não introduzir flutuação nos testes.
  if (!isTest) {
    await app.register(rateLimit, {
      // Teto global folgado, para nenhuma rota ficar sem limite nenhum: escrita,
      // bootstrap e relatórios estavam descobertos. Os limites apertados por
      // rota (§26.2) continuam valendo e sobrescrevem este.
      global: true,
      max: 600,
      timeWindow: '1 minute',
      redis,
    });
  }

  // Proteção CSRF por origem: mutações só de origem permitida (§15.3). Requisições
  // sem Origin (ferramentas/testes server-to-server) passam; SameSite reforça.
  app.addHook('onRequest', async (req) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.has(origin)) {
      throw Errors.forbidden('Origem não permitida.');
    }
  });

  // Serve o frontend estático (mesma origem que a API). Allowlist de caminhos:
  // nunca expõe backend/, .env, o prompt mestre ou dotfiles.
  const frontendRoot = env.FRONTEND_DIR
    ? path.resolve(env.FRONTEND_DIR)
    : path.resolve(process.cwd(), '..');
  await app.register(fastifyStatic, {
    root: frontendRoot,
    // A raiz serve o index.html, que é a tela de entrada. Sem isto,
    // http://host:porta devolveria o 404 em JSON da API a quem digitou só o
    // endereço do servidor. Servir, e não redirecionar, mantém a URL limpa.
    index: ['index.html'],
    prefix: '/',
    allowedPath: (pathName) =>
      /\.dc\.html$/.test(pathName) ||
      pathName === '/' ||
      pathName === '/index.html' ||
      pathName.startsWith('/assets/') ||
      pathName === '/support.js' ||
      pathName.startsWith('/uploads/') ||
      pathName.startsWith('/screenshots/'),
  });

  // Compatibilidade: links de redefinição já enviados por e-mail apontam para
  // /login.dc.html. Enquanto houver token válido em circulação (e por segurança
  // depois disso), o caminho antigo leva ao novo preservando o fragmento, que o
  // navegador mantém sozinho no redirecionamento.
  app.get('/login.dc.html', async (_req, reply) => reply.redirect('/'));

  registerErrorHandler(app);
  registerHealthRoutes(app, { db: prisma, redis });

  await app.register(authPlugin, { db: prisma });
  await app.register(
    async (instance) => {
      registerAuthRoutes(instance, prisma);
    },
    { prefix: '/api/v1/auth' },
  );
  await app.register(
    async (instance) => {
      registerBootstrapRoutes(instance, prisma);
    },
    { prefix: '/api/v1/bootstrap' },
  );
  await app.register(
    async (instance) => {
      registerActivityRoutes(instance, prisma);
    },
    { prefix: '/api/v1/activities' },
  );
  await app.register(
    async (instance) => {
      registerTaskRoutes(instance, prisma);
    },
    { prefix: '/api/v1/tasks' },
  );
  await app.register(async (i) => registerUserRoutes(i, prisma), { prefix: '/api/v1/users' });
  await app.register(async (i) => registerCategoryRoutes(i, prisma), { prefix: '/api/v1/categories' });
  await app.register(async (i) => registerProjectRoutes(i, prisma), { prefix: '/api/v1/projects' });
  await app.register(async (i) => registerGroupRoutes(i, prisma), { prefix: '/api/v1/groups' });
  await app.register(async (i) => registerIntegrationRoutes(i, prisma), { prefix: '/api/v1/integrations' });
  await app.register(async (i) => registerIntegrationRunRoutes(i, prisma), { prefix: '/api/v1/integration-runs' });
  await app.register(async (i) => registerReportRoutes(i, prisma), { prefix: '/api/v1/reports' });
  await app.register(async (i) => registerSearchRoutes(i, prisma), { prefix: '/api/v1/search' });
  await app.register(async (i) => registerSettingsRoutes(i, prisma), { prefix: '/api/v1' });
  await app.register(async (i) => registerSyncRoutes(i, prisma), { prefix: '/api/v1/sync' });
  await app.register(async (i) => registerActivityAttachmentRoutes(i, prisma), { prefix: '/api/v1/activities' });
  await app.register(async (i) => registerAttachmentRoutes(i, prisma), { prefix: '/api/v1/attachments' });

  return app;
}
