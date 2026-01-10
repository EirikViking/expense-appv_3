import { describe, it, expect } from 'vitest';
import { buildCategoryBreakdown } from './analytics';

describe('buildCategoryBreakdown', () => {
  it('preserves categorized rows and computes percentages', () => {
    const rows = [
      {
        category_id: 'cat_food',
        category_name: 'Food & Dining',
        category_color: '#ef4444',
        parent_id: null,
        total: 200,
        count: 2,
      },
      {
        category_id: null,
        category_name: 'Uncategorized',
        category_color: null,
        parent_id: null,
        total: 100,
        count: 1,
      },
    ];

    const result = buildCategoryBreakdown(rows);

    expect(result.total).toBe(300);
    expect(result.categories).toHaveLength(2);
    expect(result.categories.some((row) => row.category_name !== 'Uncategorized')).toBe(true);

    const foodRow = result.categories.find((row) => row.category_id === 'cat_food');
    expect(foodRow?.percentage).toBeCloseTo((200 / 300) * 100, 2);
  });
});
