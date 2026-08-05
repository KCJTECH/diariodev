// Mapeia os eventos internos para os nomes externos que a interface exibe e que
// as integrações assinam (§21). Só estes eventos disparam webhook.
const INTERNAL_TO_EXTERNAL: Record<string, string> = {
  'activity.created': 'atividade.criada',
  'activity.updated': 'atividade.editada',
  'activity.deleted': 'atividade.excluida',
  'daily.summary': 'resumo.diario',
};

export function toExternalEvent(internal: string): string | null {
  return INTERNAL_TO_EXTERNAL[internal] ?? null;
}

export const EXTERNAL_EVENTS = Object.values(INTERNAL_TO_EXTERNAL);
