// Prova de que os caminhos de escalonamento de privilégio estão fechados.
// Cada caso confere o status E o não-efeito: um 403 que ainda alterou o banco
// não é correção. Todo recurso criado aqui é removido no próprio teste, para a
// suíte poder rodar duas vezes seguidas sem reset do banco.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';

let app: FastifyInstance;
let ceo: string;
let gestor: string;
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
const nivelDe = async (chave: string): Promise<string> =>
  body(await app.inject({ method: 'GET', url: `/api/v1/users/${chave}`, headers: { cookie: ceo } })).data.level;

async function criarUsuario(level: string, prefixo: string): Promise<string> {
  const res = await app.inject({
    method: 'POST', url: '/api/v1/users', headers: { cookie: ceo },
    payload: { name: `${prefixo} Temporario`, role: 'Conta de teste', email: `${prefixo}${Date.now()}@itscs.com.br`, level },
  });
  expect(res.statusCode, `criar ${level}`).toBe(201);
  return body(res).data.user.id;
}
const removerUsuario = (chave: string) =>
  app.inject({ method: 'DELETE', url: `/api/v1/users/${chave}`, headers: { cookie: ceo } });

async function criarGrupo(cookie: string, level: string, nome: string) {
  return app.inject({
    method: 'POST', url: '/api/v1/groups', headers: { cookie },
    payload: { name: nome, desc: 'grupo de teste', level, perms: [] },
  });
}
async function grupoPorNome(nome: string): Promise<any> {
  const lista = body(await app.inject({ method: 'GET', url: '/api/v1/groups', headers: { cookie: ceo } })).data;
  return lista.find((g: any) => g.name === nome);
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  ceo = await login('marcelo@itscs.com.br');
  gestor = await login('laerty@itscs.com.br');
  dev = await login('elaine@itscs.com.br');
});
afterAll(async () => { await app.close(); });

