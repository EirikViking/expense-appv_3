import { test, expect } from '@playwright/test';

const E2E_PASSWORD = process.env.E2E_PASSWORD;

function toDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

test.describe('transactions merchant totals', () => {
  test.skip(!E2E_PASSWORD, 'E2E_PASSWORD not set');

  test('shows total spent for a merchant in a date range', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' });
    const page = await context.newPage();

    const todayIso = toDateOnly(new Date());
    const merchantToken = `E2E_MERCHANT_TOTAL_${Date.now()}`;

    // Login
    await page.goto('/login');
    await page.locator('#password').fill(E2E_PASSWORD!);
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(800);

    // Add 2 transactions for the same "merchant" token.
    await page.goto('/transactions');

    const addTx = async (amount: string, description: string) => {
      await page.getByRole('button', { name: 'Add transaction' }).click();
      await page.getByLabel('Date').fill(todayIso);
      await page.getByLabel('Amount').fill(amount);
      await page.getByLabel('Description').fill(description);
      await page.getByRole('button', { name: 'Save transaction' }).click();
      await page.waitForTimeout(400);
    };

    await addTx('-50', `${merchantToken} one`);
    await addTx('-70', `${merchantToken} two`);

    // Filter by date range + merchant token.
    await page.getByRole('button', { name: 'Filters' }).click();
    await page.locator('input[type="date"]').nth(0).fill(todayIso);
    await page.locator('input[type="date"]').nth(1).fill(todayIso);
    await page.getByPlaceholder('e.g. KIWI').fill(merchantToken);

    // Total spent should be 120,00 kr (nb-NO formatting).
    const totalLine = page.locator('p', { hasText: 'Total spent (filtered):' });
    await expect(totalLine).toBeVisible();
    await expect(totalLine).toContainText('120,00 kr');

    await context.close();
  });
});

