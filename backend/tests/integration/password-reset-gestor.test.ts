// Destino do link de redefinição quando a conta não tem caixa que alguém leia, ou
// quando o envio ao titular falha: o link vai para os gestores, que repassam ao
// responsável. O mailer é interceptado porque no ambiente de teste o SMTP está
// desligado, e sem isso não há como observar o destinatário.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

const enviados: { to: string; subject: string }[] = [];
let falharNoTitular = false;

vi.mock('../../src/common/mail/mailer.js', () => ({
  isMailEnabled: () => true,
  sendMail: async (mail: { to: string; subject: string }) => {
    enviados.push({ to: mail.to, subject: mail.subject });
    // Só o primeiro envio (ao titular) falha quando o teste pede.
    if (falharNoTitular && enviados.length === 1) return false;
    return true;
  },
}));

const { buildApp } = await import('../../src/app.js');
const { prisma } = await import('../../src/common/database/prisma.js');

const SEM_CAIXA = 'camila@itscs.com.br'; // declarada em PASSWORD_RESET_VIA_GESTOR
const COM_CAIXA = 'elaine@itscs.com.br';
const GESTOR = 'laerty@itscs.com.br';
let app: FastifyInstance;

async function pedir(email: string): Promise<number> {
  const res = await app.inject({
    method: 'POST', url: '/api/v1/auth/password-reset/request', payload: { email },
  });
  // O envio não é aguardado pela resposta; dá tempo de a promessa concluir.
  await new Promise((r) => setTimeout(r, 150));
  return res.statusCode;
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});
afterAll(async () => { await app.close(); });
beforeEach(() => { enviados.length = 0; falharNoTitular = false; });

describe('destino do link de redefinição', () => {
  it('conta com caixa própria recebe o link ela mesma', async () => {
    expect(await pedir(COM_CAIXA)).toBe(200);
    expect(enviados).toHaveLength(1);
    expect(enviados[0]!.to).toBe(COM_CAIXA);
  });

  it('conta sem caixa própria: o link vai para o gestor, e não para ela', async () => {
    expect(await pedir(SEM_CAIXA)).toBe(200);
    expect(enviados).toHaveLength(1);
    expect(enviados[0]!.to).toContain(GESTOR);
    expect(enviados[0]!.to).not.toContain(SEM_CAIXA);
    // O gestor precisa saber de quem é o link que ele vai repassar.
    expect(enviados[0]!.subject).toContain('Camila');
  });

  it('se o envio ao titular falha, o gestor recebe o link', async () => {
    falharNoTitular = true;
    expect(await pedir(COM_CAIXA)).toBe(200);
    expect(enviados).toHaveLength(2);
    expect(enviados[0]!.to).toBe(COM_CAIXA);
    expect(enviados[1]!.to).toContain(GESTOR);
  });

  it('o gestor que pede a própria senha recebe direto, sem passar por outro', async () => {
    expect(await pedir(GESTOR)).toBe(200);
    expect(enviados).toHaveLength(1);
    expect(enviados[0]!.to).toBe(GESTOR);
  });

  it('conta inexistente não dispara e-mail nenhum e a resposta não muda', async () => {
    expect(await pedir('ninguem-mesmo@itscs.com.br')).toBe(200);
    expect(enviados).toHaveLength(0);
  });

  it('o token criado é do titular, não do gestor', async () => {
    const camila = await prisma.user.findFirstOrThrow({ where: { email: SEM_CAIXA } });
    const antes = await prisma.passwordResetToken.count({ where: { userId: camila.id } });
    await pedir(SEM_CAIXA);
    const depois = await prisma.passwordResetToken.count({ where: { userId: camila.id } });
    expect(depois).toBe(antes + 1);
  });
});
