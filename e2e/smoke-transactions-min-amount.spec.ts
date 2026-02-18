import { expect, test } from '@playwright/test';
import { installMockApi } from './helpers/mockApi';

test('transactions: positive min amount filters expenses correctly', async ({ page }) => {
  await installMockApi(page, ({ path, method, url }) => {
    if (method === 'GET' && path === '/transactions') {
      const minAmount = Number(url.searchParams.get('min_amount') || '0');
      const filtered = Number.isFinite(minAmount) && minAmount >= 500;
      const transactions = filtered
        ? [
            {
              id: 'tx_high',
              tx_date: '2026-02-18',
              amount: -900,
              description: 'Large expense',
              status: 'booked',
              category_name: 'Groceries',
              category_color: '#22c55e',
              is_transfer: false,
              is_excluded: false,
              tags: [],
            },
          ]
        : [
            {
              id: 'tx_low',
              tx_date: '2026-02-18',
              amount: -120,
              description: 'Small expense',
              status: 'booked',
              category_name: 'Groceries',
              category_color: '#22c55e',
              is_transfer: false,
              is_excluded: false,
              tags: [],
            },
            {
              id: 'tx_high',
              tx_date: '2026-02-18',
              amount: -900,
              description: 'Large expense',
              status: 'booked',
              category_name: 'Groceries',
              category_color: '#22c55e',
              is_transfer: false,
              is_excluded: false,
              tags: [],
            },
          ];

      return {
        body: {
          transactions,
          total: transactions.length,
          limit: 50,
          offset: 0,
          has_more: false,
          aggregates: {
            sum_amount: transactions.reduce((sum, tx) => sum + Number(tx.amount), 0),
            total_spent: transactions.reduce((sum, tx) => sum + Math.abs(Number(tx.amount)), 0),
            total_income: 0,
          },
        },
      };
    }

    if (method === 'GET' && path === '/transactions/count') {
      return { body: { total: 2 } };
    }

    return undefined;
  });

  await page.addInitScript(() => {
    localStorage.setItem('expense_language', 'en');
    localStorage.removeItem('expense_api_url');
  });

  await page.goto('/transactions');
  await expect(page.getByRole('heading', { name: /transactions/i })).toBeVisible();

  await page.getByRole('button', { name: /filters/i }).click();
  await page.locator('input[placeholder="500"]').first().fill('500');

  await expect(page.getByText('Large expense')).toBeVisible();
  await expect(page.getByText('Small expense')).toHaveCount(0);
  await expect(page).toHaveURL(/min_amount=500/);
});
