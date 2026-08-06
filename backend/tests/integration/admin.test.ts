import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/common/database/prisma.js';

const PASS = 'DiarioDev@2026';
let app: FastifyInstance;
let ceo: string;

const body = (res: { payload: string }): any => JSON.parse(res.payload);
const cookieOf = (res: { cookies: { name: string; value: string }[] }): string =>
  (res.cookies || []).map((c) => `${c.name}=${c.value}`).join('; ');
async function login(email: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: PASS } });
  expect(res.statusCode).toBe(200);
  return cookieOf(res as never);
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  ceo = await login('marcelo@itscs.com.br');
});
afterAll(async () => { await app.close(); });

describe('usuários: salvaguardas', () => {
  it('não é possível rebaixar o último CEO ativo', async () => {
    const res = await app.inject({ method: 'PATCH', url: '/api/v1/users/marcelo', headers: { cookie: ceo }, payload: { level: 'dev' } });
    expect(res.statusCode).toBe(409);
    expect(body(res).error.code).toBe('LAST_CEO');
  });

  it('não é possível excluir a própria conta', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/users/marcelo', headers: { cookie: ceo } });
    expect(res.statusCode).toBe(403);
  });

  it('cria usuário com senha temporária e desativa', async () => {
    const email = `novo${Date.now()}@itscs.com.br`;
    const created = await app.inject({ method: 'POST', url: '/api/v1/users', headers: { cookie: ceo }, payload: { name: 'Novo Teste', role: 'Estagiário', email, level: 'dev' } });
    expect(created.statusCode).toBe(201);
    const d = body(created).data;
    expect(d.tempPassword).toBeTruthy(); // devolvida fora de produção
    expect(d.user.level).toBe('dev');
    const del = await app.inject({ method: 'DELETE', url: `/api/v1/users/${d.user.id}`, headers: { cookie: ceo } });
    expect(del.statusCode).toBe(200);
  });
});

