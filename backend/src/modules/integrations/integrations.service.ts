// Integrações/webhooks (§13.10, §17.10, §21.4). O segredo é criptografado
// (AES-GCM) e NUNCA retornado por inteiro: as respostas trazem apenas
// secretConfigured e uma prévia mascarada. Restrito a gestor+ nas rotas.
import type { Db } from '../../common/database/prisma.js';
import { Errors } from '../../common/errors/app-error.js';
import type { AuthUser } from '../../common/auth/types.js';
import { encryptSecret, decryptSecret, secretPreview } from '../../common/utils/crypto.js';
import { writeOutbox } from '../../common/events/outbox.js';
import { writeAudit } from '../audit/audit.service.js';
import { deliverWebhook } from './webhook/delivery.js';

type Meta = { requestId: string; ipHash: string | null; userAgent: string | null };

export type IntegrationDto = {
  id: string;
  name: string;
  abbr: string | null;
  type: string;
  enabled: boolean;
  endpoint: string | null;
  events: string[];
  // Projetos que disparam esta integração. Vazio = todos.
  projects: string[];
  // Servidor de e-mail próprio desta integração (tipo e-mail). Host vazio =
  // usa o servidor do sistema. A senha nunca sai: ver secretConfigured.
  mailHost: string;
  mailPort: number;
  mailUser: string;
  mailFrom: string;
  notes: string | null;
  secretConfigured: boolean;
  secretPreview: string | null;
};

export type IntegrationWrite = {
  name: string;
  abbr?: string | null;
  type: string;
  enabled?: boolean;
  endpoint?: string | null;
  events?: string[];
  projects?: string[];
  mailHost?: string;
  mailPort?: number;
  mailUser?: string;
  mailFrom?: string;
  notes?: string | null;
  secret?: string;
};

type IntegrationRow = {
  id: string; name: string; abbreviation: string | null; type: string; enabled: boolean;
  endpoint: string | null; events: string[]; projectIds: string[]; notes: string | null; encryptedSecret: string | null;
  config: unknown;
};

// Config de e-mail guardada em Integration.config. A senha não mora aqui: fica
// em encryptedSecret, cifrada, como o segredo de webhook.
type MailFields = { mailHost: string; mailPort: number; mailUser: string; mailFrom: string };
function mailFieldsOf(config: unknown): MailFields {
  const c = (config && typeof config === 'object' ? config : {}) as Record<string, unknown>;
  return {
    mailHost: typeof c.host === 'string' ? c.host : '',
    mailPort: typeof c.port === 'number' ? c.port : 587,
    mailUser: typeof c.user === 'string' ? c.user : '',
    mailFrom: typeof c.fromEmail === 'string' ? c.fromEmail : '',
  };
}

// Monta o config a gravar, preservando o que não veio no patch.
function mergeMailConfig(atual: unknown, input: Partial<IntegrationWrite>): Record<string, unknown> {
  const a = mailFieldsOf(atual);
  return {
    host: (input.mailHost ?? a.mailHost).trim(),
    port: input.mailPort ?? a.mailPort,
    user: (input.mailUser ?? a.mailUser).trim(),
    fromEmail: (input.mailFrom ?? a.mailFrom).trim(),
  };
}

function toDto(i: IntegrationRow): IntegrationDto {
  let preview: string | null = null;
  if (i.encryptedSecret) {
    try {
      preview = secretPreview(decryptSecret(i.encryptedSecret));
    } catch {
      preview = '****'; // chave mestra divergente: não expõe nada
    }
  }
  return {
    id: i.id, name: i.name, abbr: i.abbreviation, type: i.type, enabled: i.enabled,
    endpoint: i.endpoint, events: i.events, projects: i.projectIds, notes: i.notes,
    ...mailFieldsOf(i.config),
    secretConfigured: i.encryptedSecret !== null, secretPreview: preview,
  };
}

const columns = {
  id: true, name: true, abbreviation: true, type: true, enabled: true,
  endpoint: true, events: true, projectIds: true, notes: true, encryptedSecret: true, config: true,
};

export async function listIntegrations(db: Db): Promise<IntegrationDto[]> {
  const rows = await db.integration.findMany({ where: { deletedAt: null }, select: columns, orderBy: { createdAt: 'asc' } });
  return rows.map(toDto);
}

