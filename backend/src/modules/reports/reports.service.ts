// Relatórios (§17.12, §24). Agregação feita no PostgreSQL (groupBy e SQL com
// date_trunc no fuso da organização), nunca carregando todas as atividades no
// Node. Escopo: dev vê só os próprios dados; gestor/ceo veem a equipe.
import { Prisma } from '@prisma/client';
import type { Db } from '../../common/database/prisma.js';
import { seesAll, type AuthUser } from '../../common/auth/types.js';
import { civilDateAsUtc, civilTodayISO } from '../../common/domain/time.js';
import { env } from '../../config/env.js';

export type ReportFilters = {
  from?: string;
  to?: string;
  project?: string;
  person?: string;
  category?: string;
};

function scopeWhere(actor: AuthUser, f: ReportFilters): Prisma.ActivityWhereInput {
  const w: Prisma.ActivityWhereInput = { deletedAt: null };
  if (f.from || f.to) {
    w.occurredAt = {};
    if (f.from) w.occurredAt.gte = new Date(f.from);
    if (f.to) w.occurredAt.lte = new Date(f.to);
  }
  if (f.project) w.project = { name: f.project };
  if (f.category) w.categoryNameSnapshot = f.category;
  if (!seesAll(actor.level)) w.userId = actor.id; // dev: visão pessoal (§24.1)
  else if (f.person) w.user = { publicKey: f.person };
  return w;
}

// Condições equivalentes para SQL bruto (série diária).
function scopeSql(actor: AuthUser, f: ReportFilters): Prisma.Sql {
  const conds: Prisma.Sql[] = [Prisma.sql`a.deleted_at IS NULL`];
  if (f.from) conds.push(Prisma.sql`a.occurred_at >= ${new Date(f.from)}`);
  if (f.to) conds.push(Prisma.sql`a.occurred_at <= ${new Date(f.to)}`);
  if (!seesAll(actor.level)) conds.push(Prisma.sql`a.user_id = ${actor.id}::uuid`);
  else if (f.person)
    conds.push(Prisma.sql`a.user_id = (SELECT id FROM users WHERE public_key = ${f.person})`);
  if (f.project)
    conds.push(Prisma.sql`a.project_id = (SELECT id FROM projects WHERE name = ${f.project})`);
  if (f.category) conds.push(Prisma.sql`a.category_name_snapshot = ${f.category}`);
  return Prisma.join(conds, ' AND ');
}

export async function daily(db: Db, actor: AuthUser, f: ReportFilters): Promise<{ day: string; count: number }[]> {
  const tz = env.ORGANIZATION_TIMEZONE;
  const rows = await db.$queryRaw<{ day: Date; count: number }[]>`
    SELECT (date_trunc('day', a.occurred_at AT TIME ZONE ${tz}))::date AS day, count(*)::int AS count
    FROM activities a
    WHERE ${scopeSql(actor, f)}
    GROUP BY day
    ORDER BY day`;
  return rows.map((r) => ({ day: r.day.toISOString().slice(0, 10), count: Number(r.count) }));
}

export async function byProject(db: Db, actor: AuthUser, f: ReportFilters) {
  const where = scopeWhere(actor, f);
  const groups = await db.activity.groupBy({
    by: ['projectId'],
    where,
    _count: { _all: true },
    _sum: { durationMinutes: true },
  });
  const projects = await db.project.findMany({
    where: { id: { in: groups.map((g) => g.projectId) } },
    select: { id: true, name: true },
  });
  const nameOf = new Map(projects.map((p) => [p.id, p.name]));
  return groups
    .map((g) => ({
      project: nameOf.get(g.projectId) ?? '—',
      count: g._count._all,
      durationMinutes: g._sum.durationMinutes ?? 0,
    }))
    .sort((a, b) => b.count - a.count);
}

export async function byCategory(db: Db, actor: AuthUser, f: ReportFilters) {
  const groups = await db.activity.groupBy({
    by: ['categoryNameSnapshot'],
    where: scopeWhere(actor, f),
    _count: { _all: true },
  });
  return groups
    .map((g) => ({ category: g.categoryNameSnapshot, count: g._count._all }))
    .sort((a, b) => b.count - a.count);
}

export async function byPerson(db: Db, actor: AuthUser, f: ReportFilters) {
  const groups = await db.activity.groupBy({ by: ['userId'], where: scopeWhere(actor, f), _count: { _all: true } });
  const users = await db.user.findMany({
    where: { id: { in: groups.map((g) => g.userId) } },
    select: { id: true, publicKey: true, name: true },
  });
  const map = new Map(users.map((u) => [u.id, u]));
  return groups
    .map((g) => ({ person: map.get(g.userId)?.publicKey ?? '—', name: map.get(g.userId)?.name ?? '—', count: g._count._all }))
    .sort((a, b) => b.count - a.count);
}

export async function summary(db: Db, actor: AuthUser, f: ReportFilters) {
  const where = scopeWhere(actor, f);
  const todayUtc = civilDateAsUtc(civilTodayISO(env.ORGANIZATION_TIMEZONE));
  const taskWhere: Prisma.TaskWhereInput = { deletedAt: null };
  if (!seesAll(actor.level)) taskWhere.assigneeId = actor.id;

  const [total, series, topProjects, topCategories, openTasks, lateTasks, doneTasks] = await Promise.all([
    db.activity.count({ where }),
    daily(db, actor, f),
    byProject(db, actor, f),
    byCategory(db, actor, f),
    db.task.count({ where: { ...taskWhere, done: false } }),
    db.task.count({ where: { ...taskWhere, done: false, dueDate: { lt: todayUtc } } }),
    db.task.count({ where: { ...taskWhere, done: true } }),
  ]);

  return {
    totalActivities: total,
    byDay: series,
    topProjects: topProjects.slice(0, 5),
    topCategories: topCategories.slice(0, 7),
    tasks: { open: openTasks, late: lateTasks, done: doneTasks },
  };
}
