import { describe, expect, it } from 'vitest';
import { localizeCategoryName } from '@/lib/category-localization';

describe('category localization', () => {
  it('localizes Groceries to Dagligvarer in Norwegian variants', () => {
    expect(localizeCategoryName('Groceries', 'nb')).toBe('Dagligvarer');
    expect(localizeCategoryName('Groceries', 'nb-NO')).toBe('Dagligvarer');
    expect(localizeCategoryName('Groceries', 'no')).toBe('Dagligvarer');
    expect(localizeCategoryName('groceries', 'nb-NO')).toBe('Dagligvarer');
  });

  it('does not localize for non-Norwegian languages', () => {
    expect(localizeCategoryName('Groceries', 'en')).toBe('Groceries');
  });

  it('localizes Rent / Shared costs to Husleie/Fellesutgifter in Norwegian', () => {
    expect(localizeCategoryName('Rent / Shared costs', 'nb')).toBe('Husleie/Fellesutgifter');
  });
});
