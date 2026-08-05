import { test, expect, type Page } from '@playwright/test';

// Regressão visual (§29.6). Baseline capturado do frontend preservado.
// Escolhemos regiões estáveis (sem datas do servidor) para snapshots determinísticos:
// a tela de login e a sidebar. Full-page de telas com data exigiria congelar o serverNow.

async function waitDV(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const dv = (window as unknown as { DV?: { isReady(): boolean } }).DV;
    return !!dv && dv.isReady();
  }, null, { timeout: 15_000 });
}
async function loginAs(page: Page, fullName: string): Promise<void> {
  await page.goto('/login.dc.html');
  await page.getByText(fullName, { exact: true }).first().click();
  await page.waitForURL('**/dashboard.dc.html', { timeout: 15_000 });
  await waitDV(page);
}

test('visual: tela de login', async ({ page }) => {
  await page.goto('/login.dc.html');
  await waitDV(page);
  await page.getByText('Marcelo Andrade', { exact: true }).first().waitFor();
  await expect(page).toHaveScreenshot('login.png', { fullPage: true, maxDiffPixelRatio: 0.02 });
});

test('visual: sidebar (estrutura e navegação)', async ({ page }) => {
  await loginAs(page, 'Marcelo Andrade');
  const sidebar = page.getByRole('complementary').first();
  await sidebar.waitFor();
  await expect(sidebar).toHaveScreenshot('sidebar.png', { maxDiffPixelRatio: 0.02 });
});