describe('escalonamento vertical por usuário', () => {
  it('gestor não se promove a ceo', async () => {
    const res = await app.inject({
      method: 'PATCH', url: '/api/v1/users/laerty', headers: { cookie: gestor }, payload: { level: 'ceo' },
    });
    expect(res.statusCode).toBe(403);
    expect(await nivelDe('laerty')).toBe('gestor');
  });

  it('gestor não promove terceiro acima do próprio nível', async () => {
    const res = await app.inject({
      method: 'PATCH', url: '/api/v1/users/elaine', headers: { cookie: gestor }, payload: { level: 'ceo' },
    });
    expect(res.statusCode).toBe(403);
    expect(await nivelDe('elaine')).toBe('dev');
  });

  it('gestor não rebaixa o CEO mesmo havendo outro CEO ativo', async () => {
    const extra = await criarUsuario('ceo', 'ceoextra');
    const res = await app.inject({
      method: 'PATCH', url: '/api/v1/users/marcelo', headers: { cookie: gestor }, payload: { level: 'dev' },
    });
    // 403 e não 409: prova que a autorização vem antes da salvaguarda do último CEO.
    expect(res.statusCode).toBe(403);
    expect(await nivelDe('marcelo')).toBe('ceo');
    expect((await removerUsuario(extra)).statusCode).toBe(200);
  });

  it('gestor administra par gestor, mas não assume a identidade dele', async () => {
    const par = await criarUsuario('gestor', 'pargestor');

    // Administrar par é movimento lateral e é permitido: sem isso, conta de par
    // nunca poderia ser corrigida nem desativada por ninguém do mesmo nível.
    const edita = await app.inject({
      method: 'PATCH', url: `/api/v1/users/${par}`, headers: { cookie: gestor }, payload: { name: 'Renomeado' },
    });
    expect(edita.statusCode).toBe(200);

    // Definir a senha do par, não: isso é personificação, e a regra de credencial
    // é estritamente menor.
    const senha = await app.inject({
      method: 'POST', url: `/api/v1/users/${par}/password`, headers: { cookie: gestor },
      payload: { newPassword: 'PersonificandoPar@2026' },
    });
    expect(senha.statusCode).toBe(403);

    // Nem gerar link de redefinição do par.
    const link = await app.inject({
      method: 'POST', url: `/api/v1/users/${par}/password-reset`, headers: { cookie: gestor },
    });
    expect(link.statusCode).toBe(403);

    // E não consegue elevar o par acima do próprio nível.
    const eleva = await app.inject({
      method: 'PATCH', url: `/api/v1/users/${par}`, headers: { cookie: gestor }, payload: { level: 'ceo' },
    });
    expect(eleva.statusCode).toBe(403);
    expect(await nivelDe(par)).toBe('gestor');

    expect((await removerUsuario(par)).statusCode).toBe(200);
  });

  it('gestor não exclui o CEO', async () => {
    const extra = await criarUsuario('ceo', 'ceoexcl');
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/users/marcelo', headers: { cookie: gestor } });
    expect(res.statusCode).toBe(403);
    expect(await nivelDe('marcelo')).toBe('ceo');
    expect((await removerUsuario(extra)).statusCode).toBe(200);
  });

  it('gestor edita os próprios dados enviando o corpo completo da tela', async () => {
    // Formato exato que assets/data.js envia: inclui o nível atual em toda gravação.
    const res = await app.inject({
      method: 'PATCH', url: '/api/v1/users/laerty', headers: { cookie: gestor },
      payload: { name: 'Laerty Souza', role: 'Tech Lead', email: 'laerty@itscs.com.br', initials: 'LS', color: 'var(--brand)', level: 'gestor', active: true },
    });
    expect(res.statusCode).toBe(200);
    expect(await nivelDe('laerty')).toBe('gestor');
  });

  it('gestor continua administrando dev', async () => {
    const res = await app.inject({
      method: 'PATCH', url: '/api/v1/users/elaine', headers: { cookie: gestor }, payload: { role: 'Desenvolvedora' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('dev não altera nível de ninguém', async () => {
    const res = await app.inject({
      method: 'PATCH', url: '/api/v1/users/camila', headers: { cookie: dev }, payload: { level: 'gestor' },
    });
    expect(res.statusCode).toBe(403);
    expect(await nivelDe('camila')).toBe('dev');
  });
});

describe('teto de concessão na criação de conta', () => {
  it('gestor cria dev', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/users', headers: { cookie: gestor },
      payload: { name: 'Novo Dev', role: 'Analista', email: `ndev${Date.now()}@itscs.com.br`, level: 'dev' },
    });
    expect(res.statusCode).toBe(201);
    expect(body(res).data.user.level).toBe('dev');
    await removerUsuario(body(res).data.user.id);
  });

  it('gestor não cria conta ceo, e nada é criado antes do 403', async () => {
    const email = `tentaceo${Date.now()}@itscs.com.br`;
    const res = await app.inject({
      method: 'POST', url: '/api/v1/users', headers: { cookie: gestor },
      payload: { name: 'Tentativa CEO', role: 'Analista', email, level: 'ceo' },
    });
    expect(res.statusCode).toBe(403);
    const lista = body(await app.inject({ method: 'GET', url: '/api/v1/users', headers: { cookie: ceo } })).data;
    expect(lista.map((p: any) => p.email)).not.toContain(email);
  });

  it('gestor cria par gestor: movimento lateral é permitido', async () => {
    const par = await app.inject({
      method: 'POST', url: '/api/v1/users', headers: { cookie: gestor },
      payload: { name: 'Par Gestor', role: 'Coordenador', email: `par${Date.now()}@itscs.com.br`, level: 'gestor' },
    });
    expect(par.statusCode).toBe(201);
    expect(body(par).data.user.level).toBe('gestor');
    await removerUsuario(body(par).data.user.id);
  });

  it('ceo cria ceo', async () => {
    const extra = await criarUsuario('ceo', 'ceopar');
    expect(await nivelDe(extra)).toBe('ceo');
    expect((await removerUsuario(extra)).statusCode).toBe(200);
  });
});

describe('escalonamento vertical por grupo', () => {
  it('gestor não cria grupo de nível ceo', async () => {
    const nome = `GTentaCeo${Date.now()}`;
    const res = await criarGrupo(gestor, 'ceo', nome);
    expect(res.statusCode).toBe(403);
    expect(await grupoPorNome(nome)).toBeUndefined();
  });

  it('gestor não eleva a ceo um grupo que ele criou', async () => {
    const nome = `GEleva${Date.now()}`;
    const criado = await criarGrupo(gestor, 'gestor', nome);
    expect(criado.statusCode).toBe(201);
    const id = body(criado).data.id;

    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/groups/${id}`, headers: { cookie: gestor }, payload: { level: 'ceo' },
    });
    expect(res.statusCode).toBe(403);
    expect((await grupoPorNome(nome)).level).toBe('gestor');

    expect((await app.inject({ method: 'DELETE', url: `/api/v1/groups/${id}`, headers: { cookie: gestor } })).statusCode).toBe(200);
  });

  it('gestor não edita nem apaga grupo de nível ceo', async () => {
    const diretoria = await grupoPorNome('Diretoria');
    expect(diretoria, 'grupo Diretoria do seed').toBeTruthy();

    const patch = await app.inject({
      method: 'PATCH', url: `/api/v1/groups/${diretoria.id}`, headers: { cookie: gestor }, payload: { name: 'Diretoria X' },
    });
    expect(patch.statusCode).toBe(403);

    const del = await app.inject({ method: 'DELETE', url: `/api/v1/groups/${diretoria.id}`, headers: { cookie: gestor } });
    expect(del.statusCode).toBe(403);

    expect(await grupoPorNome('Diretoria')).toBeTruthy();
    expect(await nivelDe('marcelo')).toBe('ceo');
  });

  it('gestor não se inclui no grupo de nível ceo', async () => {
    const diretoria = await grupoPorNome('Diretoria');
    const res = await app.inject({
      method: 'PUT', url: `/api/v1/groups/${diretoria.id}/members`, headers: { cookie: gestor },
      payload: { members: ['marcelo', 'laerty'] },
    });
    expect(res.statusCode).toBe(403);
    // O não-efeito é a prova: o nível dele não mudou.
    expect(await nivelDe('laerty')).toBe('gestor');
    expect((await grupoPorNome('Diretoria')).members).toEqual(['marcelo']);
  });

  it('gestor salva grupo mantendo membro superior inalterado e adicionando dev', async () => {
    // Anti-regressão do delta: o PUT da tela é substituição total e reenvia todos
    // os membros. Validar a lista inteira travaria o gestor em qualquer grupo que
    // já contenha alguém de nível superior.
    const nome = `GDelta${Date.now()}`;
    const criado = await criarGrupo(ceo, 'gestor', nome);
    expect(criado.statusCode).toBe(201);
    const id = body(criado).data.id;

    const inicial = await app.inject({
      method: 'PUT', url: `/api/v1/groups/${id}/members`, headers: { cookie: ceo },
      payload: { members: ['marcelo', 'laerty'] },
    });
    expect(inicial.statusCode).toBe(200);

    const res = await app.inject({
      method: 'PUT', url: `/api/v1/groups/${id}/members`, headers: { cookie: gestor },
      payload: { members: ['marcelo', 'laerty', 'camila'] },
    });
    expect(res.statusCode).toBe(200);
    expect(await nivelDe('camila')).toBe('gestor');

    // Limpeza: esvazia pelo CEO e remove o grupo, devolvendo camila a dev.
    expect((await app.inject({ method: 'PUT', url: `/api/v1/groups/${id}/members`, headers: { cookie: ceo }, payload: { members: [] } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/groups/${id}`, headers: { cookie: ceo } })).statusCode).toBe(200);
    expect(await nivelDe('camila')).toBe('dev');
  });

  it('recálculo legítimo continua funcionando de ponta a ponta', async () => {
    const nome = `GRecalc${Date.now()}`;
    const criado = await criarGrupo(gestor, 'gestor', nome);
    expect(criado.statusCode).toBe(201);
    const id = body(criado).data.id;

    expect((await app.inject({ method: 'PUT', url: `/api/v1/groups/${id}/members`, headers: { cookie: gestor }, payload: { members: ['camila'] } })).statusCode).toBe(200);
    expect(await nivelDe('camila')).toBe('gestor');

    expect((await app.inject({ method: 'PUT', url: `/api/v1/groups/${id}/members`, headers: { cookie: gestor }, payload: { members: [] } })).statusCode).toBe(200);
    expect(await nivelDe('camila')).toBe('dev');

    expect((await app.inject({ method: 'DELETE', url: `/api/v1/groups/${id}`, headers: { cookie: gestor } })).statusCode).toBe(200);
  });
});

