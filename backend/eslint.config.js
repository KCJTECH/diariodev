// Configuração do ESLint 9 (formato flat). O projeto tinha o script `lint` e as
// dependências, mas nunca teve arquivo de configuração: `npm run lint` falhava
// com exit 2 em qualquer checkout, e §37.6 exige lint executado.
//
// Escolha deliberada: regras recomendadas sem checagem de tipo. As regras
// type-checked acusariam centenas de pontos em código que já funciona,
// principalmente onde o Prisma exige `as never` e onde o SQL cru devolve
// `unknown`. Isso viraria refatoração ampla, contra a regra de tocar só o
// necessário. O `npm run typecheck` já cobre o que importa em tipagem.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'prisma/migrations/**', 'coverage/**', 'playwright-report/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        AbortSignal: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        Buffer: 'readonly',
        NodeJS: 'readonly',
      },
    },
    rules: {
      // §11.3: `any` só com justificativa registrada. Fica como aviso para não
      // travar o build, mas aparece no relatório.
      '@typescript-eslint/no-explicit-any': 'warn',
      // O código usa `catch {}` deliberadamente em pontos onde a falha não deve
      // interromper o fluxo (cache local, limpeza de contador). Cada um tem
      // comentário explicando; a regra de bloco vazio ignora catch.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Erros de verdade que valem barrar: variável não usada indica código morto
      // ou refatoração incompleta. Argumento prefixado com _ é intencional.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Testes usam `any` para navegar payload de resposta sem recriar os tipos do
    // domínio, e isso é aceitável: o valor do teste está na asserção.
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
