import { test, expect } from '@playwright/test';

const E2E_PASSWORD = process.env.E2E_PASSWORD;

test.describe('i18n smoke', () => {
  test.skip(!E2E_PASSWORD, 'E2E_PASSWORD not set');

  const login = async (page: any) => {
    await page.goto('/login');
    await page.locator('#password').fill(E2E_PASSWORD!);
    await page.locator('button[type="submit"]').click();
    await page.goto('/');
  };

  test('auto-selects Norwegian for nb-NO and shows translated key UI', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'nb-NO' });
    const page = await context.newPage();

    await login(page);

    await expect(page.getByRole('heading', { name: 'Dashbord' })).toBeVisible();
    await expect(page.getByLabel('Ekskluder overføringer')).toBeVisible();
    await expect(page.getByText('Dagligvarer', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Ekskluder overføringer')).toBeChecked();

    await context.close();
  });

  test('auto-selects English for en-US; manual switch persists', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' });
    const page = await context.newPage();

    await login(page);

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByLabel('Exclude transfers')).toBeVisible();
    await expect(page.getByText('Groceries spend', { exact: true })).toBeVisible();

    // Manual switch to Norwegian persists via localStorage.
    await page.getByRole('button', { name: 'NO' }).click();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Dashbord' })).toBeVisible();

    const storedLang = await page.evaluate(() => localStorage.getItem('expense_language'));
    expect(storedLang).toBe('nb');

    await context.close();
  });
});

