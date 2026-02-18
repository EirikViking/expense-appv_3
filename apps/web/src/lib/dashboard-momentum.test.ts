import { describe, expect, it } from 'vitest';
import { computeSpendingMomentum } from './dashboard-momentum';

describe('computeSpendingMomentum', () => {
  it('returns null when not enough points exist', () => {
    expect(computeSpendingMomentum([])).toBeNull();
    expect(
      computeSpendingMomentum([
        { date: '2026-01-01', expenses: 100, income: 0, net: -100, count: 1 },
        { date: '2026-01-02', expenses: 120, income: 0, net: -120, count: 1 },
        { date: '2026-01-03', expenses: 110, income: 0, net: -110, count: 1 },
      ])
    ).toBeNull();
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
  });
});

