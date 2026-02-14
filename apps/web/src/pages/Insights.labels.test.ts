import { describe, expect, it } from 'vitest';
import nb from '@/i18n/locales/nb.json';
import { getMerchantLeaderboardTitle } from '@/pages/Insights';

describe('Insights merchant labels', () => {
  it('uses Topp brukersteder and not Topp kjøpmenn in nb mode', () => {
    expect(getMerchantLeaderboardTitle('nb')).toBe('Topp brukersteder');
    expect(getMerchantLeaderboardTitle('nb')).not.toBe('Topp kjøpmenn');
    expect(nb.dashboard.topMerchants).toBe('Topp brukersteder');
  });
});
