// Envio de e-mail por SMTP (Nodemailer). Transporte único, criado sob demanda.
// Sem SMTP_HOST configurado o envio é desligado: a mensagem não é enviada e o
// chamador recebe `false`. Isso mantém desenvolvimento e teste funcionando sem
// servidor de e-mail, sem mascarar falha em produção (o chamador registra o log).
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env.js';
import { logger } from '../logging/logger.js';

export type Mail = { to: string; subject: string; text: string; html?: string };

let transporter: Transporter | null = null;

export function isMailEnabled(): boolean {
  return Boolean(env.SMTP_HOST);
}

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    });
  }
  return transporter;
}

// Retorna true quando o servidor SMTP aceitou a mensagem. Nunca lança: uma falha
// de e-mail não pode derrubar o fluxo que a originou nem vazar o motivo ao cliente.
export async function sendMail(mail: Mail): Promise<boolean> {
  if (!isMailEnabled()) return false;
  const from = env.MAIL_FROM ?? env.SMTP_USER;
  if (!from) {
    logger.error('SMTP configurado sem MAIL_FROM nem SMTP_USER; e-mail não enviado');
    return false;
  }
  try {
    await getTransporter().sendMail({
      from,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      ...(mail.html ? { html: mail.html } : {}),
    });
    return true;
  } catch (err) {
    // Só o motivo técnico, sem corpo da mensagem nem token.
    logger.error({ err: (err as Error).message, subject: mail.subject }, 'falha ao enviar e-mail');
    return false;
  }
}
