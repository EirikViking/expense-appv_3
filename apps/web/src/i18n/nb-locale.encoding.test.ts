import { describe, expect, it } from 'vitest';
import nb from '@/i18n/locales/nb.json';

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return;
  }
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) collectStrings(entry, out);
  }
}

describe('nb locale encoding and required strings', () => {
  it('keeps required auth/onboarding strings with correct Norwegian letters', () => {
    expect(nb.bootstrap.title).toBe('Opprett første admin');
    expect(nb.setPassword.subtitle).toBe('Fullfør kontooppsett ved å sette passord.');
    expect(nb.onboarding.stepReview).toBe('2. Gå gjennom importerte transaksjoner, og rett eventuelle feil.');
    expect(nb.login.subtitle).toBe('Skriv inn e-post og passord for å fortsette');
    expect(nb.dashboard.momentumNotEnoughHistory).toBe('For lite historikk ennå');
  });

  it('does not contain mojibake or replacement characters anywhere in nb locale', () => {
    const allStrings: string[] = [];
    collectStrings(nb, allStrings);
    expect(allStrings.length).toBeGreaterThan(0);

    for (const str of allStrings) {
      expect(str).not.toContain('\uFFFD');
      expect(str).not.toContain('Ã');
    }
  });
});

