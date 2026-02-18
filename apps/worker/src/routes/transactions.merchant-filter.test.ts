import { describe, expect, it } from 'vitest';
import app from '../index';

describe('transactions merchant_name filtering', () => {
  it('uses INSTR-based contains matching to avoid LIKE complexity errors', async () => {
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
              if (sql.includes('SELECT impersonated_user_id FROM sessions WHERE id = ?')) {
                return null;
              }
              if (sql.includes('COUNT(DISTINCT t.id) as total')) {
                return { total: 0 };
              }
              if (sql.includes('COALESCE(SUM(x.amount), 0) as sum_amount')) {
                return { sum_amount: 0, total_spent: 0, total_income: 0 };
              }
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

    const merchantName = encodeURIComponent('Avtalegiro Til Storebrand Livsforsikring AS Betalingsdato 02-02-2026');
    const response = await app.request(
      `/transactions?merchant_name=${merchantName}`,
      {
        method: 'GET',
        headers: {
          Cookie: 'session=test-session-token',
          Origin: 'https://expense-appv-3.pages.dev',
        },
      },
      env,
    );

    expect(response.status).toBe(200);
    const listQuery = seenSql.find((entry) => entry.includes('SELECT DISTINCT t.* FROM transactions t')) || '';
    expect(listQuery).toContain("INSTR(LOWER(COALESCE(m.canonical_name, '')), LOWER(?)) > 0");
    expect(listQuery).toContain("INSTR(LOWER(COALESCE(t.merchant, '')), LOWER(?)) > 0");
    expect(listQuery).toContain("INSTR(LOWER(COALESCE(t.description, '')), LOWER(?)) > 0");
    expect(listQuery).not.toContain('COALESCE(m.canonical_name, \'\') LIKE ? COLLATE NOCASE');
  });
});
