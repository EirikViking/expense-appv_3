import { expect, test } from '@playwright/test';

type AuthMeResponse = {
  authenticated?: boolean;
  bootstrap_required?: boolean;
};

function uniqueToken(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

async function expectOkJson(res: any, label: string) {
  if (!res.ok()) {
    const txt = await res.text();
    throw new Error(`${label} failed: ${res.status()} ${txt}`);
  }
}

async function ensureAdminSession(
  request: any,
  adminEmail: string,
  adminPassword: string,
  adminName: string
) {
  const loginRes = await request.post('/api/auth/login', {
    data: {
      email: adminEmail,
      password: adminPassword,
      remember_me: true,
    },
  });

  if (loginRes.ok()) return;

  const loginBody = await loginRes.json().catch(() => ({}));
  if (loginRes.status() === 400 && loginBody?.bootstrap_required) {
    const bootstrapRes = await request.post('/api/auth/bootstrap', {
      data: {
        email: adminEmail,
        name: adminName,
        password: adminPassword,
      },
    });
    await expectOkJson(bootstrapRes, 'auth/bootstrap');
    return;
  }

  const text = typeof loginBody === 'object' ? JSON.stringify(loginBody) : String(loginBody);
  throw new Error(
    `Unable to establish admin session. login status=${loginRes.status()} body=${text}. ` +
      'Set E2E_REAL_EMAIL/E2E_REAL_PASSWORD to valid admin credentials.'
  );
}

async function dismissOnboardingIfPresent(page: any) {
  const skipButton = page.getByRole('button', { name: /hopp over|skip/i }).first();
  if (await skipButton.isVisible({ timeout: 5000 }).catch(() => false)) {
    await skipButton.click();
    return;
  }
  const closeButton = page.getByRole('button', { name: /close|lukk/i }).first();
  if (await closeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    await closeButton.click();
    return;
  }
  await page.keyboard.press('Escape').catch(() => {});
}

test('real seeded flow: login -> dashboard -> transactions filter/edit -> settings toggle', async ({ page, request }) => {
  const adminEmail = process.env.E2E_REAL_EMAIL || 'ci-admin@example.com';
  const adminPassword = process.env.E2E_REAL_PASSWORD || 'ChangeMe123!';
  const adminName = process.env.E2E_REAL_NAME || 'CI Admin';

  await ensureAdminSession(request, adminEmail, adminPassword, adminName);
  const meRes = await request.get('/api/auth/me');
  await expectOkJson(meRes, 'auth/me');
  const me = (await meRes.json()) as AuthMeResponse;
  expect(me.authenticated).toBe(true);

  const txToken = uniqueToken('E2E_REAL_TX');
  const txDate = new Date().toISOString().slice(0, 10);
  const createTxRes = await request.post('/api/transactions', {
    data: {
      date: txDate,
      amount: -733.25,
      description: txToken,
      notes: 'e2e-real-journey',
    },
  });
  await expectOkJson(createTxRes, 'create transaction');

  await page.goto('/login');
  await page.locator('input[type="email"], input[name="email"]').first().fill(adminEmail);
  await page.locator('input[type="password"], input[name="password"]').first().fill(adminPassword);
  await page.getByRole('button', { name: /sign in|logg inn/i }).first().click();

  await expect(page).not.toHaveURL(/\/login$/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await dismissOnboardingIfPresent(page);

  await page.goto(`/transactions?search=${encodeURIComponent(txToken)}`);
  await dismissOnboardingIfPresent(page);
  await expect(page.getByText(txToken)).toBeVisible();

  const editButton = page.locator('button[aria-label^="Edit:"], button[aria-label^="Rediger:"]').first();
  await expect(editButton).toBeVisible();
  await dismissOnboardingIfPresent(page);
  await editButton.click();

  const noteValue = `updated-${Date.now()}`;
  await page.locator('input[placeholder="Add notes..."], input[placeholder="Legg til notat..."]').first().fill(noteValue);
  await page.getByRole('button', { name: /^Save$|^Lagre$/ }).first().click();
  await expect(page.getByText(noteValue)).toBeVisible();

  await page.goto('/settings');
  const budgetToggle = page.locator('input[type="checkbox"]').first();
  await expect(budgetToggle).toBeVisible();
  const before = await budgetToggle.isChecked();
  await budgetToggle.click();
  if (before) {
    await expect(budgetToggle).not.toBeChecked();
  } else {
    await expect(budgetToggle).toBeChecked();
  }
});
