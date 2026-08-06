// Resolução de projeto e categoria a partir do nome digitado no frontend, e
// checagem de participação em projeto (regra de escopo do dev, §16.3).
import type { Prisma } from '@prisma/client';
import type { Db } from '../database/prisma.js';
import { Errors } from '../errors/app-error.js';
import { seesAll, type AuthUser } from '../auth/types.js';
import { slugify } from '../utils/format.js';

// find-or-create transacional de projeto por nome (§13.4). Retorna id e nome canônico.
//
// A checagem de participação mora aqui, e não no chamador, porque participação em
// projeto é auto-declarada por escrita: participa quem tem atividade ou tarefa no
// projeto (§16.3). Sem esta guarda, um dev escrevia uma atividade em projeto
// alheio, passava a "participar" e com isso destravava a timeline completa de
// terceiros, os anexos daquele projeto e a sala de realtime dele. Projeto novo
// continua podendo nascer de uma atividade, que é o comportamento do protótipo.
export async function resolveProject(
  tx: Prisma.TransactionClient,
  name: string,
  actor: AuthUser,
): Promise<{ id: string; name: string }> {
  const slug = slugify(name);
  const existing = await tx.project.findUnique({ where: { slug } });
  if (existing) {
    if (!seesAll(actor.level)) {
      const [act, task] = await Promise.all([
        tx.activity.count({ where: { userId: actor.id, projectId: existing.id, deletedAt: null } }),
        tx.task.count({ where: { assigneeId: actor.id, projectId: existing.id, deletedAt: null } }),
      ]);
      if (act + task === 0) {
        throw Errors.forbidden('Você não participa desse projeto. Peça uma tarefa nele para começar a registrar.');
      }
    }
    return { id: existing.id, name: existing.name };
  }
  const created = await tx.project.create({
    data: { name: name.trim(), slug, createdBy: actor.id },
  });
  return { id: created.id, name: created.name };
}

// Resolve categoria ativa por nome; se não existir, mantém o nome como snapshot
// e categoryId nulo (a atividade ainda exibe o nome correto).
export async function resolveCategory(
  tx: Prisma.TransactionClient,
  name: string,
): Promise<{ id: string | null; name: string }> {
  const slug = slugify(name);
  const cat = await tx.category.findUnique({ where: { slug } });
  if (cat && cat.archivedAt === null) return { id: cat.id, name: cat.name };
  return { id: null, name: name.trim() };
}

// Dev participa de um projeto se tem atividade ou tarefa nele (§16.3).
export async function participatesInProject(db: Db, actorId: string, projectName: string): Promise<boolean> {
  const slug = slugify(projectName);
  const project = await db.project.findUnique({ where: { slug }, select: { id: true } });
  if (!project) return false;
  const [act, task] = await Promise.all([
    db.activity.count({ where: { userId: actorId, projectId: project.id, deletedAt: null } }),
    db.task.count({ where: { assigneeId: actorId, projectId: project.id, deletedAt: null } }),
  ]);
  return act + task > 0;
}
