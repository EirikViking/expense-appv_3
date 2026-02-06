import { describe, it, expect } from 'vitest';
import { parsePdfText } from './pdf-parser';

describe('pdf-parser date validation', () => {
  it('skips obviously invalid dates instead of inserting poisoned ISO strings', () => {
    const extracted = [
      'Kontobevegelser',
      '80.14.9108 Not a date -10,00',
      '05.01.2026 Valid merchant -20,00',
    ].join('\n');

    const res = parsePdfText(extracted);
    expect(res.error).toBeUndefined();
    expect(res.transactions).toHaveLength(1);
    expect(res.transactions[0].tx_date).toBe('2026-01-05');
  });

  it('falls back to the second date when the first date is invalid', () => {
    const extracted = [
      'Kontobevegelser',
      '80.14.9108 05.01.2026 Some merchant -10,00',
    ].join('\n');

    const res = parsePdfText(extracted);
    expect(res.error).toBeUndefined();
    expect(res.transactions).toHaveLength(1);
    expect(res.transactions[0].tx_date).toBe('2026-01-05');
  });
});

describe('pdf-parser amount validation', () => {
  it('does not treat a year token as amount (prevents repeated 2026.00 pollution)', () => {
    const extracted = [
      'Kontobevegelser',
      // This is similar to the real failure mode: a line with repeated dates and a trailing year.
      // Older logic would parse amount=2026 and insert garbage transactions.
      '02.02.2026 02.02.2026 02.02. 2026',
    ].join('\n');

    const res = parsePdfText(extracted);
    expect(res.error).toBeUndefined();
    expect(res.transactions).toHaveLength(0);
  });

  it('prefers real money values over stray year tokens in the line', () => {
    const extracted = [
      'Kontobevegelser',
      '02.02.2026 KIWI -123,45 2026',
    ].join('\n');

    const res = parsePdfText(extracted);
    expect(res.error).toBeUndefined();
    expect(res.transactions).toHaveLength(1);
    expect(res.transactions[0].amount).toBeCloseTo(-123.45, 2);
  });
});
