import { test, expect } from '@playwright/test';

const E2E_PASSWORD = process.env.E2E_PASSWORD;

test.describe('dashboard groceries tile', () => {
  test.skip(!E2E_PASSWORD, 'E2E_PASSWORD not set');

  test('shows non-zero groceries spend when groceries transactions exist in selected period', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' });
    const page = await context.newPage();

    // Login
    await page.goto('/login');
    await page.locator('#password').fill(E2E_PASSWORD!);
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(800);

    // Add a groceries transaction (categorized explicitly).
    await page.goto('/transactions');
    await page.getByRole('button', { name: 'Add transaction' }).click();

    // Use today's date so it falls into YTD.
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayIso = `${yyyy}-${mm}-${dd}`;

    await page.getByLabel('Date').fill(todayIso);
    await page.getByLabel('Amount').fill('-100');
    await page.getByLabel('Description').fill('KIWI test');
    await page.locator('select').last().selectOption({ label: 'Groceries' });
    await page.getByRole('button', { name: 'Save transaction' }).click();

    // Dashboard default range is YTD; groceries tile should reflect spend.
    await page.goto('/');
    await expect(page.getByText('Groceries spend', { exact: true })).toBeVisible();
    await expect(page.getByText('100,00 kr')).toBeVisible();

    await context.close();
  });
});

