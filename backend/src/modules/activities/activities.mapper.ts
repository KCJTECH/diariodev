// Mapeia a atividade do banco para o formato consumido pelo frontend (§9.1).
// `occurredAt` vai em ISO; a conversão para `d`/`t`/`dur` é feita no adaptador
// de assets/data.js, que conhece o fuso e a data do servidor.
import { Prisma } from '@prisma/client';
import { priorityToApi } from '../../common/domain/priority.js';
import { formatBytes } from '../../common/utils/format.js';

export const activityInclude = {
  user: { select: { publicKey: true } },
  project: { select: { name: true } },
  attachments: {
    where: { deletedAt: null },
    select: { id: true, originalName: true, sizeBytes: true },
  },
} satisfies Prisma.ActivityInclude;

type ActivityRow = Prisma.ActivityGetPayload<{ include: typeof activityInclude }>;

export type ActivityDto = {
  id: string;
  who: string;
  proj: string;
  cat: string;
  title: string;
  desc: string;
  occurredAt: string;
  durationMinutes: number | null;
  priority: string;
  tags: string[];
  files: { id: string; name: string; size: string }[];
  sourceTaskId: string | null;
  version: number;
};

export function activityToDto(a: ActivityRow): ActivityDto {
  return {
    id: a.id,
    who: a.user.publicKey,
    proj: a.project.name,
    cat: a.categoryNameSnapshot,
    title: a.title,
    desc: a.description ?? '',
    occurredAt: a.occurredAt.toISOString(),
    durationMinutes: a.durationMinutes,
    priority: priorityToApi(a.priority),
    tags: a.tags,
    files: a.attachments.map((f) => ({ id: f.id, name: f.originalName, size: formatBytes(f.sizeBytes) })),
    sourceTaskId: a.sourceTaskId,
    version: a.version,
  };
}
