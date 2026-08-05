// Fluxo de redefinição de senha pela tela de login: solicitação pública,
// resposta neutra, token de uso único e revogação de sessões.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/common/database/prisma.js';
import { requestPasswordReset } from '../../src/modules/auth/auth.service.js';

const PASS = 'DiarioDev@2026';
const EMAIL = 'elaine@itscs.com.br';
let app: FastifyInstance;

function body(res: { payload: string }): any {
  return JSON.parse(res.payload);
}

async function restorePassword(): Promise<void> {
  const r = await requestPasswordReset(prisma, EMAIL);
  await app.inject({
    method: 'POST',
    url: '/api/v1/auth/password-reset/confirm',
    payload: { token: r.token, newPassword: PASS },
  });
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});
afterAll(async () => {
  // Devolve a senha do seed para não quebrar os outros arquivos de teste.
  await restorePassword();
  await app.close();
});

describe('solicitação de redefinição', () => {
  it('e-mail existente → 200 e token criado', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { email: EMAIL } });
    const before = await prisma.passwordResetToken.count({ where: { userId: user.id } });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/request',
      payload: { email: EMAIL },
    });
    expect(res.statusCode).toBe(200);
    const after = await prisma.passwordResetToken.count({ where: { userId: user.id } });
    expect(after).toBe(before + 1);
  });

  it('não expõe token nem existência da conta na resposta', async () => {
    const existe = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/request',
      payload: { email: EMAIL },
    });
    const naoExiste = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/request',
      payload: { email: 'ninguem-aqui@itscs.com.br' },
    });
    expect(existe.statusCode).toBe(naoExiste.statusCode);
    expect(body(existe).data).toEqual(body(naoExiste).data);
    expect(existe.payload).not.toMatch(/token/i);
  });

  it('e-mail inválido → 422', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/request',
      payload: { email: 'nao-e-email' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('pedido novo invalida o token anterior', async () => {
    const primeiro = await requestPasswordReset(prisma, EMAIL);
    await requestPasswordReset(prisma, EMAIL);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/confirm',
      payload: { token: primeiro.token, newPassword: 'SenhaQualquer@123' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('conclusão da redefinição', () => {
  it('token válido troca a senha, revoga sessões e não serve duas vezes', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: EMAIL, password: PASS },
    });
    expect(login.statusCode).toBe(200);
    const cookie = (login.cookies || []).map((c) => `${c.name}=${c.value}`).join('; ');

    const nova = 'TrocaPelaTela@2026';
    const pedido = await requestPasswordReset(prisma, EMAIL);
    const confirma = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/confirm',
      payload: { token: pedido.token, newPassword: nova },
    });
    expect(confirma.statusCode).toBe(200);

    // A sessão aberta antes da troca deixa de valer: o refresh é recusado, então
    // ela não se renova. O access token já emitido só morre ao expirar, porque o
    // guard não consulta a sessão a cada requisição (limitação conhecida).
    const renova = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', headers: { cookie } });
    expect(renova.statusCode).toBe(401);

    // A senha nova entra e a antiga não.
    const antiga = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: EMAIL, password: PASS },
    });
    expect(antiga.statusCode).toBe(401);
    const comNova = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: EMAIL, password: nova },
    });
    expect(comNova.statusCode).toBe(200);

    // Token de uso único.
    const reuso = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/confirm',
      payload: { token: pedido.token, newPassword: 'OutraSenha@456' },
    });
    expect(reuso.statusCode).toBe(401);
  });

  it('token expirado → 401', async () => {
    const pedido = await requestPasswordReset(prisma, EMAIL);
    const user = await prisma.user.findFirstOrThrow({ where: { email: EMAIL } });
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/confirm',
      payload: { token: pedido.token, newPassword: 'SenhaNova@789' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('senha curta → 422 e token continua válido', async () => {
    const pedido = await requestPasswordReset(prisma, EMAIL);
    const curta = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/confirm',
      payload: { token: pedido.token, newPassword: 'abc' },
    });
    expect(curta.statusCode).toBe(422);
    const ok = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/confirm',
      payload: { token: pedido.token, newPassword: 'SenhaBoa@2026' },
    });
    expect(ok.statusCode).toBe(200);
  });
});
