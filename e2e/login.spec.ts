import { test, expect } from '@playwright/test';

test('login screen renders', async ({ page }) => {
  await page.goto('/login');

  await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible();
  await expect(page.locator('input[type="password"], input[name="password"]').first()).toBeVisible();

  const signInButton = page.getByRole('button', { name: /sign in|logg inn/i }).first();
  const createAdminButton = page.getByRole('button', { name: /create admin account|opprett admin-konto/i }).first();

  const signInVisible = await signInButton.isVisible().catch(() => false);
  const createAdminVisible = await createAdminButton.isVisible().catch(() => false);

  expect(signInVisible || createAdminVisible).toBe(true);
});
