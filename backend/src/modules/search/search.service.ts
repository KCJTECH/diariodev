// Pesquisa global (§17.13). Respeita o escopo: dev só encontra as próprias
// atividades/tarefas e os projetos que participa. Mínimo de 2 caracteres e
// limite por tipo para não gerar consultas caras.
import type { Prisma } from '@prisma/client';
import type { Db } from '../../common/database/prisma.js';
import { seesAll, type AuthUser } from '../../common/auth/types.js';
import { activityInclude, activityToDto } from '../activities/activities.mapper.js';
import { taskInclude, taskToDto } from '../tasks/tasks.mapper.js';
import { userSelect, userToPerson } from '../users/users.mapper.js';
import { listProjects } from '../projects/projects.service.js';

const LIMIT = 20;

export async function search(db: Db, actor: AuthUser, q: string) {
  const term = q.trim();
  if (term.length < 2) {
    return { activities: [], people: [], projects: [], categories: [], tasks: [] };
  }
  const like = { contains: term, mode: 'insensitive' as const };

  const actWhere: Prisma.ActivityWhereInput = {
    deletedAt: null,
    OR: [{ title: like }, { description: like }, { tags: { has: term.toLowerCase() } }],
  };
  if (!seesAll(actor.level)) actWhere.userId = actor.id;

  const taskWhere: Prisma.TaskWhereInput = { deletedAt: null, title: like };
  if (!seesAll(actor.level)) taskWhere.assigneeId = actor.id;

  const [activities, tasks, people, categories, visibleProjects] = await Promise.all([
    db.activity.findMany({ where: actWhere, include: activityInclude, orderBy: { occurredAt: 'desc' }, take: LIMIT }),
    db.task.findMany({ where: taskWhere, include: taskInclude, orderBy: { dueDate: 'asc' }, take: LIMIT }),
    db.user.findMany({
      where: { deletedAt: null, OR: [{ name: like }, { email: like }, { roleTitle: like }] },
      select: userSelect,
      take: LIMIT,
    }),
    db.category.findMany({ where: { archivedAt: null, name: like }, select: { id: true, name: true, slug: true, color: true }, take: LIMIT }),
    listProjects(db, actor),
  ]);

  const projects = visibleProjects.filter((p) => p.name.toLowerCase().includes(term.toLowerCase())).slice(0, LIMIT);

  return {
    activities: activities.map(activityToDto),
    tasks: tasks.map(taskToDto),
    people: people.map(userToPerson),
    categories,
    projects,
  };
}
