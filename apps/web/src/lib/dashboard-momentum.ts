import type { TimeSeriesPoint } from '@expense/shared';

export type SpendingMomentumTrend = 'cooling' | 'heating' | 'steady';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SpendingMomentum {
  firstHalf: number;
  secondHalf: number;
  delta: number;
  changePct: number | null;
  trend: SpendingMomentumTrend;
  firstFrom: string;
  firstTo: string;
  secondFrom: string;
  secondTo: string;
}

function safeExpenses(point: TimeSeriesPoint): number {
  const value = Number(point.expenses ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function toUtcDay(date: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return Date.UTC(y, mo - 1, d);
}

function fromUtcDay(dayMs: number): string {
  const date = new Date(dayMs);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function deriveBounds(series: TimeSeriesPoint[]): { start: string; end: string } | null {
  const valid = series
    .map((point) => String(point.date || ''))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();
  if (valid.length === 0) return null;
  return {
    start: valid[0],
    end: valid[valid.length - 1],
  };
}

export function computeSpendingMomentum(
  series: TimeSeriesPoint[],
  period?: { start: string; end: string }
): SpendingMomentum | null {
  if (!Array.isArray(series) || series.length === 0) return null;

  const bounds = period ?? deriveBounds(series);
  if (!bounds) return null;

  const startMs = toUtcDay(bounds.start);
  const endMs = toUtcDay(bounds.end);
  if (startMs === null || endMs === null || endMs < startMs) return null;

  const totalDays = Math.floor((endMs - startMs) / DAY_MS) + 1;
  if (totalDays < 2) return null;

  const firstDays = Math.floor(totalDays / 2);
  const firstEndMs = startMs + (firstDays - 1) * DAY_MS;
  const secondStartMs = firstEndMs + DAY_MS;

  let firstHalf = 0;
  let secondHalf = 0;
  for (const point of series) {
    const dateMs = toUtcDay(String(point.date || ''));
    if (dateMs === null) continue;
    if (dateMs < startMs || dateMs > endMs) continue;
    if (dateMs <= firstEndMs) firstHalf += safeExpenses(point);
    else secondHalf += safeExpenses(point);
  }

  const delta = secondHalf - firstHalf;
  const changePct = firstHalf > 0 ? (delta / firstHalf) * 100 : null;

  const tolerance = Math.max(100, firstHalf * 0.03);
  const trend: SpendingMomentumTrend =
    delta > tolerance ? 'heating' : delta < -tolerance ? 'cooling' : 'steady';

  return {
    firstHalf,
    secondHalf,
    delta,
    changePct,
    trend,
    firstFrom: bounds.start,
    firstTo: fromUtcDay(firstEndMs),
    secondFrom: fromUtcDay(secondStartMs),
    secondTo: bounds.end,
  };
}

