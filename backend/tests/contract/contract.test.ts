import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';

const PASS = 'DiarioDev@2026';
let app: FastifyInstance;

const body = (res: { payload: string }): any => JSON.parse(res.payload);
const cookieOf = (res: { cookies: { name: string; value: string }[] }): string =>
  (res.cookies || []).map((c) => `${c.name}=${c.value}`).join('; ');
async function login(email: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: PASS } });
  return cookieOf(res as never);
}

beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe('contrato: envelopes', () => {
  it('sucesso traz { data, meta.requestId }', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: await login('marcelo@itscs.com.br') } });
    const b = body(res);
    expect(b).toHaveProperty('data');
    expect(b.meta).toHaveProperty('requestId');
    expect(typeof b.meta.requestId).toBe('string');
  });

  it('erro traz { error: { code, message, details, requestId } }', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/rota-inexistente' });
    expect(res.statusCode).toBe(404);
    const e = body(res).error;
    expect(e).toMatchObject({ code: expect.any(String), message: expect.any(String), requestId: expect.any(String) });
    expect(Array.isArray(e.details)).toBe(true);
  });

  it('códigos de erro estáveis: 401 e 422', async () => {
    const unauth = await app.inject({ method: 'GET', url: '/api/v1/auth/me' });
    expect(unauth.statusCode).toBe(401);
    expect(body(unauth).error.code).toBe('UNAUTHORIZED');

    const bad = await app.inject({ method: 'POST', url: '/api/v1/activities', headers: { cookie: await login('elaine@itscs.com.br') }, payload: { title: '' } });
    expect(bad.statusCode).toBe(422);
    expect(body(bad).error.code).toBe('VALIDATION_ERROR');
  });
});

describe('contrato: /bootstrap', () => {
  it('estrutura esperada pelo frontend', async () => {
    const b = body(await app.inject({ method: 'GET', url: '/api/v1/bootstrap', headers: { cookie: await login('marcelo@itscs.com.br') } })).data;
    for (const key of ['user', 'people', 'categories', 'projects', 'activities', 'tasks', 'groups', 'integrations', 'appearance', 'preferences', 'serverNow', 'timezone', 'cursor', 'canAdminister']) {
      expect(b, `bootstrap.${key}`).toHaveProperty(key);
    }
    expect(Array.isArray(b.people)).toBe(true);
    expect(new Date(b.serverNow).toString()).not.toBe('Invalid Date');
    expect(b.timezone).toBe('America/Sao_Paulo');
  });
});

describe('contrato: DTOs de atividade e tarefa', () => {
  it('atividade tem os campos do formato DV', async () => {
    const list = body(await app.inject({ method: 'GET', url: '/api/v1/activities?perPage=1', headers: { cookie: await login('marcelo@itscs.com.br') } })).data;
    expect(list.length).toBeGreaterThan(0);
    const a = list[0];
    for (const key of ['id', 'who', 'proj', 'cat', 'title', 'occurredAt', 'durationMinutes', 'priority', 'tags', 'files', 'version']) {
      expect(a, `activity.${key}`).toHaveProperty(key);
    }
    expect(['baixa', 'média', 'alta']).toContain(a.priority);
    expect(Array.isArray(a.tags)).toBe(true);
  });

  it('tarefa tem os campos do formato DV', async () => {
    const list = body(await app.inject({ method: 'GET', url: '/api/v1/tasks?perPage=1', headers: { cookie: await login('marcelo@itscs.com.br') } })).data;
    expect(list.length).toBeGreaterThan(0);
    const t = list[0];
    for (const key of ['id', 'title', 'proj', 'who', 'by', 'due', 'pri', 'cat', 'done', 'version']) {
      expect(t, `task.${key}`).toHaveProperty(key);
    }
  });
});
