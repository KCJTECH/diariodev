// Grupos de acesso (§13.8/13.9, §17.9). Regra determinística (ADR-007): o nível
// efetivo do usuário é o MAIOR nível entre seus grupos ativos; sem grupo, DEV.
// Salvar membros/nível recalcula os usuários afetados na MESMA transação e
// bloqueia se isso deixaria a organização sem nenhum CEO ativo.
import type { AccessLevel, Prisma } from '@prisma/client';
import type { Db } from '../../common/database/prisma.js';
import { Errors } from '../../common/errors/app-error.js';
import { API_TO_LEVEL, type ApiLevel, type AuthUser } from '../../common/auth/types.js';
import {
  assertCanAdministerLevel,
  assertCanAffectLevels,
  assertCanGrantLevel,
  type LevelTarget,
} from '../../common/auth/policy.js';
import { writeOutbox } from '../../common/events/outbox.js';
import { writeAudit } from '../audit/audit.service.js';

type Meta = { requestId: string; ipHash: string | null; userAgent: string | null };
const RANK_ENUM: Record<AccessLevel, number> = { DEV: 1, GESTOR: 2, CEO: 3 };
const API_LEVEL: Record<AccessLevel, ApiLevel> = { DEV: 'dev', GESTOR: 'gestor', CEO: 'ceo' };

const include = { members: { select: { user: { select: { publicKey: true } } } } } satisfies Prisma.AccessGroupInclude;
type GroupRow = Prisma.AccessGroupGetPayload<{ include: typeof include }>;

export type GroupDto = { id: string; name: string; desc: string; level: string; perms: string[]; members: string[] };
export type GroupWrite = { name: string; desc?: string; level: ApiLevel; perms?: string[] };

function toDto(g: GroupRow): GroupDto {
  return {
    id: g.id,
    name: g.name,
    desc: g.description ?? '',
    level: API_LEVEL[g.level],
    perms: g.permissions,
    members: g.members.map((m) => m.user.publicKey),
  };
}

// Recalcula o nível efetivo dos usuários informados a partir dos grupos ativos.
async function recalcLevels(tx: Prisma.TransactionClient, userIds: string[]): Promise<void> {
  for (const userId of [...new Set(userIds)]) {
    const groups = await tx.accessGroup.findMany({
      where: { deletedAt: null, active: true, members: { some: { userId } } },
      select: { level: true },
    });
    let level: AccessLevel = 'DEV';
    for (const g of groups) if (RANK_ENUM[g.level] > RANK_ENUM[level]) level = g.level;
    await tx.user.update({ where: { id: userId }, data: { effectiveLevel: level } });
  }
}

// Aborta a transação se não sobrar nenhum CEO ativo (§13.1).
async function ensureCeoRemains(tx: Prisma.TransactionClient): Promise<void> {
  const ceos = await tx.user.count({ where: { effectiveLevel: 'CEO', active: true, deletedAt: null } });
  if (ceos === 0) throw Errors.conflict('LAST_CEO', 'A alteração deixaria a organização sem CEO ativo.');
}

// Devolve identidade e nível: o nível é necessário para autorizar quem entra no
// recálculo. Chaves públicas inexistentes continuam sendo descartadas em silêncio.
async function resolveUsers(db: Db, publicKeys: string[]): Promise<LevelTarget[]> {
  if (publicKeys.length === 0) return [];
  return db.user.findMany({
    where: { publicKey: { in: publicKeys }, deletedAt: null },
    select: { id: true, effectiveLevel: true },
  });
}

// Quem é afetado por uma troca de membros: só quem entra ou sai. Validar a lista
// inteira impediria um gestor de salvar qualquer grupo que já tenha um CEO entre
// os membros, porque o PUT da tela é substituição total e reenvia todos.
function membrosAfetados(antes: LevelTarget[], depois: LevelTarget[]): LevelTarget[] {
  const idsAntes = new Set(antes.map((u) => u.id));
  const idsDepois = new Set(depois.map((u) => u.id));
  return [...antes.filter((u) => !idsDepois.has(u.id)), ...depois.filter((u) => !idsAntes.has(u.id))];
}

export async function listGroups(db: Db): Promise<GroupDto[]> {
  const rows = await db.accessGroup.findMany({ where: { deletedAt: null }, include, orderBy: { createdAt: 'asc' } });
  return rows.map(toDto);
}

export async function createGroup(db: Db, actor: AuthUser, input: GroupWrite, meta: Meta): Promise<GroupDto> {
  // Sem o teto, um gestor cria grupo de nível ceo e se inclui nele: era o
  // segundo caminho de autopromoção, equivalente ao PATCH de usuário.
  assertCanGrantLevel(actor, input.level);

  const id = await db.$transaction(async (tx) => {
    const g = await tx.accessGroup.create({
      data: { name: input.name.trim(), description: input.desc ?? null, level: API_TO_LEVEL[input.level], permissions: input.perms ?? [] },
    });
    await writeOutbox(tx, { eventName: 'group.created', aggregateType: 'group', aggregateId: g.id, payload: { id: g.id } });
    return g.id;
  });
  await writeAudit(db, { actorUserId: actor.id, action: 'group.created', entityType: 'group', entityId: id, requestId: meta.requestId, ipHash: meta.ipHash, userAgent: meta.userAgent });
  const row = await db.accessGroup.findUniqueOrThrow({ where: { id }, include });
  return toDto(row);
}

