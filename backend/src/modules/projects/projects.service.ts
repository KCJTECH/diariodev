// Projetos (§13.4, §17.8). Listagem respeita escopo (dev vê só os que participa).
// Escrita e arquivamento exigem gestor+ (validado nas rotas). Projetos
// referenciados são arquivados, nunca apagados.
import type { Db } from '../../common/database/prisma.js';
import { Errors } from '../../common/errors/app-error.js';
import { seesAll, type AuthUser } from '../../common/auth/types.js';
import { slugify } from '../../common/utils/format.js';
import { writeOutbox } from '../../common/events/outbox.js';
import { writeAudit } from '../audit/audit.service.js';

type Meta = { requestId: string; ipHash: string | null; userAgent: string | null };
const select = { id: true, name: true, slug: true, description: true, active: true };

export type ProjectWrite = { name: string; description?: string | null; active?: boolean };

export async function listProjects(db: Db, actor: AuthUser) {
  const all = await db.project.findMany({ where: { archivedAt: null }, select, orderBy: { name: 'asc' } });
  if (seesAll(actor.level)) return all;

  const participating = new Set<string>();
  const [acts, tasks] = await Promise.all([
    db.activity.findMany({ where: { userId: actor.id, deletedAt: null }, select: { projectId: true }, distinct: ['projectId'] }),
    db.task.findMany({ where: { assigneeId: actor.id, deletedAt: null }, select: { projectId: true }, distinct: ['projectId'] }),
  ]);
  acts.forEach((a) => participating.add(a.projectId));
  tasks.forEach((t) => participating.add(t.projectId));
  return all.filter((p) => participating.has(p.id));
}

export async function createProject(db: Db, actor: AuthUser, input: ProjectWrite, meta: Meta) {
  const slug = slugify(input.name);
  const clash = await db.project.findFirst({ where: { slug, archivedAt: null } });
  if (clash) throw Errors.conflict('PROJECT_EXISTS', 'Já existe um projeto com esse nome.');

  const row = await db.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: { name: input.name.trim(), slug, description: input.description ?? null, createdBy: actor.id, active: input.active ?? true },
      select,
    });
    await writeOutbox(tx, { eventName: 'project.created', aggregateType: 'project', aggregateId: created.id, payload: { id: created.id } });
    return created;
  });
  await writeAudit(db, { actorUserId: actor.id, action: 'project.created', entityType: 'project', entityId: row.id, requestId: meta.requestId, ipHash: meta.ipHash, userAgent: meta.userAgent });
  return row;
}

export async function updateProject(db: Db, actor: AuthUser, id: string, input: Partial<ProjectWrite>, meta: Meta) {
  const current = await db.project.findFirst({ where: { id, archivedAt: null } });
  if (!current) throw Errors.notFound('PROJECT_NOT_FOUND', 'Projeto não encontrado.');

  let slug = current.slug;
  if (input.name && slugify(input.name) !== current.slug) {
    slug = slugify(input.name);
    const clash = await db.project.findFirst({ where: { slug, archivedAt: null, id: { not: id } } });
    if (clash) throw Errors.conflict('PROJECT_EXISTS', 'Já existe um projeto com esse nome.');
  }

  const row = await db.$transaction(async (tx) => {
    const updated = await tx.project.update({
      where: { id },
      data: { name: input.name?.trim(), slug, description: input.description ?? undefined, active: input.active },
      select,
    });
    await writeOutbox(tx, { eventName: 'project.updated', aggregateType: 'project', aggregateId: id, payload: { id } });
    return updated;
  });
  await writeAudit(db, { actorUserId: actor.id, action: 'project.updated', entityType: 'project', entityId: id, requestId: meta.requestId, ipHash: meta.ipHash, userAgent: meta.userAgent });
  return row;
}

export async function archiveProject(db: Db, actor: AuthUser, id: string, meta: Meta): Promise<void> {
  const current = await db.project.findFirst({ where: { id, archivedAt: null } });
  if (!current) throw Errors.notFound('PROJECT_NOT_FOUND', 'Projeto não encontrado.');

  await db.$transaction(async (tx) => {
    await tx.project.update({
      where: { id },
      data: { archivedAt: new Date(), active: false, slug: `${current.slug}--arch-${id.slice(0, 8)}` },
    });
    await writeOutbox(tx, { eventName: 'project.archived', aggregateType: 'project', aggregateId: id, payload: { id } });
  });
  await writeAudit(db, { actorUserId: actor.id, action: 'project.archived', entityType: 'project', entityId: id, requestId: meta.requestId, ipHash: meta.ipHash, userAgent: meta.userAgent });
}
