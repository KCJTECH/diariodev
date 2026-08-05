import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';

const PASS = 'DiarioDev@2026';
// PNG 1x1 válido (magic bytes reais → file-type detecta image/png)
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

let app: FastifyInstance;
let elaine: string;

const body = (res: { payload: string }): any => JSON.parse(res.payload);
const cookieOf = (res: { cookies: { name: string; value: string }[] }): string =>
  (res.cookies || []).map((c) => `${c.name}=${c.value}`).join('; ');
async function login(email: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: PASS } });
  return cookieOf(res as never);
}
function multipart(filename: string, contentType: string, content: Buffer): { body: Buffer; ct: string } {
  const boundary = '----dvtest' + Math.random().toString(16).slice(2);
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { body: Buffer.concat([head, content, tail]), ct: `multipart/form-data; boundary=${boundary}` };
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  elaine = await login('elaine@itscs.com.br');
});
afterAll(async () => { await app.close(); });

async function newActivity(): Promise<string> {
  const res = await app.inject({
    method: 'POST', url: '/api/v1/activities', headers: { cookie: elaine },
    payload: { proj: 'Portal ITS', cat: 'Entrega', title: 'com anexo', occurredAt: '2026-08-03T10:00:00-03:00', priority: 'média' },
  });
  return body(res).data.id;
}
function upload(actId: string, cookie: string, filename: string, ct: string, content: Buffer) {
  const mp = multipart(filename, ct, content);
  return app.inject({ method: 'POST', url: `/api/v1/activities/${actId}/attachments`, headers: { cookie, 'content-type': mp.ct }, payload: mp.body });
}

describe('anexos: upload, download e segurança', () => {
  it('sobe um PNG válido, lista no anexo da atividade e baixa autenticado', async () => {
    const actId = await newActivity();
    const up = await upload(actId, elaine, 'foto.png', 'image/png', PNG);
    expect(up.statusCode).toBe(201);
    const att = body(up).data;
    expect(att.name).toBe('foto.png');

    // a atividade passa a listar o arquivo
    const got = body(await app.inject({ method: 'GET', url: `/api/v1/activities/${actId}`, headers: { cookie: elaine } })).data;
    expect(got.files.map((f: any) => f.name)).toContain('foto.png');

    // download autenticado devolve o conteúdo com Content-Disposition attachment
    const dl = await app.inject({ method: 'GET', url: `/api/v1/attachments/${att.id}`, headers: { cookie: elaine } });
    expect(dl.statusCode).toBe(200);
    expect(dl.headers['content-disposition']).toContain('attachment');
    expect(Buffer.compare(dl.rawPayload, PNG)).toBe(0);

    // sem sessão → 401
    const noauth = await app.inject({ method: 'GET', url: `/api/v1/attachments/${att.id}` });
    expect(noauth.statusCode).toBe(401);

    // remoção → depois 404
    const del = await app.inject({ method: 'DELETE', url: `/api/v1/attachments/${att.id}`, headers: { cookie: elaine } });
    expect(del.statusCode).toBe(200);
    const gone = await app.inject({ method: 'GET', url: `/api/v1/attachments/${att.id}`, headers: { cookie: elaine } });
    expect(gone.statusCode).toBe(404);
  });

  it('rejeita extensão de executável', async () => {
    const actId = await newActivity();
    const up = await upload(actId, elaine, 'malware.exe', 'application/octet-stream', Buffer.from('MZ\x90\x00conteudo'));
    expect(up.statusCode).toBe(422);
  });

  it('rejeita conteúdo que não corresponde à extensão (.txt com binário)', async () => {
    const actId = await newActivity();
    const up = await upload(actId, elaine, 'nota.txt', 'text/plain', PNG);
    expect(up.statusCode).toBe(422);
  });

  it('não permite anexar em atividade de outra pessoa', async () => {
    const actId = await newActivity(); // da elaine
    const julio = await login('julio@itscs.com.br');
    const up = await upload(actId, julio, 'foto.png', 'image/png', PNG);
    expect(up.statusCode).toBe(403);
  });
});
