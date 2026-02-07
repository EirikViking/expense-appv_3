import { describe, expect, it } from 'vitest';
import { detectIsTransfer } from './transfer-detect';

describe('transfer-detect', () => {
  it('detects Storebrand payment-rail rows', () => {
    expect(detectIsTransfer('Straksbetaling')).toBe(true);
    expect(detectIsTransfer('SEB Kort')).toBe(true);
    expect(detectIsTransfer('Betaling med engangsfullmakt - Kjøp Kron')).toBe(true);
  });

  it('does not flag normal purchases as transfers', () => {
    expect(detectIsTransfer('REMA 1000 SORENGA')).toBe(false);
    expect(detectIsTransfer('SATS Bjoervika')).toBe(false);
  });
});

