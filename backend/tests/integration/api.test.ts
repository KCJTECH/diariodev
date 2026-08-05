import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';

const PASS = 'DiarioDev@2026';
let app: FastifyInstance;

function body(res: { payload: string }): any {
  return JSON.parse(res.payload);
}
function cookieOf(res: { cookies: { name: string; value: string }[] }): string {
  return (res.cookies || []).map((c) => `${c.name}=${c.value}`).join('; ');
}
async function login(email: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: PASS } });
  expect(res.statusCode, `login ${email}`).toBe(200);
  return cookieOf(res as never);
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});
afterAll(async () => {
  await app.close();
});

describe('autenticação', () => {
  it('login válido devolve usuário e cookies', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'elaine@itscs.com.br', password: PASS } });
    expect(res.statusCode).toBe(200);
    expect(body(res).data.user.level).toBe('dev');
    const names = (res.cookies || []).map((c) => c.name);
    expect(names).toContain('dv_access');
    expect(names).toContain('dv_refresh');
  });

  it('login inválido → 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'elaine@itscs.com.br', password: 'errada' } });
    expect(res.statusCode).toBe(401);
    expect(body(res).error.code).toBe('INVALID_CREDENTIALS');
  });

  it('/me exige sessão', async () => {
    const anon = await app.inject({ method: 'GET', url: '/api/v1/auth/me' });
    expect(anon.statusCode).toBe(401);
    const cookie = await login('elaine@itscs.com.br');
    const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(body(me).data.user.publicKey).toBe('elaine');
  });

  it('rejeita origem não permitida (CSRF)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin: 'http://evil.com' }, payload: { email: 'elaine@itscs.com.br', password: PASS } });
    expect(res.statusCode).toBe(403);
    expect(body(res).error.code).toBe('FORBIDDEN');
  });
});

describe('bootstrap e escopo por nível', () => {
  it('dev vê visão pessoal; ceo administra e vê tudo', async () => {
    const devBoot = body(await app.inject({ method: 'GET', url: '/api/v1/bootstrap', headers: { cookie: await login('elaine@itscs.com.br') } })).data;
    const ceoBoot = body(await app.inject({ method: 'GET', url: '/api/v1/bootstrap', headers: { cookie: await login('marcelo@itscs.com.br') } })).data;
    expect(devBoot.canAdminister).toBe(false);
    expect(ceoBoot.canAdminister).toBe(true);
    expect(ceoBoot.activities.length).toBeGreaterThan(devBoot.activities.length);
  });

  it('GET /activities filtra por autor para dev, não para ceo', async () => {
    const dev = body(await app.inject({ method: 'GET', url: '/api/v1/activities?perPage=200', headers: { cookie: await login('elaine@itscs.com.br') } }));
    const authorsDev = new Set(dev.data.map((a: any) => a.who));
    expect([...authorsDev]).toEqual(['elaine']);

    const ceo = body(await app.inject({ method: 'GET', url: '/api/v1/activities?perPage=200', headers: { cookie: await login('marcelo@itscs.com.br') } }));
    const authorsCeo = new Set(ceo.data.map((a: any) => a.who));
    expect(authorsCeo.size).toBeGreaterThan(1);
  });
});

describe('atividades: escrita e concorrência otimista', () => {
  it('cria, detecta conflito de versão e aplica update', async () => {
    const cookie = await login('elaine@itscs.com.br');
    const created = await app.inject({
      method: 'POST', url: '/api/v1/activities', headers: { cookie },
      payload: { proj: 'Portal ITS', cat: 'Entrega', title: 'Integração smoke', occurredAt: '2026-08-03T10:00:00-03:00', priority: 'alta' },
    });
    expect(created.statusCode).toBe(201);
    const id = body(created).data.id;
    expect(body(created).data.version).toBe(1);

    const stale = await app.inject({
      method: 'PATCH', url: `/api/v1/activities/${id}`, headers: { cookie },
      payload: { proj: 'Portal ITS', cat: 'Entrega', title: 'x', occurredAt: '2026-08-03T10:00:00-03:00', priority: 'alta', version: 999 },
    });
    expect(stale.statusCode).toBe(409);
    expect(body(stale).error.code).toBe('VERSION_CONFLICT');

    const ok = await app.inject({
      method: 'PATCH', url: `/api/v1/activities/${id}`, headers: { cookie },
      payload: { proj: 'Portal ITS', cat: 'Correção', title: 'Editada', occurredAt: '2026-08-03T10:00:00-03:00', priority: 'baixa', version: 1 },
    });
    expect(ok.statusCode).toBe(200);
    expect(body(ok).data.version).toBe(2);
    expect(body(ok).data.cat).toBe('Correção');
  });
});

describe('tarefas: permissão e conclusão', () => {
  it('dev não cria tarefa; ceo cria e responsável conclui', async () => {
    const devCookie = await login('elaine@itscs.com.br');
    const forbidden = await app.inject({ method: 'POST', url: '/api/v1/tasks', headers: { cookie: devCookie }, payload: { title: 'não pode', proj: 'Portal ITS', pri: 'alta' } });
    expect(forbidden.statusCode).toBe(403);

    const ceoCookie = await login('marcelo@itscs.com.br');
    const created = await app.inject({ method: 'POST', url: '/api/v1/tasks', headers: { cookie: ceoCookie }, payload: { title: 'Tarefa de teste', proj: 'Portal ITS', who: 'elaine', due: '2026-08-20', pri: 'alta', cat: 'Entrega' } });
    expect(created.statusCode).toBe(201);
    const taskId = body(created).data.id;
    expect(body(created).data.who).toBe('elaine');

    const done = await app.inject({ method: 'POST', url: `/api/v1/tasks/${taskId}/complete`, headers: { cookie: devCookie } });
    expect(done.statusCode).toBe(200);
    expect(body(done).data.done).toBe(true);
  });
});
