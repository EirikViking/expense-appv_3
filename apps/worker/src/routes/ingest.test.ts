import { describe, it, expect } from 'vitest';
import app from '../index';

describe('ingest routes', () => {
  it('returns 400 with CORS headers on invalid JSON', async () => {
    const db = {
      prepare: (sql: string) => ({
        bind: (..._params: any[]) => ({
          first: async () => {
            if (sql.includes('FROM sessions s')) {
              return {
                id: 'u1',
                email: 'admin@example.com',
                name: 'Admin',
                role: 'admin',
                active: 1,
                onboarding_done_at: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
            }
            return null;
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
      '/ingest/xlsx',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'session=test-session-token',
          Origin: 'https://expense-appv-3.pages.dev',
        },
        body: '{',
      },
      env
    );

    expect(response.status).toBe(400);
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'https://expense-appv-3.pages.dev'
    );

    const body = await response.json() as any;
    expect(body.error).toBe('Invalid JSON');
    expect(body.code).toBe('invalid_json');
  });
});
