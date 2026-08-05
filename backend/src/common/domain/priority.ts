// Conversão entre o enum interno de prioridade e os rótulos do frontend
// ('baixa' | 'média' | 'alta').
import { Priority } from '@prisma/client';

export type ApiPriority = 'baixa' | 'média' | 'alta';

const TO_API: Record<Priority, ApiPriority> = {
  BAIXA: 'baixa',
  MEDIA: 'média',
  ALTA: 'alta',
};

const FROM_API: Record<ApiPriority, Priority> = {
  baixa: Priority.BAIXA,
  'média': Priority.MEDIA,
  alta: Priority.ALTA,
};

export function priorityToApi(p: Priority): ApiPriority {
  return TO_API[p];
}

export function priorityFromApi(p: ApiPriority): Priority {
  return FROM_API[p];
}