describe('acesso horizontal por atividade', () => {
  it('dev não conclui tarefa de terceiro passando sourceTaskId', async () => {
    const tarefa = await app.inject({
      method: 'POST', url: '/api/v1/tasks', headers: { cookie: ceo },
      payload: { title: `Tarefa da camila ${Date.now()}`, proj: 'Portal ITS', who: 'camila', pri: 'média' },
    });
    expect(tarefa.statusCode).toBe(201);
    const taskId = body(tarefa).data.id;

    const res = await app.inject({
      method: 'POST', url: '/api/v1/activities', headers: { cookie: dev },
      payload: {
        proj: 'Portal ITS', cat: 'Entrega', title: 'Tentando fechar tarefa alheia',
        occurredAt: '2026-08-06T10:00:00-03:00', priority: 'média', sourceTaskId: taskId,
      },
    });
    expect(res.statusCode).toBe(403);

    // Não-efeito: a tarefa continua aberta e sem ninguém como concluinte.
    const depois = body(await app.inject({ method: 'GET', url: `/api/v1/tasks/${taskId}`, headers: { cookie: ceo } })).data;
    expect(depois.done).toBe(false);

    await app.inject({ method: 'DELETE', url: `/api/v1/tasks/${taskId}`, headers: { cookie: ceo } });
  });

  it('dev não passa a participar de projeto alheio escrevendo nele', async () => {
    const nome = `Projeto Fechado ${Date.now()}`;
    const proj = await app.inject({
      method: 'POST', url: '/api/v1/projects', headers: { cookie: ceo }, payload: { name: nome },
    });
    expect(proj.statusCode).toBe(201);

    const res = await app.inject({
      method: 'POST', url: '/api/v1/activities', headers: { cookie: dev },
      payload: { proj: nome, cat: 'Entrega', title: 'Entrando sem convite', occurredAt: '2026-08-06T11:00:00-03:00', priority: 'média' },
    });
    expect(res.statusCode).toBe(403);

    // Não-efeito: o projeto continua fora da lista visível do dev.
    const visiveis = body(await app.inject({ method: 'GET', url: '/api/v1/projects', headers: { cookie: dev } })).data;
    expect(visiveis.map((p: any) => p.name)).not.toContain(nome);

    await app.inject({ method: 'DELETE', url: `/api/v1/projects/${body(proj).data.id}`, headers: { cookie: ceo } });
  });

  it('dev continua criando atividade em projeto novo e em projeto que participa', async () => {
    const novo = `Projeto Do Dev ${Date.now()}`;
    const criado = await app.inject({
      method: 'POST', url: '/api/v1/activities', headers: { cookie: dev },
      payload: { proj: novo, cat: 'Entrega', title: 'Primeiro registro', occurredAt: '2026-08-06T12:00:00-03:00', priority: 'média' },
    });
    expect(criado.statusCode).toBe(201);

    // Agora participa: o segundo registro no mesmo projeto passa.
    const segundo = await app.inject({
      method: 'POST', url: '/api/v1/activities', headers: { cookie: dev },
      payload: { proj: novo, cat: 'Entrega', title: 'Segundo registro', occurredAt: '2026-08-06T13:00:00-03:00', priority: 'média' },
    });
    expect(segundo.statusCode).toBe(201);

    await app.inject({ method: 'DELETE', url: `/api/v1/activities/${body(criado).data.id}`, headers: { cookie: dev } });
    await app.inject({ method: 'DELETE', url: `/api/v1/activities/${body(segundo).data.id}`, headers: { cookie: dev } });
  });
});
