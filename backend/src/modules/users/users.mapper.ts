// Mapeia usuário para o formato "pessoa" do frontend (§9.2). Sem hash de senha.
import { Prisma } from '@prisma/client';
import { LEVEL_TO_API } from '../../common/auth/types.js';

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
