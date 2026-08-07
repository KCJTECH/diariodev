// Mapeia os eventos internos para os nomes externos que a interface exibe e que
// as integrações assinam (§21). Só estes eventos disparam webhook.
const INTERNAL_TO_EXTERNAL: Record<string, string> = {
  'activity.created': 'atividade.criada',
  'activity.updated': 'atividade.editada',
  'activity.deleted': 'atividade.excluida',
  'daily.summary': 'resumo.diario',
  // Tarefa atribuída a alguém, na criação ou ao trocar de responsável. Serve
  // para avisar a pessoa (e-mail direto, ou WhatsApp por um fluxo no n8n).
  // Só é emitido quando existe responsável: tarefa sem dono não avisa ninguém.
  'task.assigned': 'tarefa.encaminhada',
};

export function toExternalEvent(internal: string): string | null {
  return INTERNAL_TO_EXTERNAL[internal] ?? null;
}

export const EXTERNAL_EVENTS = Object.values(INTERNAL_TO_EXTERNAL);
