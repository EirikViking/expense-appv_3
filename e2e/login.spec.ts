import { test, expect } from '@playwright/test';

test('login screen renders', async ({ page }) => {
  await page.goto('/login');

  await expect(
    page.getByRole('heading', { name: 'Personal Expense Analytics' })
  ).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});
