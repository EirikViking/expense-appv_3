import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORY_COLOR, resolveCategoryColor } from './category-color';

describe('resolveCategoryColor', () => {
  it('returns explicit valid color when present', () => {
    expect(resolveCategoryColor('#112233', '#abcdef')).toBe('#112233');
  });

  it('falls back to parent color when child color is missing', () => {
    expect(resolveCategoryColor('', '#abcdef')).toBe('#abcdef');
  });

  it('falls back to default when neither color is valid', () => {
    expect(resolveCategoryColor(undefined, '')).toBe(DEFAULT_CATEGORY_COLOR);
  });
});
