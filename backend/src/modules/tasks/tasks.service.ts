// Regras de tarefa (§16, §17.5). Dev vê e conclui as próprias; gestor/ceo
// planejam, atribuem e editam. Escrita transacional com versão, outbox e auditoria.
import type { Prisma } from '@prisma/client';
import type { Db } from '../../common/database/prisma.js';
import { Errors } from '../../common/errors/app-error.js';
import { seesAll, canPlan, type AuthUser } from '../../common/auth/types.js';
import { priorityFromApi, type ApiPriority } from '../../common/domain/priority.js';
import { parsePagination } from '../../common/http/pagination.js';
import { resolveProject, resolveCategory } from '../../common/domain/resolve.js';
import { civilTodayISO, civilDateAsUtc } from '../../common/domain/time.js';
import { writeOutbox } from '../../common/events/outbox.js';
import { writeAudit } from '../audit/audit.service.js';
import { env } from '../../config/env.js';
import { taskInclude, taskToDto, type TaskDto } from './tasks.mapper.js';

export type TaskListFilters = {
  project?: string;
  person?: string;
  status?: 'open' | 'late' | 'done';
  page?: number;
  perPage?: number;
};

export type TaskWrite = {
  title: string;
  desc?: string;
  proj: string;
  who?: string | null; // publicKey do responsável
  due?: string | null; // YYYY-MM-DD
  pri: ApiPriority;
  cat?: string | null;
  clientMutationId?: string;
};

type Meta = { requestId: string; ipHash: string | null; userAgent: string | null };

async function resolveAssigneeId(db: Db, publicKey: string | null | undefined): Promise<string | null> {
  if (!publicKey) return null;
  const user = await db.user.findFirst({ where: { publicKey, deletedAt: null }, select: { id: true } });
  if (!user) throw Errors.notFound('USER_NOT_FOUND', 'Responsável não encontrado.');
  return user.id;
}

export async function listTasks(
  db: Db,
  actor: AuthUser,
  f: TaskListFilters,
): Promise<{ items: TaskDto[]; total: number; page: number; perPage: number }> {
  const where: Prisma.TaskWhereInput = { deletedAt: null };
  if (f.project) where.project = { name: f.project };
  if (f.person) where.assignee = { publicKey: f.person };

  const todayUtc = civilDateAsUtc(civilTodayISO(env.ORGANIZATION_TIMEZONE));
  if (f.status === 'done') where.done = true;
  else if (f.status === 'open') where.done = false;
  else if (f.status === 'late') {
    where.done = false;
    where.dueDate = { lt: todayUtc };
  }

  // Dev só vê as próprias tarefas.
  if (!seesAll(actor.level)) where.assignee = { publicKey: actor.publicKey };

  const { page, perPage, skip, take } = parsePagination(f.page, f.perPage);
  const [rows, total] = await Promise.all([
    db.task.findMany({ where, include: taskInclude, orderBy: [{ done: 'asc' }, { dueDate: 'asc' }], skip, take }),
    db.task.count({ where }),
  ]);
  return { items: rows.map(taskToDto), total, page, perPage };
}

export async function getTask(db: Db, actor: AuthUser, id: string): Promise<TaskDto> {
  const row = await db.task.findFirst({ where: { id, deletedAt: null }, include: taskInclude });
  if (!row) throw Errors.notFound('TASK_NOT_FOUND', 'Tarefa não encontrada.');
  if (!seesAll(actor.level) && row.assignee?.publicKey !== actor.publicKey) {
    throw Errors.notFound('TASK_NOT_FOUND', 'Tarefa não encontrada.');
  }
  return taskToDto(row);
}

export async function createTask(db: Db, actor: AuthUser, input: TaskWrite, meta: Meta): Promise<TaskDto> {
  if (!canPlan(actor.level)) throw Errors.forbidden('Sem permissão para criar tarefas.');
  const assigneeId = await resolveAssigneeId(db, input.who);

  const id = await db.$transaction(async (tx) => {
    const project = await resolveProject(tx, input.proj, actor);
    const category = input.cat ? await resolveCategory(tx, input.cat) : { id: null, name: null };
    const task = await tx.task.create({
      data: {
        title: input.title,
        description: input.desc || null,
        projectId: project.id,
        assigneeId,
        createdBy: actor.id,
        dueDate: input.due ? civilDateAsUtc(input.due) : null,
        priority: priorityFromApi(input.pri),
        categoryId: category.id,
        categoryNameSnapshot: category.name,
        clientMutationId: input.clientMutationId ?? null,
      },
    });
    await writeOutbox(tx, {
      eventName: 'task.created',
      aggregateType: 'task',
      aggregateId: task.id,
      payload: { id: task.id, who: input.who ?? null },
      scope: { type: 'project', id: project.id },
    });
    return task.id;
  });

  await writeAudit(db, {
    actorUserId: actor.id,
    action: 'task.created',
    entityType: 'task',
    entityId: id,
    requestId: meta.requestId,
    ipHash: meta.ipHash,
    userAgent: meta.userAgent,
  });

  const row = await db.task.findUniqueOrThrow({ where: { id }, include: taskInclude });
  return taskToDto(row);
}

