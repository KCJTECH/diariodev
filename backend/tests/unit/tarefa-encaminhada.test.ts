// Evento tarefa.encaminhada: aviso para quem recebeu a tarefa.
import { describe, it, expect } from 'vitest';
import { toExternalEvent, EXTERNAL_EVENTS } from '../../src/modules/integrations/webhook/events.js';

describe('evento de tarefa encaminhada', () => {
  it('task.assigned vira tarefa.encaminhada', () => {
    expect(toExternalEvent('task.assigned')).toBe('tarefa.encaminhada');
  });

  it('aparece na lista de eventos que a tela oferece', () => {
    expect(EXTERNAL_EVENTS).toContain('tarefa.encaminhada');
  });

  it('task.created continua sem virar webhook', () => {
    // O created alimenta o realtime da tela. Se virasse notificação, toda tarefa
    // criada sem responsável mandaria mensagem para ninguém.
    expect(toExternalEvent('task.created')).toBeNull();
    expect(toExternalEvent('task.updated')).toBeNull();
    expect(toExternalEvent('task.completed')).toBeNull();
  });

  it('evento desconhecido não dispara nada', () => {
    expect(toExternalEvent('coisa.inventada')).toBeNull();
  });
});
