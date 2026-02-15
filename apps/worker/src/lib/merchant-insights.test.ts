import { describe, expect, it } from 'vitest';
import { buildMerchantBreakdown } from './merchant-insights';

describe('merchant insights grouping', () => {
  it('does not expose pure numeric/currency merchant codes as names', () => {
    const breakdown = buildMerchantBreakdown(
      [
        { merchant_id: null, merchant_name: '100022 NOK', total: 1200, count: 2 },
        { merchant_id: null, merchant_name: '100331', total: 300, count: 1 },
        { merchant_id: null, merchant_name: '100021 ELKJOP.NO', total: 900, count: 1 },
      ],
      []
    );

    expect(breakdown.some((m) => /^\d+$/.test(m.merchant_name))).toBe(false);
    expect(breakdown.some((m) => m.merchant_name === '100022 NOK')).toBe(false);
    expect(breakdown.some((m) => m.merchant_name === 'Ukjent brukersted')).toBe(true);
    expect(breakdown.some((m) => m.merchant_name === 'ELKJOP')).toBe(true);
  });
});

