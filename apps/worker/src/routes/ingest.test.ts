import { describe, it, expect } from 'vitest';
import app from '../index';
import { signJwt } from '../lib/jwt';

describe('ingest routes', () => {
  it('returns 400 with CORS headers on invalid JSON', async () => {
    const env = {
      DB: {} as D1Database,
      ADMIN_PASSWORD: 'test',
      JWT_SECRET: 'test-secret',
    };

    const token = await signJwt(
      { authenticated: true, exp: Date.now() + 60_000 },
      env.JWT_SECRET
    );

    const response = await app.request(
      '/ingest/xlsx',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
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
