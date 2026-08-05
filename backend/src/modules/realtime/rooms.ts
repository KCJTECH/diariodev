// Modelo de salas do Socket.IO (§18.2). O servidor decide em quais salas cada
// usuário entra e para quais salas cada evento vai — o cliente nunca escolhe.
//
// Convenção de níveis: gestor entra em 'level:gestor'; ceo entra em
// 'level:gestor' E 'level:ceo'. Assim, emitir um evento de equipe para
// 'level:gestor' alcança gestores e CEOs; eventos executivos vão só para
// 'level:ceo'. Devs entram nas salas dos projetos em que participam.
import type { Db } from '../../common/database/prisma.js';
import { seesAll, type AuthUser } from '../../common/auth/types.js';
import type { OutboxScope } from '../../common/events/outbox.js';

export const ORG_ROOM = 'organization:default';

export async function userRooms(db: Db, user: AuthUser): Promise<string[]> {
  const rooms = [ORG_ROOM, `user:${user.id}`];
  if (user.level === 'gestor') rooms.push('level:gestor');
  if (user.level === 'ceo') rooms.push('level:gestor', 'level:ceo');

  if (!seesAll(user.level)) {
    const [acts, tasks] = await Promise.all([
      db.activity.findMany({ where: { userId: user.id, deletedAt: null }, select: { projectId: true }, distinct: ['projectId'] }),
      db.task.findMany({ where: { assigneeId: user.id, deletedAt: null }, select: { projectId: true }, distinct: ['projectId'] }),
    ]);
    const ids = new Set<string>();
    acts.forEach((a) => ids.add(a.projectId));
    tasks.forEach((t) => ids.add(t.projectId));
    ids.forEach((id) => rooms.push(`project:${id}`));
  }
  return rooms;
}

// Salas de destino de um evento, a partir do nome e do escopo gravado na outbox.
export function eventRooms(eventName: string, scope: OutboxScope | null | undefined): string[] {
  if (eventName.startsWith('activity.') || eventName.startsWith('task.')) {
    const rooms = ['level:gestor'];
    if (scope?.type === 'project' && scope.id) rooms.push(`project:${scope.id}`);
    return rooms;
  }
  if (eventName.startsWith('category.') || eventName.startsWith('project.') || eventName.startsWith('settings.')) {
    return [ORG_ROOM];
  }
  if (eventName.startsWith('user.') || eventName.startsWith('group.') || eventName.startsWith('integration.')) {
    return ['level:gestor'];
  }
  if (eventName === 'permissions.changed') return [ORG_ROOM];
  return [ORG_ROOM];
}
