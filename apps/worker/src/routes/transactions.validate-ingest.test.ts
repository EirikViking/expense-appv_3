import { describe, expect, it } from 'vitest';
import app from '../index';

type BoundStmt = {
  __sql: string;
  __params: unknown[];
  first: () => Promise<unknown>;
  all: () => Promise<{ results: unknown[] }>;
  run: () => Promise<{ meta: { changes: number } }>;
};

describe('transactions validate-ingest endpoint', () => {
  it('allows non-admin users and scopes all validation queries to effective user', async () => {
    const executed: BoundStmt[] = [];
    const db = {
      prepare: (sql: string) => ({
        bind: (...params: unknown[]) => {
          const stmt: BoundStmt = {
            __sql: sql,
            __params: params,
            first: async () => {
              if (sql.includes('FROM sessions s')) {
                return {
                  id: 'user_anja',
                  email: 'anja@example.com',
                  name: 'Anja',
                  role: 'user',
                  active: 1,
                  onboarding_done_at: null,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                };
              }
              if (sql.includes('COUNT(*) as total') && sql.includes('zero_amount_active')) {
                return {
                  total: 0,
                  excluded: 0,
                  zero_amount_excluded: 0,
                  zero_amount_active: 0,
                };
              }
              if (sql.includes("tm.category_id = 'cat_food_groceries'") && sql.includes('t.flow_type = \'expense\'')) {
                return { tx_count: 0, sum_abs: 0 };
              }
              if (sql.includes("tm.category_id = 'cat_food_groceries'") && sql.includes("t.flow_type = 'income'")) {
                return { count: 0 };
              }
              if (sql.includes('FROM categorized')) {
                return { total: 0 };
              }
              if (sql.includes('ABS(t.amount) BETWEEN 30000 AND 60000')) {
                return { count: 0 };
              }
              if (sql.includes('COALESCE(SUM(ABS(t.amount)), 0) as total')) {
                return { total: 0 };
              }
              return null;
            },
            all: async () => {
              if (sql.includes('GROUP BY t.flow_type')) return { results: [] };
              if (sql.includes('GROUP BY t.source_type')) return { results: [] };
              if (sql.includes('GROUP BY TRIM(t.description)')) return { results: [] };
              return { results: [] };
            },
            run: async () => ({ meta: { changes: 0 } }),
          };
          executed.push(stmt);
          return stmt;
        },
      }),
    } as unknown as D1Database;

    const env = {
      DB: db,
      ADMIN_PASSWORD: 'test',
      JWT_SECRET: 'test-secret',
    };

    const response = await app.request(
      '/transactions/validate/ingest?date_from=2026-01-01&date_to=2026-01-31',
      {
        method: 'GET',
        headers: {
          Cookie: 'session=test-session-token',
          Origin: 'https://expense-appv-3.pages.dev',
        },
      },
      env
    );

    expect(response.status).toBe(200);
    const body = await response.json() as { ok: boolean };
    expect(body.ok).toBe(true);

    const validationStatements = executed.filter((stmt) => stmt.__sql.includes('FROM transactions t'));
    expect(validationStatements.length).toBeGreaterThan(0);
    for (const stmt of validationStatements) {
      expect(stmt.__sql.toLowerCase()).toContain('user_id = ?');
      expect(stmt.__params).toContain('user_anja');
    }
  });
});
