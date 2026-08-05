import { test, expect, type Page } from '@playwright/test';

async function waitDV(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const dv = (window as unknown as { DV?: { isReady(): boolean } }).DV;
    return !!dv && dv.isReady();
  }, null, { timeout: 15_000 });
}
// Login real por e-mail e senha (a tela não expõe mais a lista de colaboradores).
async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto('/');
  await waitDV(page);
  await page.getByPlaceholder('seu@itscs.com.br').fill(email);
  await page.getByPlaceholder('••••••••').fill('DiarioDev@2026');
  await page.getByText('Entrar', { exact: true }).click();
  await page.waitForURL('**/dashboard.dc.html', { timeout: 15_000 });
  await waitDV(page);
}

test('login inválido mostra erro e não expõe a lista de colaboradores', async ({ page }) => {
  await page.goto('/');
  await waitDV(page);
  // a tela não deve listar usuários cadastrados antes de autenticar
  await expect(page.getByText(/entre como/i)).toHaveCount(0);
  await expect(page.getByText('Marcelo Andrade')).toHaveCount(0);

  await page.getByPlaceholder('seu@itscs.com.br').fill('naoexiste@itscs.com.br');
  await page.getByPlaceholder('••••••••').fill('qualquer');
  await page.getByText('Entrar', { exact: true }).click();
  await expect(page.getByText(/inválidos/i)).toBeVisible({ timeout: 8_000 });
  await expect(page).toHaveURL(/login\.dc\.html/);
});

test('senha errada de usuário existente é recusada', async ({ page }) => {
  await page.goto('/');
  await waitDV(page);
  await page.getByPlaceholder('seu@itscs.com.br').fill('marcelo@itscs.com.br');
  await page.getByPlaceholder('••••••••').fill('senha-errada');
  await page.getByText('Entrar', { exact: true }).click();
  await expect(page.getByText(/inválidos/i)).toBeVisible({ timeout: 8_000 });
  await expect(page).toHaveURL(/login\.dc\.html/);
});

test('pesquisa não vaza atividades de outro usuário para o dev', async ({ page }) => {
  // "timeout" está no título de uma atividade do julio.
  await loginAs(page, 'elaine@itscs.com.br');
  await page.goto('/pesquisa.dc.html?q=timeout');
  await waitDV(page);
  await expect(page.getByText('Corrigido timeout')).toHaveCount(0);
});

test('pesquisa encontra a atividade da equipe para o ceo', async ({ page }) => {
  await loginAs(page, 'marcelo@itscs.com.br');
  await page.goto('/pesquisa.dc.html?q=timeout');
  await waitDV(page);
  await expect(page.getByText('Corrigido timeout').first()).toBeVisible({ timeout: 8_000 });
});
