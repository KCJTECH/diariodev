// Configuração global (aparência/marca) e preferências individuais (§17.11).
// Separadas por design: aparência é da organização (gestor+); preferências são
// do próprio usuário.
import type { Db } from '../../common/database/prisma.js';
import type { AuthUser } from '../../common/auth/types.js';
import { writeOutbox } from '../../common/events/outbox.js';
import { Errors } from '../../common/errors/app-error.js';
import { encryptSecret, decryptSecret } from '../../common/utils/crypto.js';
import { invalidateMailCache, sendMailResult, secureForPort, type MailCode } from '../../common/mail/mailer.js';
import { RESET_BODY_DEFAULT } from '../../common/mail/reset-template.js';
import { writeAudit } from '../audit/audit.service.js';

// app_settings é singleton por convenção, não por constraint: sem orderBy fixo,
// se houver mais de uma linha a leitura escolhe uma indeterminada e a
// configuração "desaparece". Todo acesso passa por aqui.
function appSettingRow(db: Db) {
  return db.appSetting.findFirst({ orderBy: { createdAt: 'asc' } });
}

export async function getAppearance(db: Db): Promise<Record<string, unknown>> {
  const s = await appSettingRow(db);
  return (s?.brand as Record<string, unknown>) ?? {};
}

export async function updateAppearance(db: Db, actor: AuthUser, patch: Record<string, unknown>) {
  const current = await appSettingRow(db);
  const merged = { ...((current?.brand as object) ?? {}), ...patch };

  const result = await db.$transaction(async (tx) => {
    const row = current
      ? await tx.appSetting.update({ where: { id: current.id }, data: { brand: merged as never, updatedBy: actor.id, version: { increment: 1 } } })
      : await tx.appSetting.create({ data: { brand: merged as never, updatedBy: actor.id } });
    await writeOutbox(tx, { eventName: 'settings.appearance.updated', aggregateType: 'settings', aggregateId: row.id, payload: { brand: merged } });
    return row;
  });
  return (result.brand as Record<string, unknown>) ?? {};
}

/* ── servidor de e-mail (app_settings.mail) ──────────────────────────────────
   Editável por gestor+ pela tela, para trocar servidor e remetente sem acesso
   ao servidor. A senha é guardada cifrada e NUNCA sai daqui: a resposta diz
   apenas se está configurada e se ainda é legível com a chave atual. */

export type MailSettingsDto = {
  enabled: boolean;
  host: string;
  port: number;
  user: string;
  fromEmail: string;
  // Texto do e-mail de redefinição. Vem sempre preenchido: quando não há nada
  // salvo, devolve o padrão, para a tela mostrar o texto em vigor e não um campo
  // vazio que sugere que nenhuma mensagem é enviada.
  resetBody: string;
  secretConfigured: boolean;
  // false quando a senha não decripta com a ENCRYPTION_KEY atual (chave trocada).
  // Sem isto, um problema de chave apareceria como "falha de autenticação".
  secretUsable: boolean;
  configured: boolean;
  updatedAt: string | null;
};

export type MailSettingsPatch = {
  enabled?: boolean;
  host?: string;
  port?: number;
  user?: string;
  // Ausente mantém a senha atual; string vazia APAGA (relay sem autenticação);
  // valor novo substitui. Difere do padrão de integrações, onde vazio mantém.
  password?: string;
  fromEmail?: string;
  resetBody?: string;
};

type StoredMail = {
  enabled?: boolean;
  host?: string;
  port?: number;
  user?: string;
  encryptedSecret?: string | null;
  fromEmail?: string;
  resetBody?: string;
  updatedAt?: string;
};

function readStored(row: { mail: unknown } | null): StoredMail {
  const raw = row?.mail;
  return raw && typeof raw === 'object' ? (raw as StoredMail) : {};
}

function toDto(stored: StoredMail): MailSettingsDto {
  let secretUsable = true;
  if (stored.encryptedSecret) {
    try {
      decryptSecret(stored.encryptedSecret);
    } catch {
      secretUsable = false;
    }
  }
  const host = stored.host ?? '';
  const fromEmail = stored.fromEmail ?? '';
  return {
    enabled: stored.enabled !== false,
    host,
    port: stored.port ?? 587,
    user: stored.user ?? '',
    fromEmail,
    resetBody: stored.resetBody?.trim() ? stored.resetBody : RESET_BODY_DEFAULT,
    secretConfigured: Boolean(stored.encryptedSecret),
    secretUsable,
    configured: Boolean(host && fromEmail),
    updatedAt: stored.updatedAt ?? null,
  };
}

