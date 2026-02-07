import { describe, expect, it } from 'vitest';
import { merchantChainKey } from './merchant-chain';

describe('merchantChainKey', () => {
  it('does not merge when canonical merchant_id is present', () => {
    expect(merchantChainKey('m_1', 'KIWI 505')).toBe('KIWI 505');
  });

  it('merges numeric store suffixes into a chain key', () => {
    expect(merchantChainKey(null, 'KIWI 505 BARCODE')).toBe('KIWI');
    expect(merchantChainKey(null, 'REMA 1000 SORENGA')).toBe('REMA');
  });

  it('aggregates Skatteetaten variants into one group', () => {
    expect(merchantChainKey(null, 'Skatteetaten - Skatteinnkrevin')).toBe('SKATTEETATEN');
    expect(merchantChainKey(null, 'Girobetaling Skatteetaten-Skatteinnkreving')).toBe('SKATTEETATEN');
  });
});

