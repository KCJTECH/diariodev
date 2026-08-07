// Entrega de um webhook (uma tentativa). Valida SSRF, assina com HMAC, aplica
// timeout e limite de redirecionamento, registra a execução em integration_runs
// e publica integration.run.updated para o realtime dos administradores.
import { IntegrationRunStatus, type Integration } from '@prisma/client';
import type { Db } from '../../../common/database/prisma.js';
import { logger } from '../../../common/logging/logger.js';
import { decryptSecret } from '../../../common/utils/crypto.js';
import { sendMailResult, type MailConfig } from '../../../common/mail/mailer.js';
import { assertSafeUrl, signPayload, SsrfError } from './security.js';

export type DeliverInput = {
  integration: Integration;
  externalEvent: string;
  eventId: string | null;
  payload: unknown;
  attempt: number;
  isFinalAttempt: boolean;
};

export type DeliverResult = { ok: boolean; httpStatus?: number; errorCode?: string };

const MAX_EXCERPT = 500;

// Entrega por e-mail. O endpoint guarda os destinatários (separados por vírgula
// ou ponto e vírgula, como a tela sugere). O corpo é texto legível, não JSON:
// quem recebe é uma pessoa, não um sistema.
async function deliverByEmail(
  db: Db,
  integration: Integration,
  externalEvent: string,
  envelope: { event: string; id: string | null; occurredAt: string; data: unknown },
): Promise<{ ok: boolean; code: string; to: string }> {
  // O marcador {responsavel} vira o e-mail de quem a tarefa foi atribuída, que é
  // o destino natural do aviso de "tarefa encaminhada". Sem ele, a integração só
  // alcançaria a lista fixa de endereços, e não a pessoa que precisa saber.
  const dados = envelope.data as { responsavel?: { email?: string } } | null;
  const doResponsavel = dados?.responsavel?.email ?? '';

  const to = (integration.endpoint ?? '')
    .split(/[,;]/)
    .map((e) => e.trim())
    .flatMap((e) => (e === '{responsavel}' ? (doResponsavel ? [doResponsavel] : []) : e ? [e] : []))
    .filter((e, i, arr) => arr.indexOf(e) === i) // sem repetir destinatário
    .join(', ');
  if (!to) return { ok: false, code: 'NO_RECIPIENT', to: '' };

  const { subject, text } = corpoDoAviso(integration, externalEvent, envelope);
  // Servidor próprio desta integração, quando configurado: é o que permite dois
  // avisos saírem de contas diferentes. Sem host, usa o servidor do sistema.
  const result = await sendMailResult(db, { to, subject, text }, configPropria(integration));
  return { ok: result.ok, code: result.code, to };
}

function configPropria(integration: Integration): MailConfig | null {
  const c = (integration.config && typeof integration.config === 'object' ? integration.config : {}) as Record<string, unknown>;
  const host = typeof c.host === 'string' ? c.host.trim() : '';
  if (!host) return null;
  return {
    enabled: true, // a integração já tem o próprio interruptor (enabled)
    host,
    port: typeof c.port === 'number' ? c.port : 587,
    user: typeof c.user === 'string' ? c.user.trim() : '',
    encryptedSecret: integration.encryptedSecret,
    fromEmail: typeof c.fromEmail === 'string' ? c.fromEmail.trim() : '',
  };
}

type TarefaEncaminhada = {
  titulo?: string;
  descricao?: string;
  projeto?: string;
  categoria?: string;
  prioridade?: string;
  prazo?: string | null;
  responsavel?: { nome?: string } | null;
  atribuidaPor?: { nome?: string } | null;
};

// Quem recebe é uma pessoa, então o aviso de tarefa sai em texto corrido. Para os
// demais eventos mantém o JSON, que é o que um fluxo de automação espera.
function corpoDoAviso(
  integration: Integration,
  externalEvent: string,
  envelope: { occurredAt: string; data: unknown },
): { subject: string; text: string } {
  const assinatura = `Enviado pela integração "${integration.name}" do Diário Dev.`;

  if (externalEvent === 'tarefa.encaminhada') {
    const t = (envelope.data ?? {}) as TarefaEncaminhada;
    const prazo = t.prazo ? new Date(`${t.prazo}T12:00:00`).toLocaleDateString('pt-BR') : 'sem prazo definido';
    return {
      subject: `Diário Dev: nova tarefa para você — ${t.titulo ?? 'sem título'}`,
      text: [
        `Olá, ${t.responsavel?.nome ?? ''}.`.trim(),
        '',
        `${t.atribuidaPor?.nome ?? 'A gestão'} encaminhou uma tarefa para você.`,
        '',
        `Tarefa: ${t.titulo ?? '-'}`,
        `Projeto: ${t.projeto ?? '-'}`,
        `Prazo: ${prazo}`,
        `Prioridade: ${(t.prioridade ?? '').toLowerCase() || '-'}`,
        ...(t.categoria ? [`Categoria: ${t.categoria}`] : []),
        ...(t.descricao ? ['', 'Detalhes:', t.descricao] : []),
        '',
        'Ao concluir, registre a atividade no Diário Dev para a tarefa ser fechada.',
        '',
        assinatura,
      ].join('\n'),
    };
  }

  return {
    subject: `Diário Dev: ${externalEvent}`,
    text: [
      `Evento: ${externalEvent}`,
      `Quando: ${new Date(envelope.occurredAt).toLocaleString('pt-BR')}`,
      '',
      JSON.stringify(envelope.data, null, 2),
      '',
      assinatura,
    ].join('\n'),
  };
}