export async function updateTask(
  db: Db,
  actor: AuthUser,
  id: string,
  input: TaskWrite,
  expectedVersion: number,
  meta: Meta,
): Promise<TaskDto> {
  if (!canPlan(actor.level)) throw Errors.forbidden('Sem permissão para editar tarefas.');
  const current = await db.task.findFirst({ where: { id, deletedAt: null } });
  if (!current) throw Errors.notFound('TASK_NOT_FOUND', 'Tarefa não encontrada.');
  if (current.version !== expectedVersion) throw Errors.versionConflict();
  const assigneeId = await resolveAssigneeId(db, input.who);

  await db.$transaction(async (tx) => {
    const project = await resolveProject(tx, input.proj, actor);
    const category = input.cat ? await resolveCategory(tx, input.cat) : { id: null, name: null };
    await tx.task.update({
      where: { id },
      data: {
        title: input.title,
        description: input.desc || null,
        projectId: project.id,
        assigneeId,
        dueDate: input.due ? civilDateAsUtc(input.due) : null,
        priority: priorityFromApi(input.pri),
        categoryId: category.id,
        categoryNameSnapshot: category.name,
        version: { increment: 1 },
      },
    });
    await writeOutbox(tx, {
      eventName: 'task.updated',
      aggregateType: 'task',
      aggregateId: id,
      payload: { id },
      scope: { type: 'project', id: project.id },
    });
  });

  await writeAudit(db, {
    actorUserId: actor.id,
    action: 'task.updated',
    entityType: 'task',
    entityId: id,
    requestId: meta.requestId,
    ipHash: meta.ipHash,
    userAgent: meta.userAgent,
  });

  const row = await db.task.findUniqueOrThrow({ where: { id }, include: taskInclude });
  return taskToDto(row);
}

async function setDone(
  db: Db,
  actor: AuthUser,
  id: string,
  done: boolean,
  meta: Meta,
): Promise<TaskDto> {
  const current = await db.task.findFirst({ where: { id, deletedAt: null } });
  if (!current) throw Errors.notFound('TASK_NOT_FOUND', 'Tarefa não encontrada.');
  const isAssignee = current.assigneeId === actor.id;
  if (!isAssignee && !canPlan(actor.level)) throw Errors.forbidden('Sem permissão para alterar esta tarefa.');

  await db.$transaction(async (tx) => {
    await tx.task.update({
      where: { id },
      data: {
        done,
        completedAt: done ? new Date() : null,
        completedBy: done ? actor.id : null,
        completionActivityId: done ? current.completionActivityId : null,
        version: { increment: 1 },
      },
    });
    await writeOutbox(tx, {
      eventName: done ? 'task.completed' : 'task.reopened',
      aggregateType: 'task',
      aggregateId: id,
      payload: { id, by: actor.publicKey },
      scope: { type: 'project', id: current.projectId },
    });
  });

  await writeAudit(db, {
    actorUserId: actor.id,
    action: done ? 'task.completed' : 'task.reopened',
    entityType: 'task',
    entityId: id,
    requestId: meta.requestId,
    ipHash: meta.ipHash,
    userAgent: meta.userAgent,
  });

  const row = await db.task.findUniqueOrThrow({ where: { id }, include: taskInclude });
  return taskToDto(row);
}

export function completeTask(db: Db, actor: AuthUser, id: string, meta: Meta): Promise<TaskDto> {
  return setDone(db, actor, id, true, meta);
}

export function reopenTask(db: Db, actor: AuthUser, id: string, meta: Meta): Promise<TaskDto> {
  if (!canPlan(actor.level)) throw Errors.forbidden('Sem permissão para reabrir tarefas.');
  return setDone(db, actor, id, false, meta);
}

export async function removeTask(db: Db, actor: AuthUser, id: string, meta: Meta): Promise<void> {
  if (!canPlan(actor.level)) throw Errors.forbidden('Sem permissão para excluir tarefas.');
  const current = await db.task.findFirst({ where: { id, deletedAt: null } });
  if (!current) throw Errors.notFound('TASK_NOT_FOUND', 'Tarefa não encontrada.');

  await db.$transaction(async (tx) => {
    await tx.task.update({ where: { id }, data: { deletedAt: new Date(), version: { increment: 1 } } });
    await writeOutbox(tx, {
      eventName: 'task.deleted',
      aggregateType: 'task',
      aggregateId: id,
      payload: { id },
      scope: { type: 'project', id: current.projectId },
    });
  });

  await writeAudit(db, {
    actorUserId: actor.id,
    action: 'task.deleted',
    entityType: 'task',
    entityId: id,
    requestId: meta.requestId,
    ipHash: meta.ipHash,
    userAgent: meta.userAgent,
  });
}