export async function createIntegration(db: Db, actor: AuthUser, input: IntegrationWrite, meta: Meta): Promise<IntegrationDto> {
  const id = await db.$transaction(async (tx) => {
    const created = await tx.integration.create({
      data: {
        name: input.name.trim(),
        abbreviation: input.abbr ?? null,
        type: input.type,
        enabled: input.enabled ?? true,
        endpoint: input.endpoint ?? null,
        encryptedSecret: input.secret ? encryptSecret(input.secret) : null,
        events: input.events ?? [],
        projectIds: input.projects ?? [],
        config: mergeMailConfig({}, input) as never,
        notes: input.notes ?? null,
        createdBy: actor.id,
      },
    });
    await writeOutbox(tx, { eventName: 'integration.created', aggregateType: 'integration', aggregateId: created.id, payload: { id: created.id } });
    return created.id;
  });
  await writeAudit(db, { actorUserId: actor.id, action: 'integration.created', entityType: 'integration', entityId: id, requestId: meta.requestId, ipHash: meta.ipHash, userAgent: meta.userAgent });
  const row = await db.integration.findUniqueOrThrow({ where: { id }, select: columns });
  return toDto(row);
}

export async function updateIntegration(db: Db, actor: AuthUser, id: string, input: Partial<IntegrationWrite>, meta: Meta): Promise<IntegrationDto> {
  const current = await db.integration.findFirst({ where: { id, deletedAt: null } });
  if (!current) throw Errors.notFound('INTEGRATION_NOT_FOUND', 'Integração não encontrada.');

  await db.$transaction(async (tx) => {
    await tx.integration.update({
      where: { id },
      data: {
        name: input.name?.trim(),
        abbreviation: input.abbr ?? undefined,
        type: input.type,
        enabled: input.enabled,
        endpoint: input.endpoint ?? undefined,
        events: input.events ?? undefined,
        projectIds: input.projects ?? undefined,
        config: mergeMailConfig(current.config, input) as never,
        notes: input.notes ?? undefined,
        // Só re-encripta se um novo segredo não vazio foi enviado; caso contrário mantém.
        encryptedSecret: input.secret ? encryptSecret(input.secret) : undefined,
      },
    });
    await writeOutbox(tx, { eventName: 'integration.updated', aggregateType: 'integration', aggregateId: id, payload: { id } });
  });
  await writeAudit(db, { actorUserId: actor.id, action: 'integration.updated', entityType: 'integration', entityId: id, requestId: meta.requestId, ipHash: meta.ipHash, userAgent: meta.userAgent });
  const row = await db.integration.findUniqueOrThrow({ where: { id }, select: columns });
  return toDto(row);
}

export async function deleteIntegration(db: Db, actor: AuthUser, id: string, meta: Meta): Promise<void> {
  const current = await db.integration.findFirst({ where: { id, deletedAt: null } });
  if (!current) throw Errors.notFound('INTEGRATION_NOT_FOUND', 'Integração não encontrada.');
  await db.$transaction(async (tx) => {
    await tx.integration.update({ where: { id }, data: { deletedAt: new Date(), enabled: false } });
    await writeOutbox(tx, { eventName: 'integration.deleted', aggregateType: 'integration', aggregateId: id, payload: { id } });
  });
  await writeAudit(db, { actorUserId: actor.id, action: 'integration.deleted', entityType: 'integration', entityId: id, requestId: meta.requestId, ipHash: meta.ipHash, userAgent: meta.userAgent });
}

// Teste síncrono de disparo (§17.10): uma única tentativa, feedback imediato,
// registrada em integration_runs como qualquer entrega.
export async function testIntegration(db: Db, actor: AuthUser, id: string, meta: Meta) {
  const integration = await db.integration.findFirst({ where: { id, deletedAt: null } });
  if (!integration) throw Errors.notFound('INTEGRATION_NOT_FOUND', 'Integração não encontrada.');

  const res = await deliverWebhook(db, {
    integration,
    externalEvent: 'teste',
    eventId: null,
    payload: { teste: true, por: actor.publicKey, em: new Date().toISOString() },
    attempt: 1,
    isFinalAttempt: true,
  });
  await writeAudit(db, {
    actorUserId: actor.id, action: 'integration.tested', entityType: 'integration', entityId: id,
    requestId: meta.requestId, ipHash: meta.ipHash, userAgent: meta.userAgent,
  });
  return res;
}

export async function listRuns(db: Db, limit = 50) {
  const rows = await db.integrationRun.findMany({
    include: { integration: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: Math.min(200, limit),
  });
  return rows.map((r) => ({
    id: r.id,
    source: r.integration.name,
    event: r.eventName,
    when: r.createdAt.toISOString(),
    ok: r.status === 'SUCCESS',
    status: r.status,
  }));
}
