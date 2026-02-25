import { describe, expect, it } from 'vitest';
import { getDisplayTransactionDescription, looksLikeOpaqueMerchantToken } from './transaction-display';

describe('getDisplayTransactionDescription', () => {
  it('strips dotted numeric reference prefix', () => {
    expect(getDisplayTransactionDescription('9802.44.27714, Felleskonto ...')).toBe('Felleskonto ...');
  });

  it('strips prefixed letter + numeric reference prefix', () => {
    expect(getDisplayTransactionDescription('R9802.44.27714, Felleskonto ...')).toBe('Felleskonto ...');
  });

  it('falls back to merchant when description becomes empty', () => {
    expect(getDisplayTransactionDescription('R98024427714', 'Felleskonto')).toBe('Felleskonto');
  });

  it('keeps normal descriptions unchanged', () => {
    expect(getDisplayTransactionDescription('Avtalegiro Til Storebrand Livsforsikring AS')).toBe(
      'Avtalegiro Til Storebrand Livsforsikring AS',
    );
  });

  it('prefers merchant label for opaque token descriptions', () => {
    expect(getDisplayTransactionDescription('PING*NUVINNO', 'Jølstad')).toBe('Jølstad');
    expect(getDisplayTransactionDescription('PING * NUVINNO', 'Jølstad')).toBe('Jølstad');
  });

  it('detects opaque token shapes', () => {
    expect(looksLikeOpaqueMerchantToken('PING*NUVINNO')).toBe(true);
    expect(looksLikeOpaqueMerchantToken('NETFLIX.COM')).toBe(false);
    expect(looksLikeOpaqueMerchantToken('Avtalegiro Til Storebrand')).toBe(false);
  });
});
