import { describe, expect, it } from 'vitest';
import nb from '@/i18n/locales/nb.json';

describe('nb locale encoding and required strings', () => {
  it('keeps required auth/onboarding strings with correct Norwegian letters', () => {
    expect(nb.bootstrap.title).toBe('Opprett første admin');
    expect(nb.setPassword.subtitle).toBe('Fullfør kontooppsett ved å sette passord.');
    expect(nb.onboarding.stepReview).toBe('2. Gå gjennom importerte transaksjoner, og rett eventuelle feil.');
    expect(nb.login.subtitle).toBe('Skriv inn e-post og passord for å fortsette');
  });

  it('does not contain replacement characters in required strings', () => {
    const candidates = [
      nb.bootstrap.title,
      nb.setPassword.subtitle,
      nb.onboarding.stepUpload,
      nb.onboarding.stepReview,
      nb.onboarding.goToUpload,
      nb.settingsUsers.inviteReady,
      nb.settingsUsers.resetReady,
    ];

    for (const str of candidates) {
      expect(str).not.toContain('\uFFFD');
      expect(str).not.toContain('Ã');
      expect(str).not.toContain('?');
    }
  });
});

