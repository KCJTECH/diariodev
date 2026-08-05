// Configuração global (aparência/marca) e preferências individuais (§17.11).
// Separadas por design: aparência é da organização (gestor+); preferências são
// do próprio usuário.
import type { Db } from '../../common/database/prisma.js';
import type { AuthUser } from '../../common/auth/types.js';
import { writeOutbox } from '../../common/events/outbox.js';

export async function getAppearance(db: Db): Promise<Record<string, unknown>> {
  const s = await db.appSetting.findFirst();
  return (s?.brand as Record<string, unknown>) ?? {};
}

export async function updateAppearance(db: Db, actor: AuthUser, patch: Record<string, unknown>) {
  const current = await db.appSetting.findFirst();
  const merged = { ...((current?.brand as object) ?? {}), ...patch };

  const result = await db.$transaction(async (tx) => {
    const row = current
      ? await tx.appSetting.update({ where: { id: current.id }, data: { brand: merged as never, updatedBy: actor.id, version: { increment: 1 } } })
      : await tx.appSetting.create({ data: { brand: merged as never, updatedBy: actor.id } });
    await writeOutbox(tx, { eventName: 'settings.appearance.updated', aggregateType: 'settings', aggregateId: row.id, payload: { brand: merged } });
    return row;
  });
  return (result.brand as Record<string, unknown>) ?? {};
}

export type PreferencesDto = {
  collapsed: boolean;
  density: string;
  theme: string;
  defaultProjectId: string | null;
  extra: Record<string, unknown>;
};

export async function getPreferences(db: Db, actor: AuthUser): Promise<PreferencesDto> {
  const p = await db.userPreference.findUnique({ where: { userId: actor.id } });
  return {
    collapsed: p?.collapsed ?? false,
    density: p?.density ?? 'confortável',
    theme: p?.themePreference ?? 'light',
    defaultProjectId: p?.defaultProjectId ?? null,
    extra: (p?.extraPreferences as Record<string, unknown>) ?? {},
  };
}

export type PreferencesPatch = {
  collapsed?: boolean;
  density?: string;
  theme?: string;
  defaultProjectId?: string | null;
  extra?: Record<string, unknown>;
};

export async function updatePreferences(db: Db, actor: AuthUser, patch: PreferencesPatch): Promise<PreferencesDto> {
  const existing = await db.userPreference.findUnique({ where: { userId: actor.id } });
  const mergedExtra = { ...((existing?.extraPreferences as object) ?? {}), ...(patch.extra ?? {}) };

  const p = await db.userPreference.upsert({
    where: { userId: actor.id },
    update: {
      collapsed: patch.collapsed,
      density: patch.density,
      themePreference: patch.theme,
      defaultProjectId: patch.defaultProjectId ?? undefined,
      extraPreferences: patch.extra ? (mergedExtra as never) : undefined,
    },
    create: {
      userId: actor.id,
      collapsed: patch.collapsed ?? false,
      density: patch.density ?? 'confortável',
      themePreference: patch.theme ?? 'light',
      defaultProjectId: patch.defaultProjectId ?? null,
      extraPreferences: mergedExtra as never,
    },
  });
  return {
    collapsed: p.collapsed,
    density: p.density,
    theme: p.themePreference,
    defaultProjectId: p.defaultProjectId,
    extra: (p.extraPreferences as Record<string, unknown>) ?? {},
  };
}