export async function deliverWebhook(db: Db, input: DeliverInput): Promise<DeliverResult> {
  const { integration, externalEvent, eventId, payload, attempt, isFinalAttempt } = input;
  const startedAt = new Date();
  const timestamp = String(startedAt.getTime());
  const envelope = { event: externalEvent, id: eventId, occurredAt: startedAt.toISOString(), data: payload };
  const rawBody = JSON.stringify(envelope);

  let status: IntegrationRunStatus = IntegrationRunStatus.FAILED;
  let httpStatus: number | undefined;
  let errorCode: string | undefined;
  let errorMessage: string | undefined;
  let responseExcerpt: string | undefined;

  try {
    if (!integration.endpoint) throw new SsrfError('Integração sem endpoint.');

    // Integração do tipo e-mail entrega pelo servidor de e-mail configurado na
    // tela, não por POST HTTP: o endpoint aqui é uma lista de destinatários, e
    // tratá-la como URL fazia todo disparo falhar no bloqueio de SSRF.
    if (integration.type === 'email') {
      const result = await deliverByEmail(db, integration, externalEvent, envelope);
      status = result.ok ? IntegrationRunStatus.SUCCESS : IntegrationRunStatus.FAILED;
      if (!result.ok) errorCode = `MAIL_${result.code}`;
      responseExcerpt = result.ok ? `enviado para ${result.to}` : undefined;
    } else {
    const url = await assertSafeUrl(integration.endpoint);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-DiarioDev-Event': externalEvent,
      'X-DiarioDev-Event-Id': eventId ?? '',
      'X-DiarioDev-Timestamp': timestamp,
    };
    if (integration.encryptedSecret) {
      const secret = decryptSecret(integration.encryptedSecret);
      headers['X-DiarioDev-Signature'] = `sha256=${signPayload(secret, timestamp, rawBody)}`;
      // O header X-DiarioDev-Secret foi removido em 2026-08-06. Ele enviava o
      // segredo compartilhado em texto puro, e o endpoint pode ser http://, então
      // o segredo trafegava sem TLS. A assinatura HMAC acima já é a validação
      // recomendada e torna o header redundante. Quem consome deve validar a
      // assinatura sobre "timestamp + '.' + corpo bruto" (§21.2).
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: rawBody,
      redirect: 'error', // não segue redirecionamentos (§21.3)
      signal: AbortSignal.timeout(integration.timeoutMs),
    });
    httpStatus = res.status;
    responseExcerpt = (await res.text()).slice(0, MAX_EXCERPT);
    if (res.ok) status = IntegrationRunStatus.SUCCESS;
    else errorCode = `HTTP_${res.status}`;
    }
  } catch (err) {
    if (err instanceof SsrfError) {
      errorCode = err.code;
      errorMessage = err.message;
    } else if (err instanceof Error) {
      errorCode = err.name === 'TimeoutError' ? 'TIMEOUT' : 'DELIVERY_ERROR';
      errorMessage = err.message.slice(0, 300);
    }
  }

  const finishedAt = new Date();
  if (status !== IntegrationRunStatus.SUCCESS && isFinalAttempt) status = IntegrationRunStatus.DEAD;

  await db.integrationRun.create({
    data: {
      integrationId: integration.id,
      eventId,
      eventName: externalEvent,
      payload: envelope as never,
      attempt,
      status,
      httpStatus: httpStatus ?? null,
      responseExcerpt: responseExcerpt ?? null,
      errorCode: errorCode ?? null,
      errorMessage: errorMessage ?? null,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      startedAt,
      finishedAt,
    },
  });

  // Notifica administradores em tempo real (drenado pelo publicador da API).
  await db.outboxEvent.create({
    data: {
      eventName: 'integration.run.updated',
      aggregateType: 'integration',
      aggregateId: integration.id,
      payload: { integrationId: integration.id, event: externalEvent, ok: status === IntegrationRunStatus.SUCCESS } as never,
    },
  });

  const ok = status === IntegrationRunStatus.SUCCESS;
  if (!ok) logger.warn({ integrationId: integration.id, externalEvent, attempt, errorCode }, 'webhook não entregue');
  return { ok, httpStatus, errorCode };
}