export async function getMail(db: Db): Promise<MailSettingsDto> {
  return toDto(readStored(await appSettingRow(db)));
}

export async function updateMail(
  db: Db,
  actor: AuthUser,
  patch: MailSettingsPatch,
  meta: { requestId: string; ipHash: string | null; userAgent: string | null },
): Promise<MailSettingsDto> {
  const current = await appSettingRow(db);
  const stored = readStored(current);

  const encryptedSecret =
    patch.password === undefined ? (stored.encryptedSecret ?? null) // ausente: mantém
    : patch.password === '' ? null // vazio: apaga
    : encryptSecret(patch.password); // novo: grava

  const merged: StoredMail = {
    enabled: patch.enabled ?? stored.enabled ?? true,
    host: (patch.host ?? stored.host ?? '').trim(),
    port: patch.port ?? stored.port ?? 587,
    user: (patch.user ?? stored.user ?? '').trim(),
    encryptedSecret,
    fromEmail: (patch.fromEmail ?? stored.fromEmail ?? '').trim(),
    resetBody: patch.resetBody ?? stored.resetBody,
    updatedAt: new Date().toISOString(),
  };

  // O texto precisa conter {LINK}: sem ele a mensagem sai sem o endereço para
  // redefinir, e o pedido morre em silêncio. Recusar ao salvar é melhor que
  // descobrir depois, com alguém sem acesso esperando um e-mail inútil.
  if (patch.resetBody !== undefined && patch.resetBody.trim() && !patch.resetBody.includes('{LINK}')) {
    throw Errors.validation([
      { field: 'resetBody', message: 'O texto precisa conter {LINK}, que é substituído pelo endereço de redefinição.' },
    ]);
  }

  // Validação só possível depois do merge: o corpo é um patch, então "host
  // obrigatório" não é expressável no schema. Sem isto, ligar o envio sem
  // servidor resultaria em e-mail que nunca sai, com falha só no log.
  if (merged.enabled && (!merged.host || !merged.fromEmail)) {
    throw Errors.validation([
      { field: !merged.host ? 'host' : 'fromEmail', message: 'Informe o servidor e o remetente para ativar o envio.' },
    ]);
  }

  const row = await db.$transaction(async (tx) => {
    const saved = current
      ? await tx.appSetting.update({
          where: { id: current.id },
          data: { mail: merged as never, updatedBy: actor.id, version: { increment: 1 } },
        })
      : await tx.appSetting.create({ data: { mail: merged as never, updatedBy: actor.id } });
    // Payload SEM valores: eventos settings.* são difundidos e ficam gravados
    // para sempre no outbox. Só os nomes dos campos alterados.
    await writeOutbox(tx, {
      eventName: 'settings.mail.updated',
      aggregateType: 'settings',
      aggregateId: saved.id,
      payload: { changed: Object.keys(patch) },
    });
    return saved;
  });

  // Efeito imediato no processo que acabou de salvar (o worker cai pelo TTL).
  invalidateMailCache();

  // Auditoria com host e usuário, sem segredo: é o transporte que carrega o link
  // de redefinição de senha, então quem o aponta para outro servidor precisa
  // ficar registrado. Settings não audita o resto; esta é a exceção deliberada.
  await writeAudit(db, {
    actorUserId: actor.id,
    action: 'settings.mail.updated',
    entityType: 'settings',
    entityId: row.id,
    requestId: meta.requestId,
    ipHash: meta.ipHash,
    userAgent: meta.userAgent,
    before: { host: stored.host ?? '', port: stored.port ?? null, user: stored.user ?? '', fromEmail: stored.fromEmail ?? '' },
    after: {
      host: merged.host,
      port: merged.port,
      user: merged.user,
      fromEmail: merged.fromEmail,
      enabled: merged.enabled,
      secretChanged: patch.password !== undefined,
    },
  });

  return toDto(merged);
}

