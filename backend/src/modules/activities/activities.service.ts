// Regras de atividade. Escopo aplicado no servidor (§16): dev vê/edita só as
// próprias; dentro de um projeto que participa, vê a timeline coletiva. Escrita
// transacional com versão otimista, outbox e auditoria.
import type { Prisma } from '@prisma/client';
import type { Db } from '../../common/database/prisma.js';
import { Errors } from '../../common/errors/app-error.js';
import { seesAll, type AuthUser } from '../../common/auth/types.js';
import { priorityFromApi, type ApiPriority } from '../../common/domain/priority.js';
import { parsePagination, safeSort } from '../../common/http/pagination.js';
import { resolveProject, resolveCategory, participatesInProject } from '../../common/domain/resolve.js';
import { writeOutbox } from '../../common/events/outbox.js';
import { writeAudit } from '../audit/audit.service.js';
import { activityInclude, activityToDto, type ActivityDto } from './activities.mapper.js';

export type ListFilters = {
  from?: string;
  to?: string;
  person?: string;
  project?: string;
  category?: string;
  q?: string;
  priority?: ApiPriority;
  tags?: string[];
  page?: number;
  perPage?: number;
  sort?: string;
  order?: 'asc' | 'desc';
};

export type ActivityWrite = {
  proj: string;
  cat: string;
  title: string;
  desc?: string;
  occurredAt: string;
  durationMinutes?: number | null;
  priority: ApiPriority;
  tags?: string[];
  clientMutationId?: string;
  sourceTaskId?: string | null;
};

const SORTS = ['occurredAt', 'createdAt', 'title', 'priority'] as const;
type Meta = { requestId: string; ipHash: string | null; userAgent: string | null };

export async function listActivities(
  db: Db,
  actor: AuthUser,
  f: ListFilters,
): Promise<{ items: ActivityDto[]; total: number; page: number; perPage: number }> {
  const where: Prisma.ActivityWhereInput = { deletedAt: null };

  if (f.from || f.to) {
    where.occurredAt = {};
    if (f.from) where.occurredAt.gte = new Date(f.from);
    if (f.to) where.occurredAt.lte = new Date(f.to);
  }
  if (f.person) where.user = { publicKey: f.person };
  if (f.project) where.project = { name: f.project };
  if (f.category) where.categoryNameSnapshot = f.category;
  if (f.priority) where.priority = priorityFromApi(f.priority);
  if (f.tags?.length) where.tags = { hasSome: f.tags };
  if (f.q) {
    where.OR = [
      { title: { contains: f.q, mode: 'insensitive' } },
      { description: { contains: f.q, mode: 'insensitive' } },
    ];
  }

  // Escopo: dev limitado a si, exceto timeline de projeto que participa.
  if (!seesAll(actor.level)) {
    const fullProject = f.project ? await participatesInProject(db, actor.id, f.project) : false;
    if (!fullProject) where.userId = actor.id;
  }

  const sort = safeSort(f.sort, SORTS, 'occurredAt');
  const order = f.order === 'asc' ? 'asc' : 'desc';
  const { page, perPage, skip, take } = parsePagination(f.page, f.perPage);

  const [rows, total] = await Promise.all([
    db.activity.findMany({ where, include: activityInclude, orderBy: { [sort]: order }, skip, take }),
    db.activity.count({ where }),
  ]);
  return { items: rows.map(activityToDto), total, page, perPage };
}

export async function getActivity(db: Db, actor: AuthUser, id: string): Promise<ActivityDto> {
  const row = await db.activity.findFirst({ where: { id, deletedAt: null }, include: activityInclude });
  if (!row) throw Errors.notFound('ACTIVITY_NOT_FOUND', 'Atividade não encontrada.');
  if (!seesAll(actor.level) && row.user.publicKey !== actor.publicKey) {
    const ok = await participatesInProject(db, actor.id, row.project.name);
    if (!ok) throw Errors.notFound('ACTIVITY_NOT_FOUND', 'Atividade não encontrada.');
  }
  return activityToDto(row);
}

