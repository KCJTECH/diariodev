import { test, expect, type Page } from '@playwright/test';

// Espera o window.DV estar pronto (as telas fazem polling; o DV publica após o bootstrap).
async function waitDV(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const dv = (window as unknown as { DV?: { isReady(): boolean } }).DV;
    return !!dv && dv.isReady();
  }, null, { timeout: 15_000 });
}

// Login pelo atalho "entrar como" (dev). Navega para o dashboard e espera o DV.
async function loginAs(page: Page, fullName: string): Promise<void> {
  await page.goto('/login.dc.html');
  await page.getByText(fullName, { exact: true }).first().click();
  await page.waitForURL('**/dashboard.dc.html', { timeout: 15_000 });
  await waitDV(page);
}

test('login (ceo) abre o dashboard com os dados reais', async ({ page }) => {
  await loginAs(page, 'Marcelo Andrade');
  await expect(page).toHaveURL(/dashboard\.dc\.html/);
  // nome do usuário na sidebar
  await expect(page.getByText('Marcelo Andrade')).toBeVisible();
});

test('sessão persiste ao recarregar (cookie httpOnly, fonte backend)', async ({ page }) => {
  await loginAs(page, 'Elaine Ribeiro');
  await page.reload();
  await waitDV(page);
  const name = await page.evaluate(() => (window as unknown as { DV: { user(): { name: string } } }).DV.user().name);
  expect(name).toBe('Elaine Ribeiro');
});

test('realtime: atividade criada em um navegador aparece no outro', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();

  await loginAs(a, 'Marcelo Andrade'); // ceo: recebe eventos da equipe
  await a.goto('/atividades.dc.html');
  await waitDV(a);

  await loginAs(b, 'Elaine Ribeiro'); // dev
  await b.goto('/atividades.dc.html');
  await waitDV(b);

  // B (elaine) registra uma atividade pela camada DV (escrita otimista + backend).
  const title = 'E2E realtime ' + Date.now();
  await b.evaluate((ttl) => {
    (window as unknown as { DV: { create(rec: unknown): unknown } }).DV.create({
      proj: 'Portal ITS', cat: 'Entrega', title: ttl, pri: 'alta', d: 0, t: '10:00', dur: '1h',
    });
  }, title);

  // A (Marcelo) recebe via Socket.IO: chega ao cache do DV e à timeline, sem recarregar.
  await a.waitForFunction((ttl) => {
    const dv = (window as unknown as { DV?: { acts(): { title: string }[] } }).DV;
    return !!dv && dv.acts().some((x) => x.title === ttl);
  }, title, { timeout: 12_000 });
  await expect(a.getByText(title)).toBeVisible({ timeout: 8_000 });

  await ctxA.close();
  await ctxB.close();
});

test('logout encerra a sessão e protege rotas autenticadas', async ({ page }) => {
  await loginAs(page, 'Marcelo Andrade');
  await page.evaluate(() => (window as unknown as { DV: { logout(): void } }).DV.logout());
  await page.waitForURL('**/login.dc.html', { timeout: 10_000 });

  // rota protegida sem sessão volta para o login
  await page.goto('/dashboard.dc.html');
  await page.waitForURL('**/login.dc.html', { timeout: 10_000 });
});
