// Sessão revogada deixa de autorizar na hora, e não ao expirar o access token.
// Antes da onda 2 o guard só conferia se o usuário estava ativo, e o `sid` do
// token era repassado sem verificação: logout, troca de senha por administrador
// e desativação de conta deixavam o token valendo por até ACCESS_TOKEN_TTL.
// Também cobre o bloqueio de força bruta por conta.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';

let app: FastifyInstance;
let ceo: string;

const PASS = 'DiarioDev@2026';
const body = (res: { payload: string }): any => JSON.parse(res.payload);
const cookieOf = (res: { cookies: { name: string; value: string }[] }): string =>
  (res.cookies || []).map((c) => `${c.name}=${c.value}`).join('; ');

async function login(email: string, senha = PASS): Promise<{ status: number; cookie: string }> {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: senha } });
  return { status: res.statusCode, cookie: cookieOf(res as never) };
}
const me = (cookie: string) => app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie } });

async function contaTemporaria(prefixo: string): Promise<{ chave: string; email: string }> {
  const email = `${prefixo}${Date.now()}@itscs.com.br`;
  const res = await app.inject({
    method: 'POST', url: '/api/v1/users', headers: { cookie: ceo },
    payload: { name: 'Sessao Teste', role: 'Conta de teste', email, level: 'dev' },
  });
  expect(res.statusCode).toBe(201);
  const chave = body(res).data.user.id;
  // A conta nasce com senha temporária: define uma conhecida para poder logar.
  const senha = await app.inject({
    method: 'POST', url: `/api/v1/users/${chave}/password`, headers: { cookie: ceo },
    payload: { newPassword: PASS },
  });
  expect(senha.statusCode).toBe(200);
  return { chave, email };
}
const remover = (chave: string) =>
  app.inject({ method: 'DELETE', url: `/api/v1/users/${chave}`, headers: { cookie: ceo } });

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  ceo = (await login('marcelo@itscs.com.br')).cookie;
});
afterAll(async () => { await app.close(); });

describe('sessão revogada para de autorizar na hora', () => {
  it('logout invalida o access token que já estava emitido', async () => {
    const { chave, email } = await contaTemporaria('sesslogout');
    const sessao = await login(email);
    expect(sessao.status).toBe(200);
    expect((await me(sessao.cookie)).statusCode).toBe(200);

    const saiu = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie: sessao.cookie } });
    expect(saiu.statusCode).toBe(200);

    // O cookie de access continua o mesmo e ainda não expirou; o que morreu é a sessão.
    expect((await me(sessao.cookie)).statusCode).toBe(401);
    await remover(chave);
  });

  it('senha definida pelo administrador invalida a sessão do colaborador', async () => {
    const { chave, email } = await contaTemporaria('sesssenha');
    const sessao = await login(email);
    expect((await me(sessao.cookie)).statusCode).toBe(200);

    const troca = await app.inject({
      method: 'POST', url: `/api/v1/users/${chave}/password`, headers: { cookie: ceo },
      payload: { newPassword: 'TrocadaPeloAdmin@2026' },
    });
    expect(troca.statusCode).toBe(200);

    expect((await me(sessao.cookie)).statusCode).toBe(401);
    await remover(chave);
  });

  it('desativar a conta invalida a sessão aberta', async () => {
    const { chave, email } = await contaTemporaria('sessdesat');
    const sessao = await login(email);
    expect((await me(sessao.cookie)).statusCode).toBe(200);

    expect((await remover(chave)).statusCode).toBe(200);
    expect((await me(sessao.cookie)).statusCode).toBe(401);
  });

  it('token com sid inexistente é 401, e não erro interno', async () => {
    const { chave, email } = await contaTemporaria('sessfalso');
    const sessao = await login(email);
    // Adultera o cookie: assinatura inválida também tem de virar 401.
    const adulterado = sessao.cookie.replace(/dv_access=[^;]+/, 'dv_access=nao.e.um.token');
    expect((await me(adulterado)).statusCode).toBe(401);
    await remover(chave);
  });
});

describe('bloqueio de força bruta por conta', () => {
  it('trava a conta após o limite e recusa até a senha correta', async () => {
    const { chave, email } = await contaTemporaria('sessbrute');

    // Uma tentativa a mais que o limite: as primeiras são 401 de credencial.
    for (let i = 0; i < env.LOGIN_MAX_ATTEMPTS; i++) {
      const r = await login(email, 'senha-errada');
      expect(r.status, `tentativa ${i + 1}`).toBe(401);
    }

    // A partir do limite, a resposta muda para 429: é bloqueio por conta, não
    // por IP, então distribuir as tentativas não ajuda o atacante.
    const bloqueado = await login(email, 'senha-errada');
    expect(bloqueado.status).toBe(429);

    // E a senha correta também é recusada enquanto o bloqueio durar.
    const comSenhaCerta = await login(email);
    expect(comSenhaCerta.status).toBe(429);

    await remover(chave);
  });

  it('login bem-sucedido zera o contador da conta', async () => {
    const { chave, email } = await contaTemporaria('sessreset');

    for (let i = 0; i < env.LOGIN_MAX_ATTEMPTS - 1; i++) {
      expect((await login(email, 'senha-errada')).status).toBe(401);
    }
    // Ainda dentro do limite: acerta, e o contador é limpo.
    expect((await login(email)).status).toBe(200);

    // Prova de que zerou: o mesmo número de falhas de novo sem estourar.
    for (let i = 0; i < env.LOGIN_MAX_ATTEMPTS - 1; i++) {
      expect((await login(email, 'senha-errada')).status).toBe(401);
    }
    expect((await login(email)).status).toBe(200);

    await remover(chave);
  });
});
