// Mapeia tarefa do banco para o formato do frontend (§9.3). `due` em YYYY-MM-DD.
import { Prisma } from '@prisma/client';
import { priorityToApi } from '../../common/domain/priority.js';

export const taskInclude = {
  project: { select: { name: true } },
  assignee: { select: { publicKey: true } },
  creator: { select: { publicKey: true } },
} satisfies Prisma.TaskInclude;

type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

export type TaskDto = {
  id: string;
  title: string;
  desc: string;
  proj: string;
  who: string | null;
  by: string;
  due: string | null;
  pri: string;
  cat: string | null;
  done: boolean;
  completionActivityId: string | null;
  version: number;
};

export function taskToDto(t: TaskRow): TaskDto {
  return {
    id: t.id,
    title: t.title,
    desc: t.description ?? '',
    proj: t.project.name,
    who: t.assignee?.publicKey ?? null,
    by: t.creator.publicKey,
    due: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
    pri: priorityToApi(t.priority),
    cat: t.categoryNameSnapshot,
    done: t.done,
    completionActivityId: t.completionActivityId,
    version: t.version,
  };
}
