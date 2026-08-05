import { describe, it, expect } from 'vitest';
import { Priority } from '@prisma/client';
import { priorityToApi, priorityFromApi } from '../../src/common/domain/priority.js';
import { formatBytes, slugify } from '../../src/common/utils/format.js';
import { civilTodayISO, civilDateAsUtc } from '../../src/common/domain/time.js';
import { rankOf, seesAll, isExec, canPlan, LEVEL_TO_API, API_TO_LEVEL } from '../../src/common/auth/types.js';

describe('prioridade dev<->frontend', () => {
  it('mapeia ida e volta', () => {
    expect(priorityToApi(Priority.ALTA)).toBe('alta');
    expect(priorityToApi(Priority.MEDIA)).toBe('média');
    expect(priorityFromApi('baixa')).toBe(Priority.BAIXA);
    expect(priorityFromApi(priorityToApi(Priority.MEDIA))).toBe(Priority.MEDIA);
  });
});

describe('format', () => {
  it('formata tamanho de arquivo', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
  it('slug remove acento e normaliza', () => {
    expect(slugify('Correção')).toBe('correcao');
    expect(slugify('Portal ITS')).toBe('portal-its');
    expect(slugify('  Refatoração  ')).toBe('refatoracao');
  });
});

describe('datas civis no fuso', () => {
  it('civilTodayISO respeita o fuso', () => {
    // 2026-01-01T02:00:00Z é 2025-12-31 em America/Sao_Paulo (UTC-3)
    const iso = civilTodayISO('America/Sao_Paulo', new Date('2026-01-01T02:00:00Z'));
    expect(iso).toBe('2025-12-31');
  });
  it('civilDateAsUtc é meia-noite UTC da data', () => {
    expect(civilDateAsUtc('2026-08-03').toISOString()).toBe('2026-08-03T00:00:00.000Z');
  });
});

describe('níveis de acesso', () => {
  it('rank e predicados', () => {
    expect(rankOf('dev')).toBe(1);
    expect(rankOf('ceo')).toBe(3);
    expect(seesAll('dev')).toBe(false);
    expect(seesAll('gestor')).toBe(true);
    expect(isExec('gestor')).toBe(false);
    expect(isExec('ceo')).toBe(true);
    expect(canPlan('dev')).toBe(false);
    expect(canPlan('gestor')).toBe(true);
  });
  it('mapeamento enum<->api', () => {
    expect(LEVEL_TO_API.CEO).toBe('ceo');
    expect(API_TO_LEVEL.gestor).toBe('GESTOR');
  });
});
