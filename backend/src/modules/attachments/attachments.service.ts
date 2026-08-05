// Anexos (§17.4, §20). Upload validado (extensão + tipo real detectado +
// bloqueio de executáveis + checksum), download autenticado e remoção segura.
// Autorização: só o autor da atividade anexa/remove; quem pode ver a atividade baixa.
import { randomBytes, createHash } from 'node:crypto';
import { extname, basename } from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import { AttachmentStatus, type Prisma } from '@prisma/client';
import type { Db } from '../../common/database/prisma.js';
import { Errors } from '../../common/errors/app-error.js';
import { seesAll, type AuthUser } from '../../common/auth/types.js';
import { participatesInProject } from '../../common/domain/resolve.js';
import { formatBytes } from '../../common/utils/format.js';
import { env } from '../../config/env.js';
import { saveFile, fileStream, removeFile } from '../../common/storage/storage.js';
import { writeOutbox } from '../../common/events/outbox.js';
import { writeAudit } from '../audit/audit.service.js';

type Meta = { requestId: string; ipHash: string | null; userAgent: string | null };

const TEXT_EXT = new Set(['txt', 'csv', 'md', 'log', 'json']);
const BIN_MIME = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf',
  'application/zip', 'application/x-cfb',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);
const ALLOWED_EXT = new Set([...TEXT_EXT, 'png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf', 'zip', 'docx', 'xlsx', 'pptx']);

// remove diretório e caracteres reservados/de controle; mantém o resto legível
const UNSAFE = /[/\\:*?"<>|]/g;
function sanitizeName(name: string): string {
  const clean = basename(name)
    .split('')
    .filter((ch) => ch.charCodeAt(0) >= 32)
    .join('')
    .replace(UNSAFE, '_')
    .trim()
    .slice(0, 200);
  return clean || 'arquivo';
}

async function validate(name: string, buf: Buffer): Promise<{ mime: string; detected: string | null }> {
  const ext = extname(name).toLowerCase().replace('.', '');
  if (!ALLOWED_EXT.has(ext)) throw Errors.validation([{ message: `Extensão .${ext || '?'} não permitida.` }]);
  const detected = await fileTypeFromBuffer(buf);
  if (TEXT_EXT.has(ext)) {
    if (detected && !detected.mime.startsWith('text/')) {
      throw Errors.validation([{ message: 'O conteúdo não corresponde à extensão informada.' }]);
    }
    return { mime: 'text/plain; charset=utf-8', detected: detected?.mime ?? null };
  }
  if (!detected) throw Errors.validation([{ message: 'Não foi possível verificar o tipo do arquivo.' }]);
  if (!BIN_MIME.has(detected.mime)) throw Errors.validation([{ message: `Tipo ${detected.mime} não permitido.` }]);
  return { mime: detected.mime, detected: detected.mime };
}

const activitySelect = { id: true, userId: true, projectId: true, project: { select: { name: true } } } satisfies Prisma.ActivitySelect;

async function canView(db: Db, actor: AuthUser, activity: { userId: string; project: { name: string } }): Promise<boolean> {
  if (actor.id === activity.userId || seesAll(actor.level)) return true;
  return participatesInProject(db, actor.id, activity.project.name);
}

export async function uploadAttachment(
  db: Db,
  actor: AuthUser,
  activityId: string,
  file: { filename: string; buffer: Buffer },
  meta: Meta,
): Promise<{ id: string; name: string; size: string }> {
  const activity = await db.activity.findFirst({ where: { id: activityId, deletedAt: null }, select: activitySelect });
  if (!activity) throw Errors.notFound('ACTIVITY_NOT_FOUND', 'Atividade não encontrada.');
  if (activity.userId !== actor.id) throw Errors.forbidden('Só o autor pode anexar arquivos.');

  const count = await db.attachment.count({ where: { activityId, deletedAt: null } });
  if (count >= env.MAX_ATTACHMENTS_PER_ACTIVITY) {
    throw Errors.conflict('TOO_MANY_ATTACHMENTS', `Limite de ${env.MAX_ATTACHMENTS_PER_ACTIVITY} anexos por atividade.`);
  }
  if (file.buffer.length === 0) throw Errors.validation([{ message: 'Arquivo vazio.' }]);
  if (file.buffer.length > env.MAX_UPLOAD_BYTES) throw Errors.validation([{ message: 'Arquivo excede o tamanho máximo.' }]);

  const originalName = sanitizeName(file.filename);
  const { mime, detected } = await validate(originalName, file.buffer);
  const checksum = createHash('sha256').update(file.buffer).digest('hex');
  const storageKey = randomBytes(24).toString('hex');
  await saveFile(storageKey, file.buffer);

  const created = await db.$transaction(async (tx) => {
    const row = await tx.attachment.create({
      data: {
        activityId,
        originalName,
        storageProvider: env.STORAGE_PROVIDER,
        storageKey,
        mimeType: mime,
        detectedMimeType: detected,
        sizeBytes: BigInt(file.buffer.length),
        checksum,
        uploadedBy: actor.id,
        status: AttachmentStatus.CLEAN,
      },
    });
    await writeOutbox(tx, { eventName: 'activity.updated', aggregateType: 'activity', aggregateId: activityId, payload: { id: activityId }, scope: { type: 'project', id: activity.projectId } });
    return row;
  });

  await writeAudit(db, { actorUserId: actor.id, action: 'attachment.uploaded', entityType: 'attachment', entityId: created.id, requestId: meta.requestId, ipHash: meta.ipHash, userAgent: meta.userAgent });
  return { id: created.id, name: created.originalName, size: formatBytes(created.sizeBytes) };
}

export async function downloadAttachment(
  db: Db,
  actor: AuthUser,
  attachmentId: string,
): Promise<{ stream: NodeJS.ReadableStream; filename: string; mime: string; size: number }> {
  const att = await db.attachment.findFirst({
    where: { id: attachmentId, deletedAt: null, status: AttachmentStatus.CLEAN },
    include: { activity: { select: activitySelect } },
  });
  if (!att || !att.activity) throw Errors.notFound('ATTACHMENT_NOT_FOUND', 'Anexo não encontrado.');
  if (!(await canView(db, actor, att.activity))) throw Errors.notFound('ATTACHMENT_NOT_FOUND', 'Anexo não encontrado.');
  return { stream: fileStream(att.storageKey), filename: att.originalName, mime: att.mimeType, size: Number(att.sizeBytes) };
}

export async function removeAttachment(db: Db, actor: AuthUser, attachmentId: string, meta: Meta): Promise<void> {
  const att = await db.attachment.findFirst({ where: { id: attachmentId, deletedAt: null }, include: { activity: { select: activitySelect } } });
  if (!att || !att.activity) throw Errors.notFound('ATTACHMENT_NOT_FOUND', 'Anexo não encontrado.');
  if (att.activity.userId !== actor.id && !seesAll(actor.level)) throw Errors.forbidden('Sem permissão para remover o anexo.');

  await db.attachment.update({ where: { id: attachmentId }, data: { status: AttachmentStatus.DELETED, deletedAt: new Date() } });
  await removeFile(att.storageKey);
  await writeAudit(db, { actorUserId: actor.id, action: 'attachment.deleted', entityType: 'attachment', entityId: attachmentId, requestId: meta.requestId, ipHash: meta.ipHash, userAgent: meta.userAgent });
}
