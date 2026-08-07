// Rotas de configuração/preferências sob /api/v1. Aparência: leitura
// autenticada, escrita gestor+. Preferências: sempre do próprio usuário.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../../common/database/prisma.js';
import { ok } from '../../common/http/envelope.js';
import { requestMeta } from '../../common/http/request-meta.js';
import * as svc from './settings.service.js';

// Sem passthrough: a aparência é entregue a todos os usuários autenticados no
// bootstrap, então aceitar chave arbitrária transformava a rota em armazenamento
// de conteúdo escolhido pelo cliente e difundido para a organização inteira.
// O logotipo continua aceitando data URI, mas com limite realista e formato
// verificado, em vez de meio megabyte de string livre.
const appearanceBody = z
  .object({
    mark: z.string().max(10).optional(),
    markImg: z
      .string()
      .max(200_000)
      .refine((v) => v === '' || /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(v), {
        message: 'Use uma imagem em data URI (png, jpeg, gif ou webp).',
      })
      .optional(),
    name: z.string().max(120).optional(),
    sub: z.string().max(200).optional(),
    brand: z.string().max(40).optional(),
    accent: z.string().max(40).optional(),
    radius: z.number().int().min(0).max(40).optional(),
    density: z.string().max(20).optional(),
    sidebarStyle: z.string().max(20).optional(),
  })
  .strict();

// Servidor de e-mail. Porta em allowlist: porta livre transformaria o botão de
// testar em varredura de portas da rede interna, com oráculo de erro e de tempo.
const PORTAS_SMTP = new Set([25, 465, 587, 2525]);
const mailBody = z
  .object({
    enabled: z.boolean().optional(),
    host: z
      .string()
      .trim()
      .min(1)
      .max(255)
      // Servidor, não URL: sem esquema, barra, arroba, espaço ou porta embutida.
      .refine((v) => !/[\s/@:\\]/.test(v) && !/^[a-z]+:\/\//i.test(v), {
        message: 'Informe apenas o servidor, sem http://, sem porta e sem barra.',
      })
      .optional(),
    port: z.coerce
      .number()
      .int()
      .refine((p) => PORTAS_SMTP.has(p), { message: 'Use a porta 25, 465, 587 ou 2525.' })
      .optional(),
    user: z.string().trim().max(255).optional(),
    // Ausente mantém a senha atual; string vazia apaga.
    password: z.string().max(200).optional(),
    fromEmail: z.string().trim().email().max(200).optional(),
    // Texto do e-mail de redefinição. Marcadores {USUARIO}, {LINK} e {MINUTOS};
    // a obrigatoriedade de {LINK} é verificada no serviço, depois do merge.
    resetBody: z.string().max(4000).optional(),
  })
  .strict();

const prefsBody = z.object({
  collapsed: z.boolean().optional(),
  density: z.string().max(20).optional(),
  theme: z.enum(['light', 'dark']).optional(),
  defaultProjectId: z.string().uuid().nullable().optional(),
  extra: z.record(z.unknown()).optional(),
});

export function registerSettingsRoutes(app: FastifyInstance, db: Db): void {
  app.addHook('preHandler', app.authenticate);

  app.get('/settings/appearance', async (req) => ok(await svc.getAppearance(db), req.id));
  app.put(
    '/settings/appearance',
    { preHandler: app.requireLevel('gestor') },
    async (req) => ok(await svc.updateAppearance(db, req.authUser!, appearanceBody.parse(req.body)), req.id),
  );

  // Servidor de e-mail: gestor+ em TODAS as rotas, inclusive na leitura. O hook
  // do módulo só autentica, e host/porta/usuário do relay é topologia interna,
  // que nível dev não tem por que ler.
  app.get('/settings/mail', { preHandler: app.requireLevel('gestor') }, async (req) => ok(await svc.getMail(db), req.id));
  app.put('/settings/mail', { preHandler: app.requireLevel('gestor') }, async (req) =>
    ok(await svc.updateMail(db, req.authUser!, mailBody.parse(req.body), requestMeta(req)), req.id),
  );
  // Rate limit apertado: cada acerto manda e-mail de verdade, o que consome
  // limite e reputação do relay.
  app.post(
    '/settings/mail/test',
    { preHandler: app.requireLevel('gestor'), config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } },
    async (req) => ok(await svc.testMail(db, req.authUser!, requestMeta(req)), req.id),
  );

  app.get('/preferences', async (req) => ok(await svc.getPreferences(db, req.authUser!), req.id));
  app.put('/preferences', async (req) => ok(await svc.updatePreferences(db, req.authUser!, prefsBody.parse(req.body)), req.id));
}
