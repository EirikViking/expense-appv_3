import type { TimeSeriesPoint } from '@expense/shared';

export type SpendingMomentumTrend = 'cooling' | 'heating' | 'steady';

export interface SpendingMomentum {
  firstHalf: number;
  secondHalf: number;
  delta: number;
  changePct: number | null;
  trend: SpendingMomentumTrend;
}

function safeExpenses(point: TimeSeriesPoint): number {
  const value = Number(point.expenses ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function computeSpendingMomentum(series: TimeSeriesPoint[]): SpendingMomentum | null {
  if (!Array.isArray(series) || series.length < 4) return null;

  const midpoint = Math.floor(series.length / 2);
  if (midpoint <= 0 || midpoint >= series.length) return null;

  const firstHalf = series.slice(0, midpoint).reduce((sum, point) => sum + safeExpenses(point), 0);
  const secondHalf = series.slice(midpoint).reduce((sum, point) => sum + safeExpenses(point), 0);
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
  };
}

