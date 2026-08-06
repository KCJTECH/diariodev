// Pesquisa global (§17.13). Respeita o escopo: dev só encontra as próprias
// atividades/tarefas e os projetos que participa. Mínimo de 2 caracteres e
// limite por tipo para não gerar consultas caras.
import type { Prisma } from '@prisma/client';
import type { Db } from '../../common/database/prisma.js';
import { seesAll, type AuthUser } from '../../common/auth/types.js';
import { activityInclude, activityToDto } from '../activities/activities.mapper.js';
import { taskInclude, taskToDto } from '../tasks/tasks.mapper.js';
import { userSelect, userToPersonFor } from '../users/users.mapper.js';
import { listProjects } from '../projects/projects.service.js';

const LIMIT = 20;
// Candidatos buscados por texto antes do filtro de escopo. Folga para que o
// recorte por permissão não esvazie o resultado; ids não vão para o cliente.
const CANDIDATOS = LIMIT * 5;

type Id = { id: string };

// Casa ignorando acento e caixa (§14, §17.13). A normalização acontece na coluna,
// porque nenhuma transformação do termo faz "correcao" encontrar "correção". A
// função dv_norm e os índices trigram vêm da migration 20260806120000.
export async function search(db: Db, actor: AuthUser, q: string) {
  const term = q.trim();
  if (term.length < 2) {
    return { activities: [], people: [], projects: [], categories: [], tasks: [] };
  }
  const alvo = `%${term}%`;

  const [idsAtividade, idsTarefa, idsPessoa, idsProjeto, idsCategoria] = await Promise.all([
    db.$queryRaw<Id[]>`
      SELECT id FROM activities
      WHERE deleted_at IS NULL
        AND (dv_norm(title) LIKE dv_norm(${alvo}) OR dv_norm(description) LIKE dv_norm(${alvo}))
      ORDER BY occurred_at DESC LIMIT ${CANDIDATOS}`,
    db.$queryRaw<Id[]>`
      SELECT id FROM tasks
      WHERE deleted_at IS NULL AND dv_norm(title) LIKE dv_norm(${alvo})
      ORDER BY due_date ASC NULLS LAST LIMIT ${CANDIDATOS}`,
    db.$queryRaw<Id[]>`
      SELECT id FROM users
      WHERE deleted_at IS NULL
        AND (dv_norm(name) LIKE dv_norm(${alvo}) OR dv_norm(role_title) LIKE dv_norm(${alvo}))
      ORDER BY name ASC LIMIT ${CANDIDATOS}`,
    db.$queryRaw<Id[]>`
      SELECT id FROM projects
      WHERE archived_at IS NULL AND dv_norm(name) LIKE dv_norm(${alvo})
      ORDER BY name ASC LIMIT ${CANDIDATOS}`,
    db.$queryRaw<Id[]>`
      SELECT id FROM categories
      WHERE archived_at IS NULL AND dv_norm(name) LIKE dv_norm(${alvo})
      ORDER BY sort_order ASC LIMIT ${CANDIDATOS}`,
  ]);
  const so = (rows: Id[]): string[] => rows.map((r) => r.id);

  // O escopo continua no Prisma: a consulta de texto só levanta candidatos, e
  // quem decide o que a pessoa pode ver é o filtro abaixo.
  const actWhere: Prisma.ActivityWhereInput = {
    deletedAt: null,
    OR: [{ id: { in: so(idsAtividade) } }, { tags: { has: term.toLowerCase() } }],
  };
  if (!seesAll(actor.level)) actWhere.userId = actor.id;

  const taskWhere: Prisma.TaskWhereInput = { deletedAt: null, id: { in: so(idsTarefa) } };
  if (!seesAll(actor.level)) taskWhere.assigneeId = actor.id;

  const [activities, tasks, people, categories, visibleProjects] = await Promise.all([
    db.activity.findMany({ where: actWhere, include: activityInclude, orderBy: { occurredAt: 'desc' }, take: LIMIT }),
    db.task.findMany({ where: taskWhere, include: taskInclude, orderBy: { dueDate: 'asc' }, take: LIMIT }),
    db.user.findMany({
      where: { deletedAt: null, id: { in: so(idsPessoa) } },
      select: userSelect,
      take: LIMIT,
    }),
    db.category.findMany({
      where: { archivedAt: null, id: { in: so(idsCategoria) } },
      select: { id: true, name: true, slug: true, color: true },
      take: LIMIT,
    }),
    listProjects(db, actor),
  ]);

  // Projeto respeita a lista visível ao usuário, que já vem filtrada por participação.
  const permitidos = new Set(so(idsProjeto));
  const projects = visibleProjects.filter((p) => permitidos.has(p.id)).slice(0, LIMIT);

  return {
    activities: activities.map(activityToDto),
    tasks: tasks.map(taskToDto),
    people: people.map((p) => userToPersonFor(actor, p)),
    categories,
    projects,
  };
}
