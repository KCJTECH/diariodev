// Envio de e-mail por SMTP (Nodemailer) com a configuração vinda do BANCO
// (app_settings.mail), não de variáveis de ambiente: quem administra troca o
// servidor e o remetente pela tela, sem acesso ao servidor. Ver
// docs/AUTENTICACAO_E_PERMISSOES.md.
//
// Regras que este módulo garante:
// - Nunca lança. Toda falha volta como { ok: false, code } — o chamador decide o
//   que fazer. Isso importa porque requestPasswordReset dispara o envio sem
//   await (para não revelar por tempo se a conta existe), e uma exceção escapando
//   ali viraria rejeição não tratada no processo.
// - Nunca liga `logger`/`debug` do nodemailer: essas opções despejam o diálogo
//   SMTP inteiro, incluindo o AUTH em base64 (usuário e senha).
// - A conexão exige criptografia (requireTLS quando não é TLS direto): em
//   STARTTLS oportunista, um relay que não ofereça TLS faria a senha trafegar em
//   claro na rede interna. Falhar alto é melhor que degradar em silêncio.
import nodemailer, { type Transporter } from 'nodemailer';
import { createHash } from 'node:crypto';
import type { Db } from '../database/prisma.js';
import { env } from '../../config/env.js';
import { logger } from '../logging/logger.js';
import { decryptSecret } from '../utils/crypto.js';

export type Mail = { to: string; subject: string; text: string; html?: string };

export type MailCode =
  | 'OK'
  | 'DISABLED' // desligado por MAIL_ENABLED (ambiente) ou pelo interruptor da tela
  | 'NOT_CONFIGURED' // falta servidor ou remetente
  | 'CRYPTO' // senha salva não decripta com a ENCRYPTION_KEY atual
  | 'CONNECTION' // não conectou (host, porta, rede, timeout)
  | 'AUTH' // usuário ou senha recusados
  | 'TLS' // falha de criptografia na conexão
  | 'SENDER' // remetente recusado pelo servidor
  | 'RECIPIENT' // destinatário recusado
  | 'UNKNOWN';

export type MailResult = { ok: boolean; code: MailCode };

// Formato de app_settings.mail. `secure` e `requireTLS` não são campos da tela:
// são derivados da porta em resolveConfig.
export type MailConfig = {
  enabled: boolean;
  host: string;
  port: number;
  user: string;
  encryptedSecret: string | null;
  fromEmail: string;
};

// Nome de exibição do remetente. Fixo de propósito: só o endereço é configurável.
const FROM_NAME = 'Diário Dev ITS';

const CONFIG_TTL_MS = 30_000;
let configCache: { at: number; config: MailConfig | null } | null = null;
// Um transporter por servidor, porque integrações podem enviar de contas
// diferentes: com um único slot, cada envio de uma conta descartaria o
// transporter da outra e o pool nunca se aproveitaria.
const transportCache = new Map<string, Transporter>();
const MAX_TRANSPORTES = 8;

// Chamado pelo serviço de settings depois de gravar, para o efeito ser imediato
// no processo da API. O worker é outro processo e não recebe esta chamada: quem
// cobre ele é o TTL do cache de configuração.
export function invalidateMailCache(): void {
  configCache = null;
}

function parseConfig(raw: unknown): MailConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const host = typeof r.host === 'string' ? r.host.trim() : '';
  const fromEmail = typeof r.fromEmail === 'string' ? r.fromEmail.trim() : '';
  if (!host || !fromEmail) return null;
  return {
    enabled: r.enabled !== false,
    host,
    port: typeof r.port === 'number' ? r.port : 587,
    user: typeof r.user === 'string' ? r.user.trim() : '',
    encryptedSecret: typeof r.encryptedSecret === 'string' ? r.encryptedSecret : null,
    fromEmail,
  };
}

async function loadConfig(db: Db): Promise<MailConfig | null> {
  const now = Date.now();
  if (configCache && now - configCache.at < CONFIG_TTL_MS) return configCache.config;
  // orderBy fixo: app_settings é singleton por convenção, não por constraint.
  const row = await db.appSetting.findFirst({ orderBy: { createdAt: 'asc' }, select: { mail: true } });
  const config = parseConfig(row?.mail);
  configCache = { at: now, config };
  return config;
}