export async function updateGroup(db: Db, actor: AuthUser, id: string, input: Partial<GroupWrite>, meta: Meta): Promise<GroupDto> {
  const current = await db.accessGroup.findFirst({ where: { id, deletedAt: null }, include });
  if (!current) throw Errors.notFound('GROUP_NOT_FOUND', 'Grupo não encontrado.');

  // Não se administra grupo de nível acima do próprio, nem para renomear, e não
  // se eleva um grupo além do próprio nível.
  assertCanAdministerLevel(actor, API_LEVEL[current.level]);
  if (input.level) assertCanGrantLevel(actor, input.level);

  const members = await resolveUsers(db, current.members.map((m) => m.user.publicKey));
  const memberIds = members.map((u) => u.id);
  // Trocar o nível do grupo recalcula todos os membros: todos precisam ser
  // administráveis pelo ator, senão um gestor rebaixaria o grupo de um superior.
  if (input.level) assertCanAffectLevels(actor, members);

  await db.$transaction(async (tx) => {
    await tx.accessGroup.update({
      where: { id },
      data: {
        name: input.name?.trim(),
        description: input.desc ?? undefined,
        level: input.level ? API_TO_LEVEL[input.level] : undefined,
        permissions: input.perms ?? undefined,
      },
    });
    // Mudar o nível do grupo pode alterar o nível efetivo dos membros.
    if (input.level) {
      await recalcLevels(tx, memberIds);
      await ensureCeoRemains(tx);
    }
    await writeOutbox(tx, { eventName: 'group.updated', aggregateType: 'group', aggregateId: id, payload: { id } });
  });
  await writeAudit(db, { actorUserId: actor.id, action: 'group.updated', entityType: 'group', entityId: id, requestId: meta.requestId, ipHash: meta.ipHash, userAgent: meta.userAgent });
  const row = await db.accessGroup.findUniqueOrThrow({ where: { id }, include });
  return toDto(row);
}

export async function setGroupMembers(db: Db, actor: AuthUser, id: string, memberKeys: string[], meta: Meta): Promise<GroupDto> {
  const current = await db.accessGroup.findFirst({ where: { id, deletedAt: null }, include });
  if (!current) throw Errors.notFound('GROUP_NOT_FOUND', 'Grupo não encontrado.');

  // É esta linha que fecha a autopromoção por grupo: bloqueia incluir qualquer
  // pessoa, inclusive a si mesmo, em grupo de nível superior ao do ator.
  assertCanAdministerLevel(actor, API_LEVEL[current.level]);

  const antes = await resolveUsers(db, current.members.map((m) => m.user.publicKey));
  const depois = await resolveUsers(db, memberKeys);
  assertCanAffectLevels(actor, membrosAfetados(antes, depois));

  const oldIds = antes.map((u) => u.id);
  const newIds = depois.map((u) => u.id);

  await db.$transaction(async (tx) => {
    await tx.groupMember.deleteMany({ where: { groupId: id } });
    if (newIds.length) {
      await tx.groupMember.createMany({ data: newIds.map((userId) => ({ groupId: id, userId })) });
    }
    await recalcLevels(tx, [...oldIds, ...newIds]);
    await ensureCeoRemains(tx);
    await writeOutbox(tx, { eventName: 'group.updated', aggregateType: 'group', aggregateId: id, payload: { id } });
    await writeOutbox(tx, { eventName: 'permissions.changed', aggregateType: 'group', aggregateId: id, payload: { members: memberKeys } });
  });
  await writeAudit(db, { actorUserId: actor.id, action: 'group.members_set', entityType: 'group', entityId: id, requestId: meta.requestId, ipHash: meta.ipHash, userAgent: meta.userAgent });
  const row = await db.accessGroup.findUniqueOrThrow({ where: { id }, include });
  return toDto(row);
}

export async function deleteGroup(db: Db, actor: AuthUser, id: string, meta: Meta): Promise<void> {
  const current = await db.accessGroup.findFirst({ where: { id, deletedAt: null }, include });
  if (!current) throw Errors.notFound('GROUP_NOT_FOUND', 'Grupo não encontrado.');

  // Apagar o grupo rebaixa todos os membros. Sem estas duas linhas, um gestor
  // apagaria o grupo Diretoria e rebaixaria os CEOs, e a salvaguarda do último
  // CEO só barraria se sobrasse zero.
  assertCanAdministerLevel(actor, API_LEVEL[current.level]);
  const members = await resolveUsers(db, current.members.map((m) => m.user.publicKey));
  assertCanAffectLevels(actor, members);
  const memberIds = members.map((u) => u.id);

  await db.$transaction(async (tx) => {
    await tx.accessGroup.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    await tx.groupMember.deleteMany({ where: { groupId: id } });
    await recalcLevels(tx, memberIds);
    await ensureCeoRemains(tx);
    await writeOutbox(tx, { eventName: 'group.deleted', aggregateType: 'group', aggregateId: id, payload: { id } });
  });
  await writeAudit(db, { actorUserId: actor.id, action: 'group.deleted', entityType: 'group', entityId: id, requestId: meta.requestId, ipHash: meta.ipHash, userAgent: meta.userAgent });
}
