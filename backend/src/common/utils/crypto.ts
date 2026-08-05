// Criptografia simétrica de segredos de integração (AES-256-GCM).
// A chave de 32 bytes é derivada de ENCRYPTION_KEY por SHA-256, aceitando
// qualquer valor não vazio, mas recomenda-se um valor aleatório forte (§21.4).
// Formato armazenado: "v1.<iv b64>.<ciphertext b64>.<tag b64>".
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../../config/env.js';

const KEY = createHash('sha256').update(env.ENCRYPTION_KEY).digest(); // 32 bytes
const ALGO = 'aes-256-gcm';
const PREFIX = 'v1';

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, KEY, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString('base64'), ct.toString('base64'), tag.toString('base64')].join('.');
}

export function decryptSecret(stored: string): string {
  const parts = stored.split('.');
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error('Formato de segredo inválido.');
  }
  const [, ivB64, ctB64, tagB64] = parts as [string, string, string, string];
  const decipher = createDecipheriv(ALGO, KEY, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
}

// Prévia mascarada para exibição (§21.4): nunca revela o segredo completo.
export function secretPreview(plaintext: string): string {
  const tail = plaintext.slice(-4);
  return `****${tail}`;
}
