const STORAGE_KEY = 'expense_last_date_range_v1';

export type StoredDateRange = { start: string; end: string };

function isIsoDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function loadLastDateRange(): StoredDateRange | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw) as { start?: unknown; end?: unknown } | null;
    if (!obj || !isIsoDate(obj.start) || !isIsoDate(obj.end)) return null;
    return { start: obj.start, end: obj.end };
  } catch {
    return null;
  }
}

export function saveLastDateRange(range: StoredDateRange): void {
  try {
    if (!isIsoDate(range.start) || !isIsoDate(range.end)) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ start: range.start, end: range.end }));
  } catch {
    // ignore
  }
}

export function clearLastDateRange(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

