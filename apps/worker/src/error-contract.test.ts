import { describe, expect, it } from 'vitest';
import app from './index';

describe('error response contract', () => {
  it('normalizes unauthorized JSON responses with code and message', async () => {
    const env = {
      DB: {} as D1Database,
      ADMIN_PASSWORD: 'test',
      JWT_SECRET: 'test-secret',
    };

    const response = await app.request('/transactions', { method: 'GET' }, env);
    expect(response.status).toBe(401);

    const body = (await response.json()) as { error?: string; message?: string; code?: string };
    expect(body.error).toBeDefined();
    expect(body.message).toBeDefined();
    expect(body.code).toBe('unauthorized');
  });

  it('normalizes not-found responses with code and message', async () => {
    const env = {
      DB: {} as D1Database,
      ADMIN_PASSWORD: 'test',
      JWT_SECRET: 'test-secret',
    };

    const response = await app.request('/does-not-exist', { method: 'GET' }, env);
    expect(response.status).toBe(404);

    const body = (await response.json()) as { error?: string; message?: string; code?: string };
    expect(body.error).toBe('Not found');
    expect(body.message).toBe('Not found');
    expect(body.code).toBe('not_found');
  });
});