// Envia um e-mail de teste para o PRÓPRIO usuário logado, com a configuração
// salva. Nunca aceita destinatário do corpo: isso impediria usar o servidor como
// relay e exfiltrar a validação para um endereço escolhido por quem chama.
export async function testMail(
  db: Db,
  actor: AuthUser,
  meta: { requestId: string; ipHash: string | null; userAgent: string | null },
): Promise<{ ok: boolean; code: MailCode; to: string; message: string }> {
  const started = Date.now();
  const result = await sendMailResult(db, {
    to: actor.email,
    subject: 'Diário Dev: teste de envio',
    text: [
      `Olá, ${actor.name}.`,
      '',
      'Este é um teste de envio disparado pela tela de Configurações do Diário Dev.',
      'Se você recebeu esta mensagem, o servidor de e-mail está configurado corretamente.',
      '',
      'Diário Dev ITS',
    ].join('\n'),
  });

  await writeAudit(db, {
    actorUserId: actor.id,
    action: 'settings.mail.tested',
    entityType: 'settings',
    entityId: actor.id,
    requestId: meta.requestId,
    ipHash: meta.ipHash,
    userAgent: meta.userAgent,
    after: { code: result.code, durationMs: Date.now() - started },
  });

  return { ok: result.ok, code: result.code, to: actor.email, message: messageFor(result.code) };
}

// Mensagem em português para quem administra, sem banner nem errno do servidor.
function messageFor(code: MailCode): string {
  const map: Record<MailCode, string> = {
    OK: 'E-mail de teste enviado. Confira a sua caixa de entrada.',
    DISABLED: 'O envio de e-mail está desligado.',
    NOT_CONFIGURED: 'Preencha o servidor e o remetente antes de testar.',
    CRYPTO: 'A senha salva não pode ser lida com a chave atual. Grave a senha novamente.',
    CONNECTION: 'Não foi possível conectar ao servidor informado. Confira o endereço e a porta.',
    AUTH: 'Usuário ou senha recusados pelo servidor de e-mail.',
    TLS: 'Falha de criptografia na conexão com o servidor.',
    SENDER: 'O servidor recusou o remetente configurado.',
    RECIPIENT: 'O servidor recusou o destinatário.',
    UNKNOWN: 'Falha não identificada no envio. Verifique os dados e tente novamente.',
  };
  return map[code];
}

// Exportado para o serviço de integrações reusar a mesma dedução.
export { secureForPort };

export type PreferencesDto = {
  collapsed: boolean;
  density: string;
  theme: string;
  defaultProjectId: string | null;
  extra: Record<string, unknown>;
};

export async function getPreferences(db: Db, actor: AuthUser): Promise<PreferencesDto> {
  const p = await db.userPreference.findUnique({ where: { userId: actor.id } });
  return {
    collapsed: p?.collapsed ?? false,
    density: p?.density ?? 'confortável',
    theme: p?.themePreference ?? 'light',
    defaultProjectId: p?.defaultProjectId ?? null,
    extra: (p?.extraPreferences as Record<string, unknown>) ?? {},
  };
}

export type PreferencesPatch = {
  collapsed?: boolean;
  density?: string;
  theme?: string;
  defaultProjectId?: string | null;
  extra?: Record<string, unknown>;
};

export async function updatePreferences(db: Db, actor: AuthUser, patch: PreferencesPatch): Promise<PreferencesDto> {
  const existing = await db.userPreference.findUnique({ where: { userId: actor.id } });
  const mergedExtra = { ...((existing?.extraPreferences as object) ?? {}), ...(patch.extra ?? {}) };

  const p = await db.userPreference.upsert({
    where: { userId: actor.id },
    update: {
      collapsed: patch.collapsed,
      density: patch.density,
      themePreference: patch.theme,
      defaultProjectId: patch.defaultProjectId ?? undefined,
      extraPreferences: patch.extra ? (mergedExtra as never) : undefined,
    },
    create: {
      userId: actor.id,
      collapsed: patch.collapsed ?? false,
      density: patch.density ?? 'confortável',
      themePreference: patch.theme ?? 'light',
      defaultProjectId: patch.defaultProjectId ?? null,
      extraPreferences: mergedExtra as never,
    },
  });
  return {
    collapsed: p.collapsed,
    density: p.density,
    theme: p.themePreference,
    defaultProjectId: p.defaultProjectId,
    extra: (p.extraPreferences as Record<string, unknown>) ?? {},
  };
}
