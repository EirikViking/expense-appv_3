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

