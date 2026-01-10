import type { CategoryBreakdown } from '@expense/shared';

export interface CategoryRow {
  category_id: string | null;
  category_name: string;
  category_color: string | null;
  parent_id: string | null;
  total: number;
  count: number;
}

export function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'string') {
    const cleaned = value.trim().replace(/\s/g, '').replace(',', '.');
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : 0;
  }
  return 0;
}

export function buildCategoryBreakdown(rows: CategoryRow[]): {
  categories: CategoryBreakdown[];
  total: number;
} {
  const total = rows.reduce((sum, row) => sum + toNumber(row.total), 0);

  const categories: CategoryBreakdown[] = rows.map((row) => {
    const rowTotal = toNumber(row.total);
    return {
      category_id: row.category_id,
      category_name: row.category_name,
      category_color: row.category_color,
      parent_id: row.parent_id,
      total: rowTotal,
      count: toNumber(row.count),
      percentage: total > 0 ? (rowTotal / total) * 100 : 0,
    };
  });

  return { categories, total };
}
