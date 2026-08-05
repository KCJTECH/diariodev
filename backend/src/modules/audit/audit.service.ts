// Registro de auditoria (§13.15). Nunca grava senha, token, cookie ou segredo.
// Chamado pelos módulos após ações relevantes; falha de auditoria não deve
// derrubar a operação principal, então erros são apenas logados.
import type { Db } from '../../common/database/prisma.js';
import { logger } from '../../common/logging/logger.js';

export type AuditInput = {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  requestId?: string | null;
  before?: unknown;
  after?: unknown;
  ipHash?: string | null;
  userAgent?: string | null;
};

export async function writeAudit(db: Db, input: AuditInput): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        requestId: input.requestId ?? null,
        beforeData: (input.before ?? undefined) as never,
        afterData: (input.after ?? undefined) as never,
        ipHash: input.ipHash ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  } catch (err) {
    logger.error({ err, action: input.action }, 'falha ao gravar auditoria');
  }
}
