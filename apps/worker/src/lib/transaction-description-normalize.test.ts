import { describe, expect, it } from 'vitest';
import {
  looksLikeOpaqueDescriptionToken,
  normalizeTransactionDescription,
} from './transaction-description-normalize';

describe('normalizeTransactionDescription', () => {
  it('strips leading dotted account-like references', () => {
    expect(normalizeTransactionDescription('9802.44.27714, Felleskonto ...')).toBe('Felleskonto ...');
    expect(normalizeTransactionDescription('R9802.44.27714, Felleskonto ...')).toBe('Felleskonto ...');
  });

  it('strips leading compact account-like references', () => {
    expect(normalizeTransactionDescription('R98024427714 Felleskonto ...')).toBe('Felleskonto ...');
    expect(normalizeTransactionDescription('Konto 9802.44.27714 Felleskonto ...')).toBe('Felleskonto ...');
  });

  it('strips leading store/register numeric codes and trailing notanr noise', () => {
    expect(
      normalizeTransactionDescription('2515 COOP PRIX SOERENGA Notanr 74463664225522269228672')
    ).toBe('COOP PRIX SOERENGA');
    expect(normalizeTransactionDescription('4306 COOP PRIX POSTGIROBY Notanr 74463665133531343237276')).toBe(
      'COOP PRIX POSTGIROBY'
    );
  });

  it('strips star rail prefixes and keeps merchant text', () => {
    expect(normalizeTransactionDescription('Vipps*Los Tacos Bjoervika Notanr 74987506002002677126098')).toBe(
      'Los Tacos Bjoervika'
    );
    expect(normalizeTransactionDescription('PAYPAL *TEMU')).toBe('TEMU');
  });

  it('strips provider wrappers and terminal ids', () => {
    expect(normalizeTransactionDescription('ZETTLE_*KLASSEROMMET A')).toBe('KLASSEROMMET A');
    expect(normalizeTransactionDescription('3A5M65EMPK/SUKKERBITEN')).toBe('SUKKERBITEN');
    expect(normalizeTransactionDescription('01765-SuenaCU USD 34,99 Kurs 1043')).toBe('SuenaCU');
    expect(normalizeTransactionDescription('B252 NO OSL TRATTORIA')).toBe('NO OSL TRATTORIA');
    expect(normalizeTransactionDescription('427279XXXXXX6829 08.11 FOREX 633\\OSLO')).toBe('FOREX 633\\OSLO');
  });

  it('falls back to merchant for pure cryptic token descriptions', () => {
    expect(normalizeTransactionDescription('PING*NUVINNO', 'Jølstad')).toBe('Jølstad');
    expect(normalizeTransactionDescription('R98024427714', 'Felleskonto')).toBe('Felleskonto');
    expect(normalizeTransactionDescription('5785*', 'REVOLUT')).toBe('REVOLUT');
  });

  it('keeps normal descriptions unchanged', () => {
    expect(normalizeTransactionDescription('Avtalegiro Til Storebrand Livsforsikring AS')).toBe(
      'Storebrand Livsforsikring AS'
    );
    expect(normalizeTransactionDescription('NETFLIX.COM')).toBe('NETFLIX.COM');
  });
});

describe('looksLikeOpaqueDescriptionToken', () => {
  it('detects opaque token-like patterns', () => {
    expect(looksLikeOpaqueDescriptionToken('PING*NUVINNO')).toBe(true);
    expect(looksLikeOpaqueDescriptionToken('PING * NUVINNO')).toBe(true);
    expect(looksLikeOpaqueDescriptionToken('Avtalegiro Til Storebrand')).toBe(false);
  });
});
