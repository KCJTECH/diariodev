// Prepara o banco de teste em um schema separado (diariodev_test), derivando a
// URL da conexão real sem imprimir a senha. Roda migrations e seed nesse schema.
import { spawnSync } from 'node:child_process';

process.loadEnvFile();
const base = process.env.DATABASE_URL;
if (!base) throw new Error('DATABASE_URL ausente');
// Banco de teste dedicado (o app tem CREATEDB); schema public. Senha preservada.
const u = new URL(base);
u.pathname = '/diariodev_test';
u.searchParams.set('schema', 'public');
const testUrl = u.toString();

const env = { ...process.env, DATABASE_URL: testUrl };
function run(cmd: string, args: string[]): void {
  const r = spawnSync(cmd, args, { env, stdio: 'inherit', shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
run('npx', ['prisma', 'migrate', 'deploy']);
run('npx', ['tsx', 'tests/truncate.ts']); // estado limpo a cada reset
run('npx', ['tsx', 'prisma/seed.ts']);
console.log('OK: banco diariodev_test migrado, limpo e populado');
