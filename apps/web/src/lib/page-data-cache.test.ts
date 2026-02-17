import { describe, expect, it, vi } from 'vitest';
import { makePageCacheKey, readPageCache, writePageCache } from './page-data-cache';

describe('page-data-cache', () => {
  const memory = new Map<string, string>();
  (globalThis as any).window = {
    sessionStorage: {
      getItem: (k: string) => (memory.has(k) ? memory.get(k)! : null),
      setItem: (k: string, v: string) => {
        memory.set(k, v);
      },
      removeItem: (k: string) => {
        memory.delete(k);
      },
    },
  };

  it('creates stable keys regardless of input order', () => {
    memory.clear();
    const a = makePageCacheKey('dashboard', { b: '2', a: '1', empty: '' });
    const b = makePageCacheKey('dashboard', { a: '1', b: '2' });
    expect(a).toBe(b);
  });

  it('writes and reads non-expired values', () => {
    memory.clear();
    const key = makePageCacheKey('insights', { user: 'u1', range: '2026-01' });
    const payload = { total: 123 };
    writePageCache(key, payload, 10_000);
    expect(readPageCache<typeof payload>(key)).toEqual(payload);
  });

  it('drops expired values', () => {
    memory.clear();
    const key = makePageCacheKey('insights', { user: 'u1' });
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    writePageCache(key, { stale: true }, 100);
    vi.spyOn(Date, 'now').mockReturnValue(now + 101);
    expect(readPageCache(key)).toBeNull();
    vi.restoreAllMocks();
  });
});
