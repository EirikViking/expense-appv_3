import { expect, test } from '@playwright/test';
import { installMockApi } from './helpers/mockApi';

test('transactions: merchant drilldown URL applies merchant filter', async ({ page }) => {
  await installMockApi(page, ({ path, method, url }) => {
    if (method === 'GET' && path === '/transactions') {
      const merchantName = (url.searchParams.get('merchant_name') || '').trim();
      const dateFrom = (url.searchParams.get('date_from') || '').trim();
      const dateTo = (url.searchParams.get('date_to') || '').trim();
      const flowType = (url.searchParams.get('flow_type') || '').trim();

      const validDrilldown =
        merchantName.toLowerCase() === 'kiwi' &&
        dateFrom === '2026-01-01' &&
        dateTo === '2026-02-18' &&
        flowType === 'expense';

      const transactions = validDrilldown
        ? [
            {
              id: 'tx_kiwi_1',
              tx_date: '2026-02-17',
              amount: -245.5,
              description: 'KIWI purchase',
              status: 'booked',
              merchant_name: 'KIWI',
              merchant_raw: 'KIWI #123',
              category_name: 'Groceries',
              category_color: '#22c55e',
              is_transfer: false,
              is_excluded: false,
              tags: [],
            },
          ]
        : [];

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
      return { body: { total: 1 } };
    }

    return undefined;
  });

  await page.addInitScript(() => {
    localStorage.setItem('expense_language', 'en');
    localStorage.removeItem('expense_api_url');
  });

  await page.goto('/transactions?date_from=2026-01-01&date_to=2026-02-18&merchant_name=KIWI&flow_type=expense');

  await expect(page.getByRole('heading', { name: /transactions/i })).toBeVisible();
  await page.getByRole('button', { name: /filters/i }).click();
  await expect(page.locator('input[placeholder="e.g. KIWI"], input[placeholder="f.eks. KIWI"]')).toHaveValue('KIWI');
  await expect(page.getByText('KIWI purchase')).toBeVisible();
  await expect(page).toHaveURL(/merchant_name=KIWI/);
});
