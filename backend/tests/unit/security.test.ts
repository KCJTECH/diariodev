import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, isTrivialPassword } from '../../src/common/auth/password.js';
import { signJwt, verifyJwt } from '../../src/common/auth/jwt.js';
import { encryptSecret, decryptSecret, secretPreview } from '../../src/common/utils/crypto.js';
import { signPayload, assertSafeUrl, SsrfError } from '../../src/modules/integrations/webhook/security.js';

const SECRET = 'unit-test-secret-0123456789';

describe('password (Argon2id)', () => {
  it('gera hash argon2id e verifica correta/incorreta', async () => {
    const hash = await hashPassword('Senha@Forte1');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(hash, 'Senha@Forte1')).toBe(true);
    expect(await verifyPassword(hash, 'errada')).toBe(false);
  });
  it('bloqueia senhas triviais', () => {
    expect(isTrivialPassword('123456')).toBe(true);
    expect(isTrivialPassword('DiarioDev')).toBe(true); // case-insensitive
    expect(isTrivialPassword('Senha@Forte1')).toBe(false);
  });
});

describe('JWT HS256', () => {
  it('assina e verifica ida e volta', () => {
    const token = signJwt({ sub: 'u1', lvl: 'ceo' }, SECRET, 60);
    const claims = verifyJwt<{ sub: string; lvl: string }>(token, SECRET);
    expect(claims.sub).toBe('u1');
    expect(claims.lvl).toBe('ceo');
  });
  it('rejeita token expirado', () => {
    const token = signJwt({ sub: 'u1' }, SECRET, -10);
    expect(() => verifyJwt(token, SECRET)).toThrow();
  });
  it('rejeita assinatura adulterada', () => {
    const token = signJwt({ sub: 'u1' }, SECRET, 60);
    const parts = token.split('.');
    const tampered = `${parts[0]}.${parts[1]}.${parts[2]!.slice(0, -2)}xx`;
    expect(() => verifyJwt(tampered, SECRET)).toThrow();
  });
  it('rejeita segredo errado', () => {
    const token = signJwt({ sub: 'u1' }, SECRET, 60);
    expect(() => verifyJwt(token, 'outro-segredo')).toThrow();
  });
});

describe('crypto AES-GCM de segredos', () => {
  it('criptografa e descriptografa', () => {
    const enc = encryptSecret('X-DiarioDev-Secret');
    expect(enc.startsWith('v1.')).toBe(true);
    expect(enc).not.toContain('X-DiarioDev-Secret');
    expect(decryptSecret(enc)).toBe('X-DiarioDev-Secret');
  });
  it('prévia mascara o valor', () => {
    expect(secretPreview('abcdef7f2a')).toBe('****7f2a');
  });
  it('falha ao adulterar o ciphertext', () => {
    const enc = encryptSecret('segredo');
    const parts = enc.split('.');
    const tampered = `${parts[0]}.${parts[1]}.${parts[2]}.${Buffer.from('00').toString('base64')}`;
    expect(() => decryptSecret(tampered)).toThrow();
  });
});

describe('webhook: assinatura HMAC e SSRF', () => {
  it('assinatura é determinística sobre timestamp.corpo', () => {
    const a = signPayload(SECRET, '100', '{"x":1}');
    const b = signPayload(SECRET, '100', '{"x":1}');
    expect(a).toBe(b);
    expect(a).not.toBe(signPayload(SECRET, '101', '{"x":1}'));
  });
  it('bloqueia esquema não-HTTP', async () => {
    await expect(assertSafeUrl('ftp://exemplo.com')).rejects.toBeInstanceOf(SsrfError);
  });
  it('bloqueia IP privado e link-local', async () => {
    await expect(assertSafeUrl('http://10.0.0.1/x')).rejects.toBeInstanceOf(SsrfError);
    await expect(assertSafeUrl('http://169.254.169.254/latest')).rejects.toBeInstanceOf(SsrfError);
    await expect(assertSafeUrl('http://127.0.0.1/x')).rejects.toBeInstanceOf(SsrfError);
  });
  it('aceita IP público', async () => {
    const url = await assertSafeUrl('http://8.8.8.8/hook');
    expect(url.hostname).toBe('8.8.8.8');
  });
});
