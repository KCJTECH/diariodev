// Hash e verificação de senha com Argon2id (§15.1). Parâmetros conservadores,
// adequados a servidor interno. Ajuste memoryCost conforme a infraestrutura.
import { hash, verify } from '@node-rs/argon2';

// O algoritmo padrão de `hash` no @node-rs/argon2 é Argon2id (§15.1); mantemos o
// padrão para evitar importar o const enum `Algorithm` (incompatível com
// verbatimModuleSyntax). Parâmetros conservadores para servidor interno.
const OPTS = {
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTS);
}

export function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  return verify(storedHash, plain, OPTS);
}

// Senhas triviais bloqueadas no cadastro/troca (§15.1). Lista mínima; a
// validação de tamanho fica nos schemas de rota.
const TRIVIAL = new Set([
  '123456',
  '12345678',
  'password',
  'senha123',
  'qwerty',
  '000000',
  'diariodev',
]);

export function isTrivialPassword(plain: string): boolean {
  return TRIVIAL.has(plain.toLowerCase());
}
