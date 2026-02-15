import { describe, expect, it } from 'vitest';
import { normalizeMerchant, UNKNOWN_MERCHANT } from './merchant-normalize';

describe('normalizeMerchant', () => {
  it('normalizes required merchant cases', () => {
    expect(normalizeMerchant('100021 ELKJOP.NO').merchant).toBe('ELKJOP');
    expect(normalizeMerchant('100022 NOK')).toEqual({
      merchant: UNKNOWN_MERCHANT,
      merchant_raw: '100022 NOK',
      merchant_kind: 'code',
    });
    expect(normalizeMerchant('Visa 100021 Rema 1000 Sorenga').merchant).toBe('Rema 1000 Sorenga');
    expect(normalizeMerchant('100331 CLASOHLSON.COM/NO').merchant).toBe('CLAS OHLSON');
    expect(normalizeMerchant('PAYPAL').merchant).toBe('PAYPAL');
  });
});

