// Mapeia usuário para o formato "pessoa" do frontend (§9.2). Sem hash de senha.
import { Prisma } from '@prisma/client';
import { LEVEL_TO_API, seesAll, type AuthUser } from '../../common/auth/types.js';

export const userSelect = {
  id: true,
  publicKey: true,
  name: true,
  roleTitle: true,
  email: true,
  initials: true,
  color: true,
  active: true,
  effectiveLevel: true,
  timezone: true,
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

// Formato §9.2. O campo `uuid` foi removido em 2026-08-06: expunha o id interno
// de todo colaborador para qualquer usuário autenticado, estava fora do formato
// especificado e não era usado por nenhuma tela. O resto da API identifica
// pessoa por `publicKey`, justamente para não circular o id interno.
export type PersonDto = {
  id: string;
  name: string;
  role: string;
  email: string;
  ini: string;
  color: string;
  active: boolean;
  level: string;
};

export function userToPerson(u: UserRow): PersonDto {
  return {
    id: u.publicKey, // o frontend usa a chave pública como id
    name: u.name,
    role: u.roleTitle,
    email: u.email,
    ini: u.initials,
    color: u.color,
    active: u.active,
    level: LEVEL_TO_API[u.effectiveLevel],
  };
}

// Mesma pessoa, com o que o solicitante pode ver (§17.2, pessoas visíveis
// conforme escopo). Para nível dev, o e-mail de terceiros sai: é dado de contato
// e o diretório da equipe não precisa dele para avatar, filtro e atribuição. O
// próprio registro vem completo, porque a tela de conta usa o próprio e-mail.
//
// O nível de acesso continua visível de propósito. Omiti-lo não esconderia: o
// `levelOf` do frontend tem fallback e passaria a mostrar todo mundo como
// Desenvolvedor, ou seja, a tela exibiria informação falsa em vez de ausente.
// Estrutura de equipe não é dado de contato, e a coluna existe para mostrá-la.
export function userToPersonFor(viewer: AuthUser, u: UserRow): PersonDto {
  const dto = userToPerson(u);
  if (seesAll(viewer.level) || u.publicKey === viewer.publicKey) return dto;
  return { ...dto, email: '' };
}
