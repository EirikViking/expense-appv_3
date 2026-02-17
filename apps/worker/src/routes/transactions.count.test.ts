import { describe, expect, it } from 'vitest';
import app from '../index';

describe('transactions count endpoint', () => {
  it('returns lightweight scoped counts for the effective user', async () => {
    const db = {
      prepare: (sql: string) => ({
        bind: (..._params: unknown[]) => ({
          first: async () => {
            if (sql.includes('FROM sessions s')) {
              return {
                id: 'user_eirik',
                email: 'eirik@example.com',
                name: 'Eirik',
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
            if (sql.includes('SELECT COUNT(*) as total FROM transactions t')) {
              return { total: 42 };
            }
            return null;
          },
          all: async () => ({ results: [] }),
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
      '/transactions/count?include_transfers=1',
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
    const body = (await response.json()) as { total: number };
    expect(body.total).toBe(42);
  });
});
