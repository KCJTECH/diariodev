// Filtro de projeto por integração: um webhook pode ser restrito a projetos
// específicos (ex.: disparar só para atividades do projeto de RH).
import { describe, it, expect } from 'vitest';
import { atendeProjeto } from '../../src/modules/integrations/webhook/dispatch.js';
import { renderResetBody, RESET_BODY_DEFAULT } from '../../src/common/mail/reset-template.js';
import { secureForPort } from '../../src/common/mail/mailer.js';

const RH = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TI = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('filtro de projeto na integração', () => {
  it('sem projeto escolhido, dispara para qualquer projeto', () => {
    expect(atendeProjeto([], RH)).toBe(true);
    expect(atendeProjeto([], TI)).toBe(true);
  });

  it('com projeto escolhido, dispara só para ele', () => {
    expect(atendeProjeto([RH], RH)).toBe(true);
    expect(atendeProjeto([RH], TI)).toBe(false);
  });

  it('aceita mais de um projeto', () => {
    expect(atendeProjeto([RH, TI], TI)).toBe(true);
    expect(atendeProjeto([RH, TI], 'cccccccc-cccc-cccc-cccc-cccccccccccc')).toBe(false);
  });

  it('evento sem projeto no escopo passa, mesmo com filtro (resumo diário)', () => {
    // Restringir por projeto um evento da organização silenciaria a integração
    // sem nada explicar na tela.
    expect(atendeProjeto([RH], undefined)).toBe(true);
  });
});

describe('texto do e-mail de redefinição', () => {
  it('substitui usuário, link e minutos', () => {
    const texto = renderResetBody(null, { usuario: 'Maria', link: 'https://x/#reset=T', minutos: 60 });
    expect(texto).toContain('Olá, Maria.');
    expect(texto).toContain('https://x/#reset=T');
    expect(texto).toContain('60 minutos');
    expect(texto).not.toContain('{USUARIO}');
    expect(texto).not.toContain('{LINK}');
    expect(texto).not.toContain('{MINUTOS}');
  });

  it('usa o texto configurado quando existe', () => {
    const texto = renderResetBody('Oi {USUARIO}: {LINK}', { usuario: 'João', link: 'L', minutos: 30 });
    expect(texto).toBe('Oi João: L');
  });

  it('cai no padrão quando o texto salvo está vazio', () => {
    expect(renderResetBody('   ', { usuario: 'A', link: 'B', minutos: 1 })).toBe(
      RESET_BODY_DEFAULT.replace('{USUARIO}', 'A').replace('{LINK}', 'B').replace('{MINUTOS}', '1'),
    );
  });

  it('repete o link se aparecer mais de uma vez', () => {
    expect(renderResetBody('{LINK} e {LINK}', { usuario: 'A', link: 'X', minutos: 1 })).toBe('X e X');
  });
});

describe('criptografia da conexão de e-mail deduzida da porta', () => {
  it('465 usa TLS direto; as outras usam STARTTLS', () => {
    expect(secureForPort(465)).toBe(true);
    expect(secureForPort(587)).toBe(false);
    expect(secureForPort(25)).toBe(false);
    expect(secureForPort(2525)).toBe(false);
  });
});
