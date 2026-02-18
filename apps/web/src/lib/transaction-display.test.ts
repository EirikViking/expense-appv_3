import { describe, expect, it } from 'vitest';
import { getDisplayTransactionDescription } from './transaction-display';

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
});
