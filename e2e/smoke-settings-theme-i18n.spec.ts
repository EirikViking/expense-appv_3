import { expect, test } from '@playwright/test';
import { installMockApi } from './helpers/mockApi';

test('settings: language and theme toggles persist', async ({ page }) => {
  await installMockApi(page);

  await page.addInitScript(() => {
    if (!localStorage.getItem('expense_language')) {
      localStorage.setItem('expense_language', 'en');
    }
    if (!localStorage.getItem('expense_theme_mode')) {
      localStorage.setItem('expense_theme_mode', 'day');
    }
    localStorage.removeItem('expense_api_url');
  });

  await page.goto('/settings');

  await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible();

  await page.getByRole('main').getByRole('button', { name: 'NO' }).click();
  await expect(page.getByRole('heading', { name: /innstillinger/i })).toBeVisible();
  await expect.poll(async () => page.evaluate(() => localStorage.getItem('expense_language'))).toBe('nb');

  const beforeTheme = await page.evaluate(() => document.documentElement.dataset.theme || '');
  await page.getByRole('button', { name: /toggle theme|bytt tema/i }).first().click();
  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.theme || '')).not.toBe(beforeTheme);

  const nextTheme = await page.evaluate(() => document.documentElement.dataset.theme || '');
  await page.reload();
  await expect(page.getByRole('heading', { name: /innstillinger/i })).toBeVisible();
  await expect.poll(async () => page.evaluate(() => localStorage.getItem('expense_language'))).toBe('nb');
  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.theme || '')).toBe(nextTheme);
});
