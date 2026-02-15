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

  it('normalizes code-prefixed card descriptions into stable merchant groups', () => {
    const breakdown = buildMerchantBreakdown(
      [
        { merchant_id: null, merchant_name: 'Visa 100032 Nok 1061,56 Klarna Ab', total: 1061.56, count: 1 },
        { merchant_id: null, merchant_name: 'Visa 100322 Nok 644,00 Klarna Ab', total: 644, count: 1 },
        { merchant_id: null, merchant_name: 'Visa 100022 Nok 2728,00 Klarna:goodlife n', total: 2728, count: 1 },
      ],
      []
    );

    const klarna = breakdown.find((m) => m.merchant_name === 'KLARNA');
    expect(klarna).toBeTruthy();
    expect(klarna?.count).toBe(3);
    expect(Math.round((klarna?.total || 0) * 100) / 100).toBe(4433.56);
    expect(breakdown.some((m) => m.merchant_name === 'Ukjent brukersted')).toBe(false);
  });
});

