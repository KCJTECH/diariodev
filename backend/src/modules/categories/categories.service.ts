// Categorias (§13.3, §17.7). Exclusão arquiva (nunca apaga): atividades antigas
// seguem exibindo o nome via category_name_snapshot. Ao arquivar, o slug é
// liberado para permitir recriar uma categoria com o mesmo nome.
import type { Db } from '../../common/database/prisma.js';
import { Errors } from '../../common/errors/app-error.js';
import type { AuthUser } from '../../common/auth/types.js';
import { slugify } from '../../common/utils/format.js';
import { writeOutbox } from '../../common/events/outbox.js';
import { writeAudit } from '../audit/audit.service.js';

type Meta = { requestId: string; ipHash: string | null; userAgent: string | null };

const select = { id: true, name: true, slug: true, description: true, color: true, active: true, sortOrder: true };

export type CategoryWrite = {
  name: string;
  description?: string | null;
  color?: string | null;
  active?: boolean;
  sortOrder?: number;
};

export function listCategories(db: Db) {
  return db.category.findMany({ where: { archivedAt: null }, select, orderBy: { sortOrder: 'asc' } });
}

export async function createCategory(db: Db, actor: AuthUser, input: CategoryWrite, meta: Meta) {
  const slug = slugify(input.name);
  const clash = await db.category.findFirst({ where: { slug, archivedAt: null } });
  if (clash) throw Errors.conflict('CATEGORY_EXISTS', 'Já existe uma categoria ativa com esse nome.');

  const row = await db.$transaction(async (tx) => {
    const created = await tx.category.create({
      data: {
        name: input.name.trim(),
        slug,
        description: input.description ?? null,
        color: input.color ?? null,
        sortOrder: input.sortOrder ?? 0,
        active: input.active ?? true,
      },
      select,
    });
    await writeOutbox(tx, { eventName: 'category.created', aggregateType: 'category', aggregateId: created.id, payload: { id: created.id } });
    return created;
  });
  await writeAudit(db, { actorUserId: actor.id, action: 'category.created', entityType: 'category', entityId: row.id, requestId: meta.requestId, ipHash: meta.ipHash, userAgent: meta.userAgent });
  return row;
}

export async function updateCategory(db: Db, actor: AuthUser, id: string, input: Partial<CategoryWrite>, meta: Meta) {
  const current = await db.category.findFirst({ where: { id, archivedAt: null } });
  if (!current) throw Errors.notFound('CATEGORY_NOT_FOUND', 'Categoria não encontrada.');

  let slug = current.slug;
  if (input.name && slugify(input.name) !== current.slug) {
    slug = slugify(input.name);
    const clash = await db.category.findFirst({ where: { slug, archivedAt: null, id: { not: id } } });
    if (clash) throw Errors.conflict('CATEGORY_EXISTS', 'Já existe uma categoria ativa com esse nome.');
  }

  const row = await db.$transaction(async (tx) => {
    const updated = await tx.category.update({
      where: { id },
      data: {
        name: input.name?.trim(),
        slug,
        description: input.description ?? undefined,
        color: input.color ?? undefined,
        active: input.active,
        sortOrder: input.sortOrder,
      },
      select,
    });
    await writeOutbox(tx, { eventName: 'category.updated', aggregateType: 'category', aggregateId: id, payload: { id } });
    return updated;
  });
  await writeAudit(db, { actorUserId: actor.id, action: 'category.updated', entityType: 'category', entityId: id, requestId: meta.requestId, ipHash: meta.ipHash, userAgent: meta.userAgent });
  return row;
}

export async function archiveCategory(db: Db, actor: AuthUser, id: string, meta: Meta): Promise<void> {
  const current = await db.category.findFirst({ where: { id, archivedAt: null } });
  if (!current) throw Errors.notFound('CATEGORY_NOT_FOUND', 'Categoria não encontrada.');

  await db.$transaction(async (tx) => {
    await tx.category.update({
      where: { id },
      // libera o slug para reuso do nome; o nome original permanece na coluna.
      data: { archivedAt: new Date(), active: false, slug: `${current.slug}--arch-${id.slice(0, 8)}` },
    });
    await writeOutbox(tx, { eventName: 'category.archived', aggregateType: 'category', aggregateId: id, payload: { id } });
  });
  await writeAudit(db, { actorUserId: actor.id, action: 'category.archived', entityType: 'category', entityId: id, requestId: meta.requestId, ipHash: meta.ipHash, userAgent: meta.userAgent });
}
