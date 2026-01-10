import type { CategoryBreakdown } from '@expense/shared';

export interface CategoryRow {
  category_id: string | null;
  category_name: string;
  category_color: string | null;
  parent_id: string | null;
  total: number;
  count: number;
}

export function buildCategoryBreakdown(rows: CategoryRow[]): {
  categories: CategoryBreakdown[];
  total: number;
} {
  const total = rows.reduce((sum, row) => sum + row.total, 0);

  const categories: CategoryBreakdown[] = rows.map((row) => ({
    category_id: row.category_id,
    category_name: row.category_name,
    category_color: row.category_color,
    parent_id: row.parent_id,
    total: row.total,
    count: row.count,
    percentage: total > 0 ? (row.total / total) * 100 : 0,
  }));

  return { categories, total };
}
