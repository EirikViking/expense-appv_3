import { describe, expect, it } from 'vitest';
import app from '../index';

describe('analytics by-merchant trend window', () => {
  it('uses previous period with equal length for trend comparison', async () => {
    let currentBindings: unknown[] | null = null;
    let previousBindings: unknown[] | null = null;

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
            return null;
          },
          all: async () => {
            if (sql.includes('GROUP BY m.id, merchant_name') && sql.includes('LIMIT ?')) {
              currentBindings = [...params];
              return {
                results: [
                  { merchant_id: 'm1', merchant_name: 'Rema 1000', total: 1200, count: 4, avg: 300 },
                ],
              };
            }
            if (sql.includes('GROUP BY m.id, merchant_name') && !sql.includes('LIMIT ?')) {
              previousBindings = [...params];
              return {
                results: [
                  { merchant_id: 'm1', merchant_name: 'Rema 1000', total: 1000 },
                ],
              };
            }
            return { results: [] };
          },
          run: async () => ({ meta: { changes: 0 } }),
        }),
      }),
    } as unknown as D1Database;

    const env = {
      DB: db,
      ADMIN_PASSWORD: 'test',
      JWT_SECRET: 'test-secret',
    };

    const response = await app.request(
      '/analytics/by-merchant?date_from=2026-01-10&date_to=2026-01-20&limit=20',
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
    expect(currentBindings).toEqual(expect.arrayContaining(['user_1', '2026-01-10', '2026-01-20']));
    expect(previousBindings).toEqual(expect.arrayContaining(['user_1', '2025-12-30', '2026-01-09']));

    const body = (await response.json()) as { merchants: Array<{ trend: number }> };
    expect(Array.isArray(body.merchants)).toBe(true);
    expect(typeof body.merchants[0]?.trend).toBe('number');
  });
});

