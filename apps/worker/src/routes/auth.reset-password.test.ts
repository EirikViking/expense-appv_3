import { describe, expect, it } from 'vitest';
import app from '../index';

type BoundStmt = {
  __sql: string;
  __params: unknown[];
  first: () => Promise<unknown>;
  all: () => Promise<{ results: unknown[] }>;
  run: () => Promise<{ meta: { changes: number } }>;
};

describe('auth reset-password', () => {
  it('activates user when password is reset via token', async () => {
    const executed: BoundStmt[] = [];

    const db = {
      prepare: (sql: string) => ({
        bind: (...params: unknown[]) => {
          const stmt: BoundStmt = {
            __sql: sql,
            __params: params,
            first: async () => {
              if (sql.includes('FROM password_tokens') && sql.includes('type = ?')) {
                return { id: 'tok_1', user_id: 'user_1' };
              }
              return null;
            },
            all: async () => ({ results: [] }),
            run: async () => {
              if (sql.includes('UPDATE password_tokens SET used_at')) {
                return { meta: { changes: 1 } };
              }
              return { meta: { changes: 1 } };
            },
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
      '/auth/reset-password',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://expense-appv-3.pages.dev',
        },
        body: JSON.stringify({ token: 'dummy-token-1234567890', password: 'StrongPass123' }),
      },
      env
    );

    expect(response.status).toBe(200);

    const userUpdate = executed.find((stmt) => stmt.__sql.includes('UPDATE users'));
    expect(userUpdate).toBeDefined();
    expect((userUpdate as BoundStmt).__sql).toContain('active = 1');
  });
});
