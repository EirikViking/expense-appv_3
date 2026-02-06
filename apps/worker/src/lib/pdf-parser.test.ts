import { describe, it, expect } from 'vitest';
import { extractMerchantFromPdfLine, parsePdfText } from './pdf-parser';

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

describe('pdf-parser merchant extraction', () => {
  it('extracts a grocery merchant like REMA 1000 SORENGA for rule matching', () => {
    const line = '05.01.2026 REMA 1000 SORENGA -130,45 NOK';
    const merchant = extractMerchantFromPdfLine(line);
    expect(merchant).toContain('REMA');
    expect(merchant).toContain('SORENGA');
  });

  it('prefers Butikk marker when present', () => {
    const line = '05.01.2026 Kortkjøp Butikk: REMA 1000 SORENGA -130,45';
    const merchant = extractMerchantFromPdfLine(line);
    expect(merchant).toBe('REMA 1000 SORENGA');
  });
});

describe('pdf-parser detaljer block format', () => {
  it('parses a Detaljer block with Butikk + Beløp (REMA)', () => {
    const extracted = [
      'Detaljer',
      'Dato',
      '05.01.2025',
      'Beløp',
      '-130,45 NOK',
      'Transaksjonstekst',
      'KORTKJØP',
      'Butikk',
      'REMA 1000 SORENGA',
      'Fra konto',
      '1234.56.78901',
    ].join('\n');

    const res = parsePdfText(extracted);
    expect(res.error).toBeUndefined();
    expect(res.transactions.length).toBe(1);
    expect(res.transactions[0].tx_date).toBe('2025-01-05');
    expect(res.transactions[0].amount).toBeCloseTo(-130.45, 2);
    expect(res.transactions[0].description).toContain('REMA');
    expect(res.transactions[0].raw_block).toBeTruthy();
    expect(res.transactions[0].merchant_hint).toBe('REMA 1000 SORENGA');
  });

  it('parses a Detaljer block without Butikk (KIWI via Transaksjonstekst)', () => {
    const extracted = [
      'Detaljer',
      'Dato 06.01.2025',
      'Beløp -234,00 NOK',
      'Transaksjonstekst',
      'KIWI 123 BJORVIKA',
    ].join('\n');

    const res = parsePdfText(extracted);
    expect(res.error).toBeUndefined();
    expect(res.transactions.length).toBe(1);
    expect(res.transactions[0].tx_date).toBe('2025-01-06');
    expect(res.transactions[0].description).toContain('KIWI');
  });

  it('parses a non-grocery Detaljer block (SATS)', () => {
    const extracted = [
      'Detaljer',
      'Dato 10.02.2025',
      'Beløp -599,00 NOK',
      'Transaksjonstekst SATS NORWAY AS',
    ].join('\n');

    const res = parsePdfText(extracted);
    expect(res.error).toBeUndefined();
    expect(res.transactions.length).toBe(1);
    expect(res.transactions[0].description).toContain('SATS');
  });
});