// Porta 465 fala TLS desde o handshake; nas outras o TLS entra por STARTTLS.
export function secureForPort(port: number): boolean {
  return port === 465;
}

function fingerprintOf(config: MailConfig, password: string): string {
  // Hash da senha, nunca a senha: a chave do cache não pode ser um segredo em claro.
  const passHash = password ? createHash('sha256').update(password).digest('base64') : '';
  return [config.host, config.port, config.user, passHash].join('|');
}

function getTransporter(config: MailConfig, password: string): Transporter {
  const fingerprint = fingerprintOf(config, password);
  const emCache = transportCache.get(fingerprint);
  if (emCache) return emCache;
  const secure = secureForPort(config.port);
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure,
    // Sem TLS direto, exige STARTTLS: sem isto a senha pode ir em claro.
    requireTLS: !secure,
    auth: config.user ? { user: config.user, pass: password } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  // Teto simples: se passar do limite, descarta o mais antigo. Evita acumular
  // conexão para servidor que deixou de ser usado.
  if (transportCache.size >= MAX_TRANSPORTES) {
    const maisAntigo = transportCache.keys().next().value;
    if (maisAntigo) {
      transportCache.get(maisAntigo)?.close();
      transportCache.delete(maisAntigo);
    }
  }
  transportCache.set(fingerprint, transporter);
  return transporter;
}

// Classifica a falha para a tela mostrar o que corrigir. Não distingue os
// motivos de "não conectou" (host inexistente, recusado, tempo esgotado): essa
// distinção é justamente o que transformaria a rota de teste em varredura de
// rede. O detalhe fica só no log interno.
function classify(err: unknown): MailCode {
  const e = err as { code?: string; responseCode?: number; command?: string; message?: string };
  const code = e?.code ?? '';
  const response = e?.responseCode ?? 0;
  if (code === 'EAUTH' || response === 535 || response === 534) return 'AUTH';
  if (code === 'ESOCKET' || code === 'ETLS' || /tls|ssl|certificate/i.test(e?.message ?? '')) return 'TLS';
  if (code === 'ECONNECTION' || code === 'ETIMEDOUT' || code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EDNS') {
    return 'CONNECTION';
  }
  if (code === 'EENVELOPE') {
    // 550/553 no MAIL FROM é remetente; no RCPT TO é destinatário.
    return e?.command === 'RCPT TO' ? 'RECIPIENT' : 'SENDER';
  }
  if (response === 550 || response === 553) return 'RECIPIENT';
  return 'UNKNOWN';
}

// Total: qualquer erro (banco, decriptação, transporte) volta como código.
//
// `proprio` permite enviar por um servidor específico em vez do servidor do
// sistema: é o que faz uma integração de e-mail sair de outra conta. Quando
// ausente (ou sem host), cai no servidor do sistema.
export async function sendMailResult(db: Db, mail: Mail, proprio?: MailConfig | null): Promise<MailResult> {
  // Antes de qualquer I/O, para que teste não dependa do estado do banco.
  if (!env.MAIL_ENABLED) return { ok: false, code: 'DISABLED' };
  try {
    const config = proprio?.host ? proprio : await loadConfig(db);
    if (!config) return { ok: false, code: 'NOT_CONFIGURED' };
    if (!config.enabled) return { ok: false, code: 'DISABLED' };

    let password = '';
    if (config.encryptedSecret) {
      try {
        password = decryptSecret(config.encryptedSecret);
      } catch {
        // Chave mestra divergente do valor com que a senha foi gravada.
        logger.error('senha do servidor de e-mail não decripta com a ENCRYPTION_KEY atual');
        return { ok: false, code: 'CRYPTO' };
      }
    }

    await getTransporter(config, password).sendMail({
      from: `"${FROM_NAME}" <${config.fromEmail}>`,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      ...(mail.html ? { html: mail.html } : {}),
    });
    return { ok: true, code: 'OK' };
  } catch (err) {
    const code = classify(err);
    // Só o motivo técnico e o assunto: nunca o corpo (que carrega o link de
    // redefinição) nem as credenciais.
    logger.error({ err: (err as Error).message, code, subject: mail.subject }, 'falha ao enviar e-mail');
    return { ok: false, code };
  }
}

// Açúcar para quem só quer saber se saiu.
export async function sendMail(db: Db, mail: Mail): Promise<boolean> {
  return (await sendMailResult(db, mail)).ok;
}
