import { describe, expect, it } from 'vitest';
import app from '../index';

type BoundStmt = {
  __sql: string;
  __params: unknown[];
  first: () => Promise<unknown>;
  all: () => Promise<{ results: unknown[] }>;
  run: () => Promise<{ meta: { changes: number } }>;
};

describe('transactions reset endpoint scoping', () => {
  it('allows regular users and deletes only scoped user data, never global rows', async () => {
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
              if (sql.includes('SELECT impersonated_user_id FROM sessions WHERE id = ?')) {
                return null;
              }
              return null;
            },
            all: async () => ({ results: [] }),
            run: async () => ({ meta: { changes: 1 } }),
          };
          return stmt;
        },
      }),
      batch: async (stmts: BoundStmt[]) => {
        executed.push(...stmts);
        return stmts.map(() => ({ meta: { changes: 1 } }));
      },
    } as unknown as D1Database;

    const env = {
      DB: db,
      ADMIN_PASSWORD: 'test',
      JWT_SECRET: 'test-secret',
    };

    const response = await app.request(
      '/transactions/actions/reset',
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'session=test-session-token',
          Origin: 'https://expense-appv-3.pages.dev',
        },
        body: JSON.stringify({ confirm: true }),
      },
      env
    );

    expect(response.status).toBe(200);
    expect(executed.length).toBeGreaterThan(0);

    for (const stmt of executed) {
      expect(stmt.__sql.toLowerCase()).toContain('user_id = ?');
      expect(stmt.__params).toContain('user_anja');
      expect(stmt.__sql.toLowerCase()).not.toBe('delete from transactions');
      expect(stmt.__sql.toLowerCase()).not.toBe('delete from ingested_files');
      expect(stmt.__sql.toLowerCase()).not.toBe('delete from transaction_meta');
      expect(stmt.__sql.toLowerCase()).not.toBe('delete from transaction_tags');
    }
  });
});

