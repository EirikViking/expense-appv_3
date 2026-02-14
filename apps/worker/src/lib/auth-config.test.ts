import { describe, expect, it } from 'vitest';
import { PASSWORD_ITERS } from './auth';

describe('auth config', () => {
  it('keeps PBKDF2 iterations within Cloudflare Workers limit', () => {
    expect(PASSWORD_ITERS).toBeLessThanOrEqual(100_000);
  });
});
