import { test, expect } from '@playwright/test';

test('login screen renders', async ({ page }) => {
  await page.goto('/login');

  await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible();
  await expect(page.locator('input[type="password"], input[name="password"]').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /sign in|logg inn/i }).first()).toBeVisible();
});
