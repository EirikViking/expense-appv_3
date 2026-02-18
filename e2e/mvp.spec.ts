import { expect, test, type Page } from '@playwright/test';

const E2E_EMAIL = process.env.E2E_EMAIL;
const E2E_PASSWORD = process.env.E2E_PASSWORD;

async function login(page: Page) {
  await page.goto('/login');

  const emailField = page.locator('input[type="email"], input[name="email"]').first();
  const passwordField = page.locator('input[type="password"], input[name="password"]').first();

  await expect(emailField).toBeVisible();
  await expect(passwordField).toBeVisible();

  await emailField.fill(E2E_EMAIL!);
  await passwordField.fill(E2E_PASSWORD!);

  await page
    .getByRole('button', { name: /sign in|logg inn/i })
    .first()
    .click();

  await expect(page).not.toHaveURL(/\/login$/);
}

test.describe('MVP critical flows (session-cookie auth)', () => {
  test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Set E2E_EMAIL and E2E_PASSWORD to run smoke tests');

  test('login persists session after reload', async ({ page }) => {
    await login(page);
    await page.reload();
    await expect(page).not.toHaveURL(/\/login$/);
  });

  test('authenticated user can open core pages without redirect loops', async ({ page }) => {
    await login(page);

    const routes = ['/', '/transactions', '/upload', '/insights', '/budgets', '/settings'];
    for (const route of routes) {
      await page.goto(route);
      await expect(page).not.toHaveURL(/\/login$/);
      await expect(page).not.toHaveURL(/\/bootstrap$/);
    }
  });
});
