import { describe, it, expect } from 'vitest';
import { looksLikeStorebrandFiveColRow, parseStorebrandRow5 } from '@expense/shared';

describe('storebrand-xlsx helpers', () => {
  it('parses headerless Storebrand 5-column rows (ISO date)', () => {
    const row = {
      date: '2026-02-03',
      text: 'VISA VARE ... APPLE.COM/BILL ...',
      amount: -119.0,
      balance: 11899.21,
      currency: 'NOK',
    };

    const parsed = parseStorebrandRow5(row);
    expect(parsed?.tx_date).toBe('2026-02-03');
    expect(parsed?.amount).toBe(-119.0);
    expect(parsed?.currency).toBe('NOK');
    expect(parsed?.description).toContain('APPLE.COM/BILL');
  });

  it('parses dd.mm.yyyy dates', () => {
    const row = {
      date: '03.02.2026',
      text: 'TV 2 NO 32705132',
      amount: '-469,00',
      balance: '12 189,90',
      currency: 'NOK',
    };

    const parsed = parseStorebrandRow5(row);
    expect(parsed?.tx_date).toBe('2026-02-03');
    expect(parsed?.amount).toBe(-469.0);
  });

  it('detects Storebrand 5-column row shapes', () => {
    const values = ['2026-02-03', 'TV 2 NO 32705132', -469.0, 12189.9, 'NOK'];
    expect(looksLikeStorebrandFiveColRow(values)).toBe(true);
  });
});

