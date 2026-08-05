// Monta o estado inicial que hidrata o cache do frontend (§17.2). Respeita o
// escopo do usuário. A janela de atividades é limitada; períodos adicionais
// são buscados sob demanda pelas telas via GET /activities.
import type { Db } from '../../common/database/prisma.js';
import { seesAll, type AuthUser } from '../../common/auth/types.js';
import { env } from '../../config/env.js';
import { userToPerson } from '../users/users.mapper.js';
import { listActivities } from '../activities/activities.service.js';
import { listTasks } from '../tasks/tasks.service.js';
import { listGroups } from '../groups/groups.service.js';
import { listIntegrations, listRuns } from '../integrations/integrations.service.js';

const INITIAL_WINDOW_DAYS = 60;

export async function buildBootstrap(db: Db, actor: AuthUser): Promise<Record<string, unknown>> {
  const isManager = seesAll(actor.level);

  const [people, categories, projectRows, settings, prefs] = await Promise.all([
    db.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true, publicKey: true, name: true, roleTitle: true, email: true,
        initials: true, color: true, active: true, effectiveLevel: true, timezone: true,
      },
      orderBy: { name: 'asc' },
    }),
    db.category.findMany({
      where: { archivedAt: null },
      select: { id: true, name: true, slug: true, color: true, active: true, sortOrder: true },
      orderBy: { sortOrder: 'asc' },
    }),
    db.project.findMany({
      where: { archivedAt: null },
      select: { id: true, name: true, slug: true, active: true },
      orderBy: { name: 'asc' },
    }),
    db.appSetting.findFirst(),
    db.userPreference.findUnique({ where: { userId: actor.id } }),
  ]);

  // Projetos visíveis: gestor/ceo veem todos; dev, apenas os que participa.
  let projects = projectRows;
  if (!isManager) {
    const participating = new Set<string>();
    const [acts, tasks] = await Promise.all([
      db.activity.findMany({ where: { userId: actor.id, deletedAt: null }, select: { projectId: true }, distinct: ['projectId'] }),
      db.task.findMany({ where: { assigneeId: actor.id, deletedAt: null }, select: { projectId: true }, distinct: ['projectId'] }),
    ]);
    acts.forEach((a) => participating.add(a.projectId));
    tasks.forEach((t) => participating.add(t.projectId));
    projects = projectRows.filter((p) => participating.has(p.id));
  }

  const from = new Date(Date.now() - INITIAL_WINDOW_DAYS * 86_400_000).toISOString();
  const [activities, tasks] = await Promise.all([
    listActivities(db, actor, { from, perPage: 500, sort: 'occurredAt', order: 'desc' }),
    listTasks(db, actor, { perPage: 500 }),
  ]);

  // Grupos, integrações e histórico só entram no bootstrap de administradores.
  const [groups, integrations, integrationRuns] = isManager
    ? await Promise.all([listGroups(db), listIntegrations(db), listRuns(db, 20)])
    : [[], [], []];

  return {
    user: actor,
    people: people.map(userToPerson),
    categories,
    projects,
    activities: activities.items,
    tasks: tasks.items,
    groups,
    integrations,
    integrationRuns,
    appearance: settings?.brand ?? {},
    preferences: {
      collapsed: prefs?.collapsed ?? false,
      density: prefs?.density ?? 'confortável',
      theme: prefs?.themePreference ?? 'light',
      defaultProjectId: prefs?.defaultProjectId ?? null,
    },
    canAdminister: isManager,
    serverNow: new Date().toISOString(),
    timezone: env.ORGANIZATION_TIMEZONE,
    apiVersion: 'v1',
    cacheSchemaVersion: 1,
    cursor: null,
    socket: { path: '/socket.io' },
  };
}
