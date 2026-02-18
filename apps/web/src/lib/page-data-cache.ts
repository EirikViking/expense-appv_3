type CacheEnvelope<T> = {
  expires_at: number;
  payload: T;
};

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

export function makePageCacheKey(
  scope: string,
  params: Record<string, string | number | boolean | undefined | null>
): string {
  const normalized = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('&');
  return `pagecache:${scope}:${normalized}`;
}

export function readPageCache<T>(key: string): T | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed || typeof parsed.expires_at !== 'number' || parsed.expires_at <= Date.now()) {
      window.sessionStorage.removeItem(key);
      return null;
    }
    return parsed.payload;
  } catch {
    return null;
  }
}

export function writePageCache<T>(key: string, payload: T, ttlMs: number): void {
  if (!isBrowser()) return;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) return;
  try {
    const envelope: CacheEnvelope<T> = {
      expires_at: Date.now() + ttlMs,
      payload,
    };
    window.sessionStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // Ignore storage quota and serialization failures.
  }
}

