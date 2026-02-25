import { describe, expect, it } from 'vitest';
import { normalizeMerchant, UNKNOWN_MERCHANT } from './merchant-normalize';

describe('normalizeMerchant', () => {
  it('normalizes known merchant patterns', () => {
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

  it('uses fallback description when merchant field is code-like amount noise', () => {
    const normalized = normalizeMerchant(
      '100032 NOK 1061,56',
      'Visa 100032 Nok 1061,56 Klarna Ab'
    );
    expect(normalized.merchant).toBe('KLARNA');
    expect(normalized.merchant_raw).toBe('100032 NOK 1061,56');
    expect(normalized.merchant_kind).toBe('name');
  });

  it('cleans avtalegiro labels into readable merchant names', () => {
    const normalized = normalizeMerchant(
      'Avtalegiro Til Storebrand Livsforsikring AS Betalingsdato 02-02-2026'
    );
    expect(normalized.merchant).toBe('Storebrand Livsforsikring');
    expect(normalized.merchant_kind).toBe('name');
  });

  it('strips trailing country code + store number noise', () => {
    const normalized = normalizeMerchant('XXL NOR 301');
    expect(normalized.merchant).toBe('XXL');
    expect(normalized.merchant_kind).toBe('name');
  });

  it('maps ping nuvinno variants to Jolstad', () => {
    expect(normalizeMerchant('PING*NUVINNO').merchant).toBe('J\u00F8lstad');
    expect(normalizeMerchant('Ping Nuvinno').merchant).toBe('J\u00F8lstad');
  });

  it('strips payment-rail star prefixes from merchant names', () => {
    expect(normalizeMerchant('Vipps*Los Tacos Bjoervika').merchant).toBe('Los Tacos Bjoervika');
    expect(normalizeMerchant('PAYPAL *TEMU').merchant).toBe('TEMU');
    expect(normalizeMerchant('PAYPAL *P31E4A1A7F').merchant).toBe('PAYPAL');
    expect(normalizeMerchant('Revolut**5785*').merchant).toBe('REVOLUT');
    expect(normalizeMerchant('ZETTLE_*KLASSEROMMET A').merchant).toBe('KLASSEROMMET A');
    expect(normalizeMerchant('3A5M65EMPK/SUKKERBITEN').merchant).toBe('SUKKERBITEN');
  });

  it('strips dotted numeric reference prefixes before merchant name', () => {
    const normalized = normalizeMerchant('9802.44.27714, Felleskonto ...');
    expect(normalized.merchant).toBe('Felleskonto ...');
    expect(normalized.merchant_kind).toBe('name');
  });

  it('strips prefixed letter+numeric reference prefixes before merchant name', () => {
    const normalized = normalizeMerchant('R9802.44.27714, Felleskonto ...');
    expect(normalized.merchant).toBe('Felleskonto ...');
    expect(normalized.merchant_kind).toBe('name');
  });

  it('strips long compact reference ids before merchant name', () => {
    const normalized = normalizeMerchant('R98024427714 Felleskonto ...');
    expect(normalized.merchant).toBe('Felleskonto ...');
    expect(normalized.merchant_kind).toBe('name');
  });

  it('keeps normal merchant names intact', () => {
    const normalized = normalizeMerchant('KIWI');
    expect(normalized.merchant).toBe('KIWI');
    expect(normalized.merchant_kind).toBe('name');
  });
});
