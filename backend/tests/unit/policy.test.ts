// Matriz completa das regras relacionais de autorização. A integração só
// amostra alguns pares; é aqui que se pega troca de < por <= e inversão entre
// ator e alvo, que são os dois erros que reabrem o escalonamento.
import { describe, it, expect } from 'vitest';
import type { AccessLevel } from '@prisma/client';
import {
  assertCanGrantLevel,
  assertCanAdministerLevel,
  assertCanManageUser,
  assertCanManageCredentials,
  assertCanAffectLevels,
  type LevelTarget,
} from '../../src/common/auth/policy.js';
import type { ApiLevel, AuthUser } from '../../src/common/auth/types.js';

const NIVEIS: ApiLevel[] = ['dev', 'gestor', 'ceo'];
const ENUM: Record<ApiLevel, AccessLevel> = { dev: 'DEV', gestor: 'GESTOR', ceo: 'CEO' };
const ORDEM: Record<ApiLevel, number> = { dev: 1, gestor: 2, ceo: 3 };

function ator(level: ApiLevel, id = 'ator'): AuthUser {
  return {
    id, publicKey: id, name: 'Ator', roleTitle: 'Cargo', email: `${id}@itscs.com.br`,
    initials: 'AT', color: '#000000', active: true, level, timezone: 'America/Sao_Paulo',
    sessionId: 'sessao',
  };
}
function alvo(level: ApiLevel, id = 'alvo'): LevelTarget {
  return { id, effectiveLevel: ENUM[level] };
}
function proibiu(fn: () => void): boolean {
  try { fn(); return false; } catch { return true; }
}

describe('teto de concessão de nível', () => {
  // 3x3: concede até o próprio nível, nunca acima.
  for (const a of NIVEIS) {
    for (const pedido of NIVEIS) {
      const permitido = ORDEM[pedido] <= ORDEM[a];
      it(`${a} concedendo ${pedido} → ${permitido ? 'permitido' : 'proibido'}`, () => {
        expect(proibiu(() => assertCanGrantLevel(ator(a), pedido))).toBe(!permitido);
      });
    }
  }

  it('o mesmo teto vale para administrar objeto com nível', () => {
    expect(proibiu(() => assertCanAdministerLevel(ator('gestor'), 'ceo'))).toBe(true);
    expect(proibiu(() => assertCanAdministerLevel(ator('gestor'), 'gestor'))).toBe(false);
    expect(proibiu(() => assertCanAdministerLevel(ator('ceo'), 'ceo'))).toBe(false);
  });
});

describe('alvo pessoa: cadastro, ativação e exclusão', () => {
  // 3x3 para terceiro: teto. Com regra estrita, conta CEO nunca seria desativada
  // por ninguém, nem por outro CEO.
  for (const a of NIVEIS) {
    for (const t of NIVEIS) {
      const permitido = ORDEM[t] <= ORDEM[a];
      it(`${a} sobre terceiro ${t} → ${permitido ? 'permitido' : 'proibido'}`, () => {
        expect(proibiu(() => assertCanManageUser(ator(a), alvo(t)))).toBe(!permitido);
      });
    }
  }

  it('gestor continua sem tocar em CEO', () => {
    expect(proibiu(() => assertCanManageUser(ator('gestor'), alvo('ceo')))).toBe(true);
  });

  it('CEO desativa outra conta CEO', () => {
    expect(proibiu(() => assertCanManageUser(ator('ceo'), alvo('ceo', 'outro')))).toBe(false);
  });

  // 3x3 para a própria conta: sempre permitido, senão o CEO não edita o próprio cadastro.
  for (const a of NIVEIS) {
    it(`${a} sobre a própria conta → permitido`, () => {
      expect(proibiu(() => assertCanManageUser(ator(a, 'eu'), alvo(a, 'eu')))).toBe(false);
    });
  }
});

describe('alvo pessoa: credencial', () => {
  // 3x3 para terceiro: mesma regra estrita do cadastro.
  for (const a of NIVEIS) {
    for (const t of NIVEIS) {
      const permitido = ORDEM[a] > ORDEM[t];
      it(`${a} na senha de terceiro ${t} → ${permitido ? 'permitido' : 'proibido'}`, () => {
        expect(proibiu(() => assertCanManageCredentials(ator(a), alvo(t)))).toBe(!permitido);
      });
    }
  }

  // 3x3 para a própria conta: sempre proibido, ao contrário do cadastro.
  for (const a of NIVEIS) {
    it(`${a} na própria senha por esta via → proibido`, () => {
      expect(proibiu(() => assertCanManageCredentials(ator(a, 'eu'), alvo(a, 'eu')))).toBe(true);
    });
  }
});

describe('guarda coletivo de recálculo de nível', () => {
  // Teto, e não regra estrita: sem isso, adicionar alguém a um grupo de nível
  // superior seria permitido e remover seria proibido, e nem o CEO desfaria.
  for (const a of NIVEIS) {
    for (const t of NIVEIS) {
      const permitido = ORDEM[t] <= ORDEM[a];
      it(`${a} afetando membro ${t} → ${permitido ? 'permitido' : 'proibido'}`, () => {
        expect(proibiu(() => assertCanAffectLevels(ator(a), [alvo(t)]))).toBe(!permitido);
      });
    }
  }

  it('recusa o conjunto inteiro quando um único alvo é superior', () => {
    const targets = [alvo('dev', 'a'), alvo('ceo', 'b'), alvo('dev', 'c')];
    expect(proibiu(() => assertCanAffectLevels(ator('gestor'), targets))).toBe(true);
  });

  it('o CEO remove outro CEO do grupo que o elevou', () => {
    expect(proibiu(() => assertCanAffectLevels(ator('ceo'), [alvo('ceo', 'camila')]))).toBe(false);
  });

  it('aceita a própria conta em qualquer nível', () => {
    const targets = [alvo('dev', 'a'), alvo('gestor', 'eu')];
    expect(proibiu(() => assertCanAffectLevels(ator('gestor', 'eu'), targets))).toBe(false);
  });

  it('conjunto vazio não é erro', () => {
    expect(proibiu(() => assertCanAffectLevels(ator('gestor'), []))).toBe(false);
  });
});
