import type { Page, Route } from '@playwright/test';

type MockJson = Record<string, unknown> | unknown[] | string | number | boolean | null;
type MockResponse = {
  status?: number;
  body?: MockJson;
};

type MockResolver = (ctx: {
  path: string;
  method: string;
  url: URL;
}) => MockResponse | undefined;

function fulfillJson(route: Route, status: number, body: MockJson) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

export async function installMockApi(page: Page, resolve?: MockResolver) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const method = request.method().toUpperCase();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, '') || '/';

    const custom = resolve?.({ path, method, url });
    if (custom) {
      return fulfillJson(route, custom.status ?? 200, custom.body ?? {});
    }

    if (path.startsWith('/auth/me')) {
      return fulfillJson(route, 200, {
        authenticated: true,
        bootstrap_required: false,
        impersonating: false,
        needs_onboarding: false,
        user: {
          id: 'u_e2e',
          email: 'e2e@example.com',
          name: 'E2E User',
          role: 'user',
          active: true,
          onboarding_done_at: '2026-01-01T00:00:00.000Z',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      });
    }

    if (path.startsWith('/auth/logout')) {
      return fulfillJson(route, 200, { success: true });
    }

    if (path === '/categories') {
      return fulfillJson(route, 200, {
        categories: [
          {
            id: 'cat_food_groceries',
            name: 'Groceries',
            icon: 'shopping-cart',
            color: '#22c55e',
            is_transfer: false,
            parent_id: null,
            sort_order: 1,
          },
        ],
      });
    }

    if (path.startsWith('/categories/flat')) {
      return fulfillJson(route, 200, {
        categories: [
          { id: 'cat_food_groceries', name: 'Groceries', color: '#22c55e' },
          { id: 'cat_transport', name: 'Transport', color: '#38bdf8' },
        ],
      });
    }

    if (path.startsWith('/analytics/overview')) {
      return fulfillJson(route, 200, {
        expenses: 21000,
        income: 50000,
        net_spend: -29000,
        total_transactions: 24,
      });
    }

    if (path.startsWith('/analytics/by-category')) {
      return fulfillJson(route, 200, {
        total: 21000,
        categories: [
          {
            category_id: 'cat_food_groceries',
            category_name: 'Groceries',
            color: '#22c55e',
            total: 8000,
            count: 10,
          },
          {
            category_id: 'cat_transport',
            category_name: 'Transport',
            color: '#38bdf8',
            total: 2500,
            count: 6,
          },
        ],
      });
    }

    if (path.startsWith('/analytics/timeseries')) {
      return fulfillJson(route, 200, { series: [] });
    }

    if (path.startsWith('/analytics/anomalies')) {
      return fulfillJson(route, 200, {
        anomalies: [],
        stats: { mean: 0, std_dev: 0 },
      });
    }

    if (path.startsWith('/analytics/by-merchant')) {
      return fulfillJson(route, 200, {
        merchants: [
          {
            merchant_id: 'm_kiwi',
            merchant_name: 'KIWI',
            total: 2472.04,
            count: 12,
            avg: 206.0,
            trend: 121.9,
            previous_total: 1114.0,
          },
        ],
        comparison_period: {
          current_start: '2026-01-01',
          current_end: '2026-02-18',
          previous_start: '2025-11-14',
          previous_end: '2025-12-31',
        },
      });
    }

    if (path.startsWith('/budgets/tracking')) {
      return fulfillJson(route, 200, {
        enabled: false,
        periods: [],
      });
    }

    if (path.startsWith('/transactions/count')) {
      return fulfillJson(route, 200, { total: 2 });
    }

    if (path === '/transactions') {
      return fulfillJson(route, 200, {
        transactions: [],
        total: 0,
        limit: 50,
        offset: 0,
        has_more: false,
        aggregates: {
          sum_amount: 0,
          total_spent: 0,
          total_income: 0,
        },
      });
    }

    if (method === 'GET') {
      return fulfillJson(route, 200, {});
    }

    return fulfillJson(route, 200, { success: true });
  });
}
