import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import * as XLSX from 'xlsx';

const E2E_PASSWORD = process.env.E2E_PASSWORD;
const API_BASE_URL = 'http://localhost:8788';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

type TestTransaction = {
  date: string;
  description: string;
  amount: number;
  currency?: string;
};

function toDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateOnly(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function parseCurrency(text: string): number {
  const cleaned = text
    .replace(/kr/gi, '')
    .replace(/\u00a0/g, '')
    .replace(/\s/g, '')
    .replace(/\+/g, '')
    .replace(/,/g, '.');
  const num = Number(cleaned);
  if (!Number.isFinite(num)) {
    throw new Error(`Unable to parse currency value: ${text}`);
  }
  return num;
}

function buildXlsxBuffer(rows: TestTransaction[]): Buffer {
  const data = rows.map((row) => ({
    Date: row.date,
    Description: row.description,
    Amount: row.amount,
    Currency: row.currency ?? 'NOK',
  }));
  const sheet = XLSX.utils.json_to_sheet(data, {
    header: ['Date', 'Description', 'Amount', 'Currency'],
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

const now = new Date();
const recentExpenseDate = toDateOnly(now);
const recentIncomeDate = toDateOnly(
  new Date(now.getFullYear(), now.getMonth(), Math.max(1, now.getDate() - 7))
);

const testTransactions: TestTransaction[] = [
  { date: '2026-01-01', description: 'E2E Date 2026-01-01', amount: -100.25 },
  { date: '2026-01-02', description: 'E2E Date 2026-01-02', amount: -200.75 },
  { date: recentExpenseDate, description: 'E2E Recent Expense', amount: -50 },
  { date: recentIncomeDate, description: 'E2E Recent Income', amount: 1200 },
];

const xlsxBuffer = buildXlsxBuffer(testTransactions);

test.describe('MVP critical flows', () => {
  test.skip(!E2E_PASSWORD, 'E2E_PASSWORD not set');
  test.describe.configure({ mode: 'serial' });

  let authToken = '';

  test.beforeAll(async ({ request }) => {
    const loginRes = await request.post(`${API_BASE_URL}/auth/login`, {
      data: { password: E2E_PASSWORD },
    });
    if (!loginRes.ok()) {
      throw new Error(`Login failed with status ${loginRes.status()}`);
    }
    const loginBody = await loginRes.json();
    authToken = loginBody.token;

    if (!authToken) {
      throw new Error('Missing auth token from login response');
    }

    const resetRes = await request.delete(`${API_BASE_URL}/transactions/admin/reset`, {
      data: { confirm: true },
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!resetRes.ok()) {
      throw new Error(`Reset failed with status ${resetRes.status()}`);
    }
  });

  const login = async (page: Page) => {
    await page.goto('/login');
    const passwordInput = page.getByPlaceholder('Password');
    if (await passwordInput.isVisible().catch(() => false)) {
      await passwordInput.fill(E2E_PASSWORD!);
      await page.getByRole('button', { name: /sign in/i }).click();
    }
    await page.goto('/upload');
    await expect(page.getByRole('heading', { name: 'Upload Files' })).toBeVisible();
  };

  const uploadXlsx = async (page: Page, fileName: string) => {
    await page.goto('/upload');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: fileName,
      mimeType: XLSX_MIME,
      buffer: xlsxBuffer,
    });
  };

  const getTotalTransactions = async (request: APIRequestContext) => {
    const res = await request.get(`${API_BASE_URL}/transactions?limit=1`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const body = await res.json();
    return body.total as number;
  };

  test('login persists session', async ({ page }) => {
    await login(page);
    const token = await page.evaluate(() => localStorage.getItem('expense_auth_token'));
    expect(token).toBeTruthy();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Upload Files' })).toBeVisible();
  });

  test('xlsx upload works and duplicate is warned without increasing count', async ({ page, request }) => {
    await login(page);

    const initialTotal = await getTotalTransactions(request);

    await uploadXlsx(page, 'e2e-upload.xlsx');
    const successCard = page.locator('div').filter({ hasText: 'e2e-upload.xlsx' }).filter({ hasText: 'transactions inserted' }).first();
    await expect(successCard).toBeVisible();

    const insertedText = await successCard.locator('span.text-green-600.font-medium').first().textContent();
    const insertedCount = Number(insertedText);
    expect(insertedCount).toBe(testTransactions.length);

    const afterUploadTotal = await getTotalTransactions(request);
    expect(afterUploadTotal).toBe(initialTotal + testTransactions.length);

    await uploadXlsx(page, 'e2e-upload-duplicate.xlsx');
    const duplicateCard = page.locator('div').filter({ hasText: 'e2e-upload-duplicate.xlsx' }).filter({ hasText: 'File already uploaded' }).first();
    await expect(duplicateCard).toBeVisible();

    const afterDuplicateTotal = await getTotalTransactions(request);
    expect(afterDuplicateTotal).toBe(afterUploadTotal);
  });

  test('xlsx dates stay correct and modal closes with X', async ({ page }) => {
    await login(page);
    await page.goto('/transactions');

    const search = page.getByPlaceholder('Search transactions...');
    await search.fill('E2E Date 2026-01-01');
    await expect(page.getByText('E2E Date 2026-01-01')).toBeVisible();
    await page.getByText('E2E Date 2026-01-01').first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('01.01.2026')).toBeVisible();
    await dialog.getByLabel('Close').click();
    await expect(dialog).toBeHidden();

    await search.fill('E2E Date 2026-01-02');
    await expect(page.getByText('E2E Date 2026-01-02')).toBeVisible();
    await page.getByText('E2E Date 2026-01-02').first().click();
    await expect(page.getByRole('dialog').getByText('02.01.2026')).toBeVisible();
    await page.getByRole('dialog').getByLabel('Close').click();
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('add transaction succeeds', async ({ page }) => {
    await login(page);
    await page.goto('/transactions');

    await page.getByRole('button', { name: 'Add Transaction' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[type="date"]').fill(recentExpenseDate);
    await dialog.locator('input[type="number"]').fill('75');
    await dialog.locator('input[type="text"]').first().fill('E2E Manual Transaction');
    await dialog.getByRole('button', { name: 'Save Transaction' }).click();
    await expect(dialog).toBeHidden();

    const search = page.getByPlaceholder('Search transactions...');
    await search.fill('E2E Manual Transaction');
    await expect(page.getByText('E2E Manual Transaction')).toBeVisible();
  });

  test('insights 3 months totals are sane', async ({ page }) => {
    await login(page);
    await page.goto('/insights');

    await page.getByRole('button', { name: '3 Months' }).click();

    const rangeStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    let expectedIncome = 0;
    let expectedExpenses = 0;
    let expectedNet = 0;

    for (const tx of testTransactions) {
      const txDate = parseDateOnly(tx.date);
      if (txDate >= rangeStart && txDate <= rangeEnd) {
        if (tx.amount > 0) expectedIncome += tx.amount;
        if (tx.amount < 0) expectedExpenses += Math.abs(tx.amount);
        expectedNet += tx.amount;
      }
    }

    const incomeValue = await page.getByText('Total Income', { exact: true }).locator('..').locator('p').nth(1).textContent();
    const expensesValue = await page.getByText('Total Expenses', { exact: true }).locator('..').locator('p').nth(1).textContent();
    const netValue = await page.getByText('Net Savings', { exact: true }).locator('..').locator('p').nth(1).textContent();

    expect(incomeValue).toBeTruthy();
    expect(expensesValue).toBeTruthy();
    expect(netValue).toBeTruthy();

    expect(parseCurrency(incomeValue!)).toBeCloseTo(expectedIncome, 2);
    expect(parseCurrency(expensesValue!)).toBeCloseTo(expectedExpenses, 2);
    expect(parseCurrency(netValue!)).toBeCloseTo(expectedNet, 2);
  });

  test('categories and rules validation, apply all rules resets state', async ({ page }) => {
    await login(page);

    await page.goto('/categories');
    await page.getByRole('button', { name: 'New Category' }).click();
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('Name is required')).toBeVisible();
    await page.getByPlaceholder('Category name').fill('E2E Category');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('E2E Category')).toBeVisible();

    await page.goto('/rules');
    await page.getByRole('button', { name: 'New Rule' }).click();
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('Name is required')).toBeVisible();
    await expect(page.getByText('Pattern is required')).toBeVisible();
    await expect(page.getByText('Select a category')).toBeVisible();

    await page.getByPlaceholder('e.g., Netflix Subscription').fill('E2E Rule');
    await page.getByPlaceholder('e.g., NETFLIX').fill('E2E');
    await page.getByText('Value').locator('..').locator('select').selectOption({ label: 'E2E Category' });
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('E2E Rule')).toBeVisible();

    const applyButton = page.getByRole('button', { name: 'Apply All Rules' });
    await applyButton.click();
    await expect(page.getByText(/Rules applied at/)).toBeVisible();
    await expect(applyButton).toBeEnabled();

    await page.goto('/transactions');
    await page.goto('/rules');
    await expect(page.getByText(/Rules applied at/)).toHaveCount(0);
  });
});
