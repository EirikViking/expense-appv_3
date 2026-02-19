import { expect, request as playwrightRequest, test } from '@playwright/test';

type AuthMeResponse = {
  authenticated?: boolean;
  bootstrap_required?: boolean;
};

type AppUser = { id: string; email: string; name: string };

function uniqueToken(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

async function expectOk(res: any, label: string) {
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
    data: { email: adminEmail, password: adminPassword, remember_me: true },
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
    await expectOk(bootstrapRes, 'auth/bootstrap');
    return;
  }

  const text = typeof loginBody === 'object' ? JSON.stringify(loginBody) : String(loginBody);
  throw new Error(
    `Unable to establish admin session. login status=${loginRes.status()} body=${text}. ` +
      'Set E2E_REAL_EMAIL/E2E_REAL_PASSWORD to valid admin credentials.'
  );
}

test('real db scope + impersonation: users are isolated and admin can impersonate', async ({ request }) => {
  const adminEmail = process.env.E2E_REAL_EMAIL || 'ci-admin@example.com';
  const adminPassword = process.env.E2E_REAL_PASSWORD || 'ChangeMe123!';
  const adminName = process.env.E2E_REAL_NAME || 'CI Admin';

  await ensureAdminSession(request, adminEmail, adminPassword, adminName);
  const meRes = await request.get('/api/auth/me');
  await expectOk(meRes, 'auth/me');
  const me = (await meRes.json()) as AuthMeResponse;
  expect(me.authenticated).toBe(true);

  const userEmail = `scope_${Date.now()}@example.com`;
  const userName = 'Scope User';
  const userPassword = 'ScopePass123!';
  const createUserRes = await request.post('/api/admin/users', {
    data: { email: userEmail, name: userName, role: 'user' },
  });
  await expectOk(createUserRes, 'admin create user');
  const createUserBody = (await createUserRes.json()) as { user: AppUser; invite_token: string };
  const createdUserId = createUserBody.user.id;

  // Set password using an isolated request context so admin session cookie is untouched.
  const inviteCtx = await playwrightRequest.newContext({ baseURL: 'http://localhost:5199' });
  const setPasswordRes = await inviteCtx.post('/api/auth/set-password', {
    data: { token: createUserBody.invite_token, password: userPassword },
  });
  await expectOk(setPasswordRes, 'set password');
  await inviteCtx.dispose();

  const userCtx = await playwrightRequest.newContext({ baseURL: 'http://localhost:5199' });
  const userLoginRes = await userCtx.post('/api/auth/login', {
    data: { email: userEmail, password: userPassword, remember_me: true },
  });
  await expectOk(userLoginRes, 'user login');

  const adminTxToken = uniqueToken('E2E_ADMIN_SCOPE_TX');
  const userTxToken = uniqueToken('E2E_USER_SCOPE_TX');
  const txDate = new Date().toISOString().slice(0, 10);

  const adminTxRes = await request.post('/api/transactions', {
    data: { date: txDate, amount: -311, description: adminTxToken, notes: 'e2e-real-scope-admin' },
  });
  await expectOk(adminTxRes, 'admin create tx');

  const userTxRes = await userCtx.post('/api/transactions', {
    data: { date: txDate, amount: -499, description: userTxToken, notes: 'e2e-real-scope-user' },
  });
  await expectOk(userTxRes, 'user create tx');

  const userListRes = await userCtx.get(`/api/transactions?search=${encodeURIComponent(userTxToken)}`);
  await expectOk(userListRes, 'user list own tx');
  const userList = (await userListRes.json()) as { transactions: Array<{ description: string }> };
  expect(userList.transactions.some((tx) => tx.description.includes(userTxToken))).toBe(true);

  const userLeakRes = await userCtx.get(`/api/transactions?search=${encodeURIComponent(adminTxToken)}`);
  await expectOk(userLeakRes, 'user list admin tx');
  const userLeakList = (await userLeakRes.json()) as { transactions: Array<{ description: string }> };
  expect(userLeakList.transactions.some((tx) => tx.description.includes(adminTxToken))).toBe(false);

  const impersonateRes = await request.post(`/api/admin/users/${createdUserId}/impersonate`);
  await expectOk(impersonateRes, 'admin impersonate user');

  const adminAsUserRes = await request.get(`/api/transactions?search=${encodeURIComponent(userTxToken)}`);
  await expectOk(adminAsUserRes, 'admin sees impersonated tx');
  const adminAsUserList = (await adminAsUserRes.json()) as { transactions: Array<{ description: string }> };
  expect(adminAsUserList.transactions.some((tx) => tx.description.includes(userTxToken))).toBe(true);

  const clearImpersonationRes = await request.post('/api/admin/impersonation/clear');
  await expectOk(clearImpersonationRes, 'clear impersonation');

  const adminSelfRes = await request.get(`/api/transactions?search=${encodeURIComponent(adminTxToken)}`);
  await expectOk(adminSelfRes, 'admin sees own tx');
  const adminSelfList = (await adminSelfRes.json()) as { transactions: Array<{ description: string }> };
  expect(adminSelfList.transactions.some((tx) => tx.description.includes(adminTxToken))).toBe(true);

  await userCtx.dispose();
});
