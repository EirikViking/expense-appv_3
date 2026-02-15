import { describe, expect, it } from 'vitest';
import { getCategoryChartColor } from './category-chart-colors';

describe('category chart colors', () => {
  it('produces unique colors for 30 distinct category names', () => {
    const names = Array.from({ length: 30 }, (_, i) => `category-${i + 1}`);
    const colors = names.map((name) => getCategoryChartColor(name));
    const unique = new Set(colors);
    expect(unique.size).toBe(colors.length);
  });
});
