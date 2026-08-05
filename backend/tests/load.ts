// Teste de carga básico (§28). Mede latência (p50/p95/max) e throughput de
// endpoints de leitura sob concorrência. Não altera dados. Números reais.
const BASE = process.env.LOAD_BASE || 'http://127.0.0.1:3333';
const API = `${BASE}/api/v1`;
const ORIGIN = 'http://localhost:8080';

async function devLogin(pk: string): Promise<string> {
  const r = await fetch(`${API}/auth/dev-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify({ publicKey: pk }),
  });
  if (!r.ok) throw new Error(`dev-login ${r.status}`);
  return r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}
const pct = (arr: number[], p: number): number => arr.slice().sort((a, b) => a - b)[Math.floor(arr.length * p)] ?? 0;

async function measure(name: string, path: string, cookie: string, N: number, concurrency: number): Promise<void> {
  const lat: number[] = [];
  let issued = 0;
  const worker = async (): Promise<void> => {
    while (issued < N) {
      issued++;
      const t = performance.now();
      const r = await fetch(`${API}${path}`, { headers: { Cookie: cookie } });
      await r.arrayBuffer();
      if (!r.ok) throw new Error(`${path} ${r.status}`);
      lat.push(performance.now() - t);
    }
  };
  const start = performance.now();
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const secs = (performance.now() - start) / 1000;
  console.log(
    `${name.padEnd(22)} N=${lat.length} conc=${concurrency} | p50=${pct(lat, 0.5).toFixed(1)}ms p95=${pct(lat, 0.95).toFixed(1)}ms max=${Math.max(...lat).toFixed(1)}ms | ${(lat.length / secs).toFixed(0)} req/s`,
  );
}

async function main(): Promise<void> {
  const cookie = await devLogin('marcelo');
  console.log(`Ambiente: ${BASE} | Node ${process.version}`);
  // aquecimento
  await measure('warmup', '/bootstrap', cookie, 20, 5);
  await measure('GET /bootstrap', '/bootstrap', cookie, 200, 20);
  await measure('GET /activities', '/activities?perPage=200', cookie, 300, 20);
  await measure('GET /reports/summary', '/reports/summary', cookie, 200, 20);
}
main().catch((e) => { console.error(e); process.exit(1); });
