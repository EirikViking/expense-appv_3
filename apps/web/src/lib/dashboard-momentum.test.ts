import { describe, expect, it } from 'vitest';
import { computeSpendingMomentum } from './dashboard-momentum';

describe('computeSpendingMomentum', () => {
  it('returns null when no points exist', () => {
    expect(computeSpendingMomentum([])).toBeNull();
  });

  it('detects heating trend when second half grows clearly', () => {
    const result = computeSpendingMomentum([
      { date: '2026-01-01', expenses: 100, income: 0, net: -100, count: 1 },
      { date: '2026-01-02', expenses: 120, income: 0, net: -120, count: 1 },
      { date: '2026-01-03', expenses: 240, income: 0, net: -240, count: 1 },
      { date: '2026-01-04', expenses: 250, income: 0, net: -250, count: 1 },
    ]);

    expect(result).not.toBeNull();
    expect(result?.trend).toBe('heating');
    expect(result?.delta).toBe(270);
    expect(result?.changePct).toBeCloseTo(122.7273, 3);
  });

  it('detects cooling trend when second half falls clearly', () => {
    const result = computeSpendingMomentum([
      { date: '2026-01-01', expenses: 400, income: 0, net: -400, count: 1 },
      { date: '2026-01-02', expenses: 380, income: 0, net: -380, count: 1 },
      { date: '2026-01-03', expenses: 200, income: 0, net: -200, count: 1 },
      { date: '2026-01-04', expenses: 190, income: 0, net: -190, count: 1 },
    ]);

    expect(result).not.toBeNull();
    expect(result?.trend).toBe('cooling');
    expect(result?.delta).toBe(-390);
    expect(result?.changePct).toBeCloseTo(-50, 3);
  });

  it('splits by calendar half when explicit period is provided', () => {
    const result = computeSpendingMomentum(
      [
        { date: '2026-01-01', expenses: 200, income: 0, net: -200, count: 1 },
        { date: '2026-01-15', expenses: 200, income: 0, net: -200, count: 1 },
        { date: '2026-02-10', expenses: 100, income: 0, net: -100, count: 1 },
      ],
      { start: '2026-01-01', end: '2026-02-10' }
    );

    expect(result).not.toBeNull();
    expect(result?.firstFrom).toBe('2026-01-01');
    expect(result?.firstTo).toBe('2026-01-20');
    expect(result?.secondFrom).toBe('2026-01-21');
    expect(result?.secondTo).toBe('2026-02-10');
    expect(result?.firstHalf).toBe(400);
    expect(result?.secondHalf).toBe(100);
    expect(result?.trend).toBe('cooling');
  });
});

