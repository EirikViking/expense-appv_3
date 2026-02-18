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

  it('attaches previous_total and marks trend basis as valid when comparison exists', () => {
    const breakdown = buildMerchantBreakdown(
      [{ merchant_id: null, merchant_name: 'KIWI', total: 2472.04, count: 12 }],
      [{ merchant_id: null, merchant_name: 'KIWI', total: 1114.94 }]
    );

    const kiwi = breakdown.find((m) => m.merchant_name.toLowerCase() === 'kiwi');
    expect(kiwi).toBeTruthy();
    expect(Math.round((kiwi?.previous_total || 0) * 100) / 100).toBe(1114.94);
    expect(kiwi?.trend_basis_valid).toBe(true);
  });

  it('merges merchant rows regardless of case differences', () => {
    const breakdown = buildMerchantBreakdown(
      [
        { merchant_id: null, merchant_name: 'KIWI', total: 1000, count: 4 },
        { merchant_id: null, merchant_name: 'Kiwi', total: 750, count: 3 },
        { merchant_id: null, merchant_name: 'kiwi', total: 250, count: 1 },
      ],
      [{ merchant_id: null, merchant_name: 'kIwI', total: 500 }]
    );

    const kiwiRows = breakdown.filter((m) => m.merchant_name.toLowerCase() === 'kiwi');
    expect(kiwiRows).toHaveLength(1);
    expect(kiwiRows[0]?.count).toBe(8);
    expect(kiwiRows[0]?.total).toBe(2000);
    expect(kiwiRows[0]?.previous_total).toBe(500);
  });
});

