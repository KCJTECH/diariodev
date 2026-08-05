import { test, expect, type Page } from '@playwright/test';

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

test('login com e-mail não cadastrado mostra erro', async ({ page }) => {
  await page.goto('/login.dc.html');
  await waitDV(page);
  await page.getByPlaceholder('seu@itscs.com.br').fill('naoexiste@itscs.com.br');
  await page.getByPlaceholder('••••••••').fill('qualquer');
  await page.getByText('Entrar', { exact: true }).click();
  await expect(page.getByText(/não encontrado/i)).toBeVisible({ timeout: 5_000 });
  await expect(page).toHaveURL(/login\.dc\.html/);
});

test('pesquisa não vaza atividades de outro usuário para o dev', async ({ page }) => {
  // "timeout" está no título de uma atividade do julio.
  await loginAs(page, 'Elaine Ribeiro');
  await page.goto('/pesquisa.dc.html?q=timeout');
  await waitDV(page);
  await expect(page.getByText('Corrigido timeout')).toHaveCount(0);
});

test('pesquisa encontra a atividade da equipe para o ceo', async ({ page }) => {
  await loginAs(page, 'Marcelo Andrade');
  await page.goto('/pesquisa.dc.html?q=timeout');
  await waitDV(page);
  await expect(page.getByText('Corrigido timeout').first()).toBeVisible({ timeout: 8_000 });
});
