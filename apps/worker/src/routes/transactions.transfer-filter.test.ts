import { describe, expect, it } from 'vitest';
import app from '../index';

describe('transactions transfer behavior', () => {
  it('marks transfer rows as excluded by default when toggled on', async () => {
    const updateParams: unknown[][] = [];

    const db = {
      prepare: (sql: string) => ({
        bind: (...params: unknown[]) => ({
          first: async () => {
            if (sql.includes('FROM sessions s')) {
              return {
                id: 'user_1',
                email: 'user@example.com',
                name: 'User',
                role: 'user',
                active: 1,
                onboarding_done_at: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
            }
            if (sql.includes('SELECT impersonated_user_id FROM sessions WHERE id = ?')) {
              return null;
            }
            if (sql.includes('SELECT 1 FROM transactions WHERE id = ? AND user_id = ?')) {
              return { 1: 1 };
            }
            if (sql.includes('SELECT * FROM transactions WHERE id = ? AND user_id = ?')) {
              return {
                id: 'tx_1',
                tx_hash: 'h',
                tx_date: '2026-02-10',
                booked_date: '2026-02-10',
                description: 'Test transfer',
                merchant: null,
                merchant_raw: null,
                amount: -200,
                currency: 'NOK',
                status: 'booked',
                source_type: 'xlsx',
                source_file_hash: null,
                raw_json: null,
                created_at: new Date().toISOString(),
                flow_type: 'transfer',
                is_excluded: 1,
                is_transfer: 1,
                user_id: 'user_1',
              };
            }
            return null;
          },
          all: async () => ({ results: [] }),
          run: async () => {
            if (sql.startsWith('UPDATE transactions SET')) {
              updateParams.push(params);
            }
            return { meta: { changes: 1 } };
          },
        }),
      }),
    } as unknown as D1Database;

    const env = {
      DB: db,
      ADMIN_PASSWORD: 'test',
      JWT_SECRET: 'test-secret',
    };

    const response = await app.request(
      '/transactions/tx_1',
      {
        method: 'PATCH',
        headers: {
          Cookie: 'session=test-session-token',
          Origin: 'https://expense-appv-3.pages.dev',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_transfer: true }),
      },
      env
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { is_transfer: boolean; is_excluded: boolean };
    expect(body.is_transfer).toBe(true);
    expect(body.is_excluded).toBe(true);
    expect(updateParams.length).toBe(1);
  });

  it('excludes transfer rows by default in transactions list queries', async () => {
    const seenSql: string[] = [];
    const db = {
      prepare: (sql: string) => {
        seenSql.push(sql);
        return {
          bind: (..._params: unknown[]) => ({
            first: async () => {
              if (sql.includes('FROM sessions s')) {
                return {
                  id: 'user_1',
                  email: 'user@example.com',
                  name: 'User',
                  role: 'user',
                  active: 1,
                  onboarding_done_at: null,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                };
              }
              if (sql.includes('SELECT impersonated_user_id FROM sessions WHERE id = ?')) return null;
              if (sql.includes('COUNT(DISTINCT t.id) as total')) return { total: 0 };
              if (sql.includes('COALESCE(SUM(x.amount), 0) as sum_amount')) return { sum_amount: 0, total_spent: 0, total_income: 0 };
              return null;
            },
            all: async () => ({ results: [] }),
            run: async () => ({ meta: { changes: 0 } }),
          }),
        };
      },
    } as unknown as D1Database;

    const env = {
      DB: db,
      ADMIN_PASSWORD: 'test',
      JWT_SECRET: 'test-secret',
    };

    const response = await app.request(
      '/transactions',
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
    const listQuery = seenSql.find((entry) => entry.includes('SELECT DISTINCT t.* FROM transactions t')) || '';
    expect(listQuery).toContain('COALESCE(t.is_transfer, 0) = 0');
    expect(listQuery).toContain("t.flow_type != 'transfer'");
  });
});