export async function createActivity(
  db: Db,
  actor: AuthUser,
  input: ActivityWrite,
  meta: Meta,
): Promise<ActivityDto> {
  // Idempotência por clientMutationId (§17.3).
  if (input.clientMutationId) {
    const dup = await db.activity.findUnique({
      where: { uniq_activity_client_mutation: { userId: actor.id, clientMutationId: input.clientMutationId } },
      include: activityInclude,
    });
    if (dup) return activityToDto(dup);
  }

  const id = await db.$transaction(async (tx) => {
    const project = await resolveProject(tx, input.proj, actor.id);
    const category = await resolveCategory(tx, input.cat);
    const activity = await tx.activity.create({
      data: {
        userId: actor.id, // sempre a sessão; ignora qualquer "who" do cliente
        projectId: project.id,
        categoryId: category.id,
        categoryNameSnapshot: category.name,
        title: input.title,
        description: input.desc || null,
        occurredAt: new Date(input.occurredAt),
        durationMinutes: input.durationMinutes ?? null,
        priority: priorityFromApi(input.priority),
        tags: input.tags ?? [],
        sourceTaskId: input.sourceTaskId ?? null,
        clientMutationId: input.clientMutationId ?? null,
      },
    });

    // Concluir tarefa a partir da atividade, na mesma transação (§17.5).
    if (input.sourceTaskId) {
      const task = await tx.task.findFirst({ where: { id: input.sourceTaskId, deletedAt: null } });
      if (task && !task.done) {
        await tx.task.update({
          where: { id: task.id },
          data: {
            done: true,
            completedAt: new Date(),
            completedBy: actor.id,
            completionActivityId: activity.id,
            version: { increment: 1 },
          },
        });
        await writeOutbox(tx, {
          eventName: 'task.completed',
          aggregateType: 'task',
          aggregateId: task.id,
          payload: { id: task.id, completedBy: actor.publicKey },
          scope: { type: 'project', id: task.projectId },
        });
      }
    }

    await writeOutbox(tx, {
      eventName: 'activity.created',
      aggregateType: 'activity',
      aggregateId: activity.id,
      payload: { id: activity.id, who: actor.publicKey },
      scope: { type: 'project', id: project.id },
    });
    return activity.id;
  });

  await writeAudit(db, {
    actorUserId: actor.id,
    action: 'activity.created',
    entityType: 'activity',
    entityId: id,
    requestId: meta.requestId,
    ipHash: meta.ipHash,
    userAgent: meta.userAgent,
  });

  const row = await db.activity.findUniqueOrThrow({ where: { id }, include: activityInclude });
  return activityToDto(row);
}

export async function updateActivity(
  db: Db,
  actor: AuthUser,
  id: string,
  input: ActivityWrite,
  expectedVersion: number,
  meta: Meta,
): Promise<ActivityDto> {
  const current = await db.activity.findFirst({ where: { id, deletedAt: null } });
  if (!current) throw Errors.notFound('ACTIVITY_NOT_FOUND', 'Atividade não encontrada.');
  // Atividade é registro pessoal: só o autor edita.
  if (current.userId !== actor.id) throw Errors.forbidden('Só o autor pode editar esta atividade.');
  if (current.version !== expectedVersion) throw Errors.versionConflict();

  await db.$transaction(async (tx) => {
    const project = await resolveProject(tx, input.proj, actor.id);
    const category = await resolveCategory(tx, input.cat);
    await tx.activity.update({
      where: { id },
      data: {
        projectId: project.id,
        categoryId: category.id,
        categoryNameSnapshot: category.name,
        title: input.title,
        description: input.desc || null,
        occurredAt: new Date(input.occurredAt),
        durationMinutes: input.durationMinutes ?? null,
        priority: priorityFromApi(input.priority),
        tags: input.tags ?? [],
        version: { increment: 1 },
      },
    });
    await writeOutbox(tx, {
      eventName: 'activity.updated',
      aggregateType: 'activity',
      aggregateId: id,
      payload: { id, who: actor.publicKey },
      scope: { type: 'project', id: project.id },
    });
  });

  await writeAudit(db, {
    actorUserId: actor.id,
    action: 'activity.updated',
    entityType: 'activity',
    entityId: id,
    requestId: meta.requestId,
    before: { version: current.version },
    ipHash: meta.ipHash,
    userAgent: meta.userAgent,
  });

  const row = await db.activity.findUniqueOrThrow({ where: { id }, include: activityInclude });
  return activityToDto(row);
}

export async function removeActivity(db: Db, actor: AuthUser, id: string, meta: Meta): Promise<void> {
  const current = await db.activity.findFirst({ where: { id, deletedAt: null } });
  if (!current) throw Errors.notFound('ACTIVITY_NOT_FOUND', 'Atividade não encontrada.');
  if (current.userId !== actor.id) throw Errors.forbidden('Só o autor pode excluir esta atividade.');

  await db.$transaction(async (tx) => {
    await tx.activity.update({ where: { id }, data: { deletedAt: new Date(), version: { increment: 1 } } });
    await writeOutbox(tx, {
      eventName: 'activity.deleted',
      aggregateType: 'activity',
      aggregateId: id,
      payload: { id },
      scope: { type: 'project', id: current.projectId },
    });
  });

  await writeAudit(db, {
    actorUserId: actor.id,
    action: 'activity.deleted',
    entityType: 'activity',
    entityId: id,
    requestId: meta.requestId,
    ipHash: meta.ipHash,
    userAgent: meta.userAgent,
  });
}
