import { describe, expect, it } from 'vitest';
import {
  extractSectionLabelFromRawJson,
  isPaymentLikeRow,
  isPurchaseSection,
  isRefundLike,
  normalizeXlsxAmountForIngest,
} from './xlsx-normalize';

describe('xlsx-normalize', () => {
  it('extracts section_label from new raw_json shape', () => {
    const raw = JSON.stringify({ section_label: 'Kjøp/uttak', raw_row: { foo: 'bar' } });
    expect(extractSectionLabelFromRawJson(raw)).toBe('Kjøp/uttak');
  });

  it('detects purchase section', () => {
    expect(isPurchaseSection('Kjøp/uttak')).toBe(true);
    expect(isPurchaseSection('Kjop/uttak')).toBe(true);
    expect(isPurchaseSection('INNBETALING BANKGIRO')).toBe(false);
  });

  it('detects refund-like descriptions', () => {
    expect(isRefundLike('REFUSJON KIWI')).toBe(true);
    expect(isRefundLike('Tilbakeføring')).toBe(true);
    expect(isRefundLike('REMA 1000')).toBe(false);
  });

  it('marks payment-like rows as transfer+excluded', () => {
    expect(isPaymentLikeRow('INNBETALING BANKGIRO', null)).toBe(true);
    expect(isPaymentLikeRow('Betaling bankgiro', null)).toBe(false);
    expect(isPaymentLikeRow('REMA 1000', 'Kjøp/uttak')).toBe(false);
    expect(isPaymentLikeRow('Straksbetaling', null)).toBe(true);
    expect(isPaymentLikeRow('SEB Kort', null)).toBe(true);
    expect(isPaymentLikeRow('Betaling med engangsfullmakt - Kjøp Kron', null)).toBe(true);

    const norm = normalizeXlsxAmountForIngest({
      amount: 1000,
      description: 'INNBETALING BANKGIRO',
      raw_json: JSON.stringify({ section_label: 'Innbetaling bankgiro' }),
    });
    expect(norm.flags).toEqual({ is_transfer: 1, is_excluded: 1 });
    expect(norm.amount).toBe(1000);
  });

  it('normalizes purchases in Kjøp/uttak to negative, but never flips refunds', () => {
    const purchase = normalizeXlsxAmountForIngest({
      amount: 123.45,
      description: 'KIWI 505 BARCODE/OSLO/NO',
      raw_json: JSON.stringify({ section_label: 'Kjøp/uttak' }),
    });
    expect(purchase.amount).toBe(-123.45);
    expect(purchase.flags).toBeUndefined();

    const alreadyNegative = normalizeXlsxAmountForIngest({
      amount: -200,
      description: 'REMA 1000',
      raw_json: JSON.stringify({ section_label: 'Kjøp/uttak' }),
    });
    expect(alreadyNegative.amount).toBe(-200);

    const refund = normalizeXlsxAmountForIngest({
      amount: 50,
      description: 'REFUSJON REMA 1000',
      raw_json: JSON.stringify({ section_label: 'Kjøp/uttak' }),
    });
    expect(refund.amount).toBe(50);
  });
});