// Campos "Nova senha"/"Confirmar senha" da tela de administração.
describe('usuários: gestor define a senha do colaborador', () => {
  async function criarAlvo(): Promise<{ publicKey: string; email: string }> {
    const email = `senha${Date.now()}@itscs.com.br`;
    const res = await app.inject({
      method: 'POST', url: '/api/v1/users', headers: { cookie: ceo },
      payload: { name: 'Alvo Senha', role: 'Analista', email, level: 'dev' },
    });
    expect(res.statusCode).toBe(201);
    return { publicKey: body(res).data.user.id, email };
  }

  it('define a senha e o colaborador entra com ela', async () => {
    const alvo = await criarAlvo();
    const nova = 'DefinidaPeloGestor@2026';
    const res = await app.inject({
      method: 'POST', url: `/api/v1/users/${alvo.publicKey}/password`, headers: { cookie: ceo },
      payload: { newPassword: nova },
    });
    expect(res.statusCode).toBe(200);

    const entra = await app.inject({
      method: 'POST', url: '/api/v1/auth/login', payload: { email: alvo.email, password: nova },
    });
    expect(entra.statusCode).toBe(200);
  });

  // Cobertura que antes vinha pela rota de reset, mantida aqui porque a regra de
  // credencial é a mesma: nível gestor no gate e alvo estritamente menor na policy.
  it('dev não define a senha de outro colaborador', async () => {
    const alvo = await criarAlvo();
    const dev = await login('elaine@itscs.com.br');
    const res = await app.inject({
      method: 'POST', url: `/api/v1/users/${alvo.publicKey}/password`, headers: { cookie: dev },
      payload: { newPassword: 'TentandoComoDev@2026' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('colaborador inexistente → 404', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/users/nao-existe-mesmo/password', headers: { cookie: ceo },
      payload: { newPassword: 'QualquerCoisa@2026' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('não define a senha da própria conta por esta rota', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/users/marcelo/password', headers: { cookie: ceo },
      payload: { newPassword: 'TentandoEmMim@2026' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('gestor não define a senha do CEO', async () => {
    const gestor = await login('laerty@itscs.com.br');
    const res = await app.inject({
      method: 'POST', url: '/api/v1/users/marcelo/password', headers: { cookie: gestor },
      payload: { newPassword: 'EscalandoPrivilegio@2026' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('gestor não define a senha de outro gestor', async () => {
    const gestor = await login('laerty@itscs.com.br');
    const outro = await app.inject({
      method: 'POST', url: '/api/v1/users', headers: { cookie: ceo },
      payload: { name: 'Outro Gestor', role: 'Coordenador', email: `og${Date.now()}@itscs.com.br`, level: 'gestor' },
    });
    expect(outro.statusCode).toBe(201);
    const res = await app.inject({
      method: 'POST', url: `/api/v1/users/${body(outro).data.user.id}/password`, headers: { cookie: gestor },
      payload: { newPassword: 'EntreIguais@2026' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('dev não define senha de ninguém', async () => {
    const alvo = await criarAlvo();
    const dev = await login('elaine@itscs.com.br');
    const res = await app.inject({
      method: 'POST', url: `/api/v1/users/${alvo.publicKey}/password`, headers: { cookie: dev },
      payload: { newPassword: 'NaoDeveria@2026' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('senha curta → 422 e senha trivial → 422', async () => {
    const alvo = await criarAlvo();
    const curta = await app.inject({
      method: 'POST', url: `/api/v1/users/${alvo.publicKey}/password`, headers: { cookie: ceo },
      payload: { newPassword: 'abc' },
    });
    expect(curta.statusCode).toBe(422);
    const trivial = await app.inject({
      method: 'POST', url: `/api/v1/users/${alvo.publicKey}/password`, headers: { cookie: ceo },
      payload: { newPassword: '12345678' },
    });
    expect(trivial.statusCode).toBe(422);
  });
});

describe('categorias: arquivar preserva histórico', () => {
  it('atividade mantém o nome via snapshot e o nome pode ser recriado', async () => {
    const name = `CTArch${Date.now()}`;
    const cat = await app.inject({ method: 'POST', url: '/api/v1/categories', headers: { cookie: ceo }, payload: { name } });
    expect(cat.statusCode).toBe(201);
    const catId = body(cat).data.id;

    const dev = await login('elaine@itscs.com.br');
    const act = await app.inject({ method: 'POST', url: '/api/v1/activities', headers: { cookie: dev }, payload: { proj: 'Portal ITS', cat: name, title: 'usa categoria arquivável', occurredAt: '2026-08-03T10:00:00-03:00', priority: 'média' } });
    expect(act.statusCode).toBe(201);
    const actId = body(act).data.id;

    const arch = await app.inject({ method: 'DELETE', url: `/api/v1/categories/${catId}`, headers: { cookie: ceo } });
    expect(arch.statusCode).toBe(200);

    // histórico preservado
    const got = await app.inject({ method: 'GET', url: `/api/v1/activities/${actId}`, headers: { cookie: dev } });
    expect(body(got).data.cat).toBe(name);
    // não aparece mais na lista ativa
    const cats = body(await app.inject({ method: 'GET', url: '/api/v1/categories', headers: { cookie: ceo } })).data;
    expect(cats.map((c: any) => c.name)).not.toContain(name);
    // nome liberado para recriar
    const again = await app.inject({ method: 'POST', url: '/api/v1/categories', headers: { cookie: ceo }, payload: { name } });
    expect(again.statusCode).toBe(201);
  });
});

describe('grupos: recálculo de nível efetivo', () => {
  it('entrar em grupo de nível maior eleva o nível; sair reverte', async () => {
    const g = await app.inject({ method: 'POST', url: '/api/v1/groups', headers: { cookie: ceo }, payload: { name: `GX${Date.now()}`, level: 'ceo', perms: [] } });
    expect(g.statusCode).toBe(201);
    const gid = body(g).data.id;

    await app.inject({ method: 'PUT', url: `/api/v1/groups/${gid}/members`, headers: { cookie: ceo }, payload: { members: ['camila'] } });
    let camila = body(await app.inject({ method: 'GET', url: '/api/v1/users/camila', headers: { cookie: ceo } })).data;
    expect(camila.level).toBe('ceo');

    await app.inject({ method: 'PUT', url: `/api/v1/groups/${gid}/members`, headers: { cookie: ceo }, payload: { members: [] } });
    camila = body(await app.inject({ method: 'GET', url: '/api/v1/users/camila', headers: { cookie: ceo } })).data;
    expect(camila.level).toBe('dev');
  });
});

describe('integrações: segredo mascarado', () => {
  it('lista e cria sem vazar o segredo', async () => {
    const list = body(await app.inject({ method: 'GET', url: '/api/v1/integrations', headers: { cookie: ceo } })).data;
    const n8n = list.find((i: any) => i.abbr === 'n8n');
    expect(n8n.secretConfigured).toBe(true);
    expect(n8n.secretPreview).toBeTruthy();
    expect(JSON.stringify(list)).not.toContain('X-DiarioDev-Secret');

    const created = await app.inject({ method: 'POST', url: '/api/v1/integrations', headers: { cookie: ceo }, payload: { name: 'Nova', type: 'webhook', endpoint: 'https://exemplo.com/hook', events: ['atividade.criada'], secret: 'segredo-cru-123' } });
    expect(created.statusCode).toBe(201);
    const d = body(created).data;
    expect(d.secretConfigured).toBe(true);
    expect(JSON.stringify(d)).not.toContain('segredo-cru-123');
  });
});

describe('outbox e auditoria', () => {
  it('mutação grava evento na outbox e registro de auditoria', async () => {
    const dev = await login('elaine@itscs.com.br');
    const before = await prisma.auditLog.count();
    await app.inject({ method: 'POST', url: '/api/v1/activities', headers: { cookie: dev }, payload: { proj: 'Portal ITS', cat: 'Entrega', title: 'audita e outbox', occurredAt: '2026-08-03T11:00:00-03:00', priority: 'alta' } });
    expect(await prisma.outboxEvent.count({ where: { eventName: 'activity.created' } })).toBeGreaterThan(0);
    expect(await prisma.auditLog.count()).toBeGreaterThan(before);
  });
});
