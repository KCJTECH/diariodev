import { defineConfig, devices } from '@playwright/test';

// Sobe um servidor de teste na porta 3400 apontando para o banco dedicado
// diariodev_test. A URL é derivada da conexão real sem imprimir a senha.
process.loadEnvFile();
const base = process.env.DATABASE_URL;
if (!base) throw new Error('DATABASE_URL ausente');
const u = new URL(base);
u.pathname = '/diariodev_test';
u.searchParams.set('schema', 'public');
const testDbUrl = u.toString();

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:3400', trace: 'retain-on-failure' },
  webServer: {
    command: 'npx tsx src/server.ts',
    port: 3400,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { ...process.env, DATABASE_URL: testDbUrl, PORT: '3400', NODE_ENV: 'test', LOG_LEVEL: 'warn' },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
