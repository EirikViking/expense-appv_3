import { describe, expect, it } from 'vitest';
import { parseDateInput, validateDateRange } from './date-input';

describe('parseDateInput', () => {
  it('accepts ISO and Norwegian date formats', () => {
    expect(parseDateInput('2026-02-14')).toEqual({ ok: true, iso: '2026-02-14' });
    expect(parseDateInput('14.02.2026')).toEqual({ ok: true, iso: '2026-02-14' });
    expect(parseDateInput('14/02/2026')).toEqual({ ok: true, iso: '2026-02-14' });
  });

  it('rejects impossible dates', () => {
    expect(parseDateInput('2026-02-31')).toEqual({ ok: false, reason: 'invalid_date' });
    expect(parseDateInput('31.04.2026')).toEqual({ ok: false, reason: 'invalid_date' });
  });

  it('rejects invalid formats', () => {
    expect(parseDateInput('2026.02.14')).toEqual({ ok: false, reason: 'invalid_format' });
    expect(parseDateInput('abc')).toEqual({ ok: false, reason: 'invalid_format' });
    expect(parseDateInput('')).toEqual({ ok: false, reason: 'invalid_format' });
  });
});

describe('validateDateRange', () => {
  it('validates date ordering', () => {
    expect(validateDateRange('2026-01-01', '2026-01-31')).toBe(true);
    expect(validateDateRange('2026-01-31', '2026-01-01')).toBe(false);
    expect(validateDateRange('', '2026-01-01')).toBe(true);
  });
});

