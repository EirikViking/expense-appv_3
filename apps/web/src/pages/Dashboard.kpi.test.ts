import { describe, expect, it } from 'vitest';
import nb from '@/i18n/locales/nb.json';
import en from '@/i18n/locales/en.json';

describe('Dashboard KPI cards', () => {
  it('uses spending/transfers labels and removes net-spend/income labels', () => {
    expect(nb.dashboard.spending).toBe('Forbruk');
    expect(nb.dashboard.transfers).toBe('Overføringer');
    expect(en.dashboard.spending).toBe('Spending');
    expect(en.dashboard.transfers).toBe('Transfers');

    expect(nb.dashboard).not.toHaveProperty('netSpend');
    expect(nb.dashboard).not.toHaveProperty('income');
    expect(en.dashboard).not.toHaveProperty('netSpend');
    expect(en.dashboard).not.toHaveProperty('income');
  });
});
