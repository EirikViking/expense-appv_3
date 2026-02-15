import { describe, expect, it } from 'vitest';
import { detectIsTransfer } from './transfer-detect';

describe('transfer-detect', () => {
  it('detects transfer-like payment-rail rows (except Straksbetaling)', () => {
    expect(detectIsTransfer('Straksbetaling')).toBe(false);
    expect(detectIsTransfer('SEB Kort')).toBe(true);
    expect(detectIsTransfer('Betaling med engangsfullmakt - Kjøp Kron')).toBe(true);
  });

  it('does not flag normal purchases as transfers', () => {
    expect(detectIsTransfer('REMA 1000 SORENGA')).toBe(false);
    expect(detectIsTransfer('SATS Bjoervika')).toBe(false);
  });

  it('never flags felleskonto rows as transfers', () => {
    expect(detectIsTransfer('Overføring til Felleskonto')).toBe(false);
    expect(detectIsTransfer('Felleskonto betaling husleie')).toBe(false);
  });
});
