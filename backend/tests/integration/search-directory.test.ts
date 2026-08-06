// Busca sem acento (§14, §17.13) e escopo do diretório de pessoas (§17.2).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';

let app: FastifyInstance;
let ceo: string;
let dev: string;

const PASS = 'DiarioDev@2026';
const body = (res: { payload: string }): any => JSON.parse(res.payload);
const cookieOf = (res: { cookies: { name: string; value: string }[] }): string =>
  (res.cookies || []).map((c) => `${c.name}=${c.value}`).join('; ');
async function login(email: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: PASS } });
  expect(res.statusCode, `login ${email}`).toBe(200);
  return cookieOf(res as never);
}
const buscar = async (termo: string, cookie: string): Promise<any> =>
  body(await app.inject({ method: 'GET', url: `/api/v1/search?q=${encodeURIComponent(termo)}`, headers: { cookie } })).data;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  ceo = await login('marcelo@itscs.com.br');
  dev = await login('elaine@itscs.com.br');
});
afterAll(async () => { await app.close(); });

describe('busca ignorando acento', () => {
  it('encontra categoria acentuada digitando sem acento', async () => {
    // O seed tem "Correção" e "Documentação".
    const semAcento = await buscar('correcao', ceo);
    expect(semAcento.categories.map((c: any) => c.name)).toContain('Correção');

    const comAcento = await buscar('correção', ceo);
    expect(comAcento.categories.map((c: any) => c.name)).toContain('Correção');
  });

  it('encontra digitando com acento o que está sem, e ignora caixa', async () => {
    const maiuscula = await buscar('DOCUMENTACAO', ceo);
    expect(maiuscula.categories.map((c: any) => c.name)).toContain('Documentação');
  });

  it('atividade é encontrada por trecho do título sem acento', async () => {
    const titulo = `Correção de integração ${Date.now()}`;
    const criada = await app.inject({
      method: 'POST', url: '/api/v1/activities', headers: { cookie: ceo },
      payload: { proj: 'Portal ITS', cat: 'Correção', title: titulo, occurredAt: '2026-08-06T10:00:00-03:00', priority: 'média' },
    });
    expect(criada.statusCode).toBe(201);

    const achou = await buscar('integracao', ceo);
    expect(achou.activities.map((a: any) => a.title)).toContain(titulo);

    await app.inject({ method: 'DELETE', url: `/api/v1/activities/${body(criada).data.id}`, headers: { cookie: ceo } });
  });

  it('termo com menos de 2 caracteres não consulta nada', async () => {
    const curto = await buscar('a', ceo);
    expect(curto.activities).toEqual([]);
    expect(curto.people).toEqual([]);
  });

  it('a busca continua respeitando escopo: dev não encontra atividade de terceiro', async () => {
    const titulo = `Registro exclusivo do ceo ${Date.now()}`;
    const criada = await app.inject({
      method: 'POST', url: '/api/v1/activities', headers: { cookie: ceo },
      payload: { proj: 'Portal ITS', cat: 'Entrega', title: titulo, occurredAt: '2026-08-06T11:00:00-03:00', priority: 'média' },
    });
    expect(criada.statusCode).toBe(201);

    const comoCeo = await buscar('exclusivo do ceo', ceo);
    expect(comoCeo.activities.map((a: any) => a.title)).toContain(titulo);

    const comoDev = await buscar('exclusivo do ceo', dev);
    expect(comoDev.activities.map((a: any) => a.title)).not.toContain(titulo);

    await app.inject({ method: 'DELETE', url: `/api/v1/activities/${body(criada).data.id}`, headers: { cookie: ceo } });
  });
});

describe('diretório de pessoas por escopo', () => {
  it('dev não recebe e-mail de terceiro, mas recebe o próprio', async () => {
    const lista = body(await app.inject({ method: 'GET', url: '/api/v1/users', headers: { cookie: dev } })).data;
    const outro = lista.find((p: any) => p.id !== 'elaine');
    const proprio = lista.find((p: any) => p.id === 'elaine');

    expect(outro.email).toBe('');
    expect(proprio.email).toBe('elaine@itscs.com.br');
  });

  it('dev continua vendo nome, cargo, iniciais, cor e nível de acesso', async () => {
    const lista = body(await app.inject({ method: 'GET', url: '/api/v1/users', headers: { cookie: dev } })).data;
    const gestor = lista.find((p: any) => p.id === 'laerty');
    // O nível permanece porque omiti-lo não esconderia: o levelOf do frontend
    // tem fallback e passaria a mostrar todo mundo como Desenvolvedor.
    expect(gestor.level).toBe('gestor');
    expect(gestor.name).toBeTruthy();
    expect(gestor.role).toBeTruthy();
    expect(gestor.ini).toBeTruthy();
    expect(gestor.color).toBeTruthy();
  });

  it('gestor e ceo continuam vendo o e-mail de todos', async () => {
    const lista = body(await app.inject({ method: 'GET', url: '/api/v1/users', headers: { cookie: ceo } })).data;
    expect(lista.every((p: any) => p.email.includes('@'))).toBe(true);
  });

  it('nenhum consumidor recebe o id interno', async () => {
    const comoDev = body(await app.inject({ method: 'GET', url: '/api/v1/users', headers: { cookie: dev } })).data;
    const comoCeo = body(await app.inject({ method: 'GET', url: '/api/v1/users', headers: { cookie: ceo } })).data;
    expect(comoDev.every((p: any) => p.uuid === undefined)).toBe(true);
    expect(comoCeo.every((p: any) => p.uuid === undefined)).toBe(true);
  });

  it('o bootstrap segue a mesma regra e entrega permissões efetivas', async () => {
    const boot = body(await app.inject({ method: 'GET', url: '/api/v1/bootstrap', headers: { cookie: dev } })).data;
    const outro = boot.people.find((p: any) => p.id !== 'elaine');
    expect(outro.email).toBe('');
    expect(Array.isArray(boot.permissions)).toBe(true);

    const bootCeo = body(await app.inject({ method: 'GET', url: '/api/v1/bootstrap', headers: { cookie: ceo } })).data;
    // marcelo está no grupo Diretoria do seed, que tem permissões.
    expect(bootCeo.permissions.length).toBeGreaterThan(0);
  });

  it('a busca por pessoas também respeita o escopo do e-mail', async () => {
    const comoDev = await buscar('Laerty', dev);
    const encontrado = comoDev.people.find((p: any) => p.id === 'laerty');
    expect(encontrado).toBeTruthy();
    expect(encontrado.email).toBe('');
  });
});
