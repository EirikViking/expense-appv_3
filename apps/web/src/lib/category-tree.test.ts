import { describe, expect, it } from 'vitest';
import type { CategoryTree } from '@expense/shared';
import { collectCategoryTreeIds, normalizeCategoryTree } from './category-tree';

describe('normalizeCategoryTree', () => {
  it('ensures every node has a children array', () => {
    const raw = [
      {
        id: 'a',
        name: 'A',
        parent_id: null,
        color: null,
        icon: null,
        sort_order: 1,
        created_at: '2026-02-14',
        is_transfer: false,
      } as unknown as CategoryTree,
    ];

    const normalized = normalizeCategoryTree(raw);
    expect(Array.isArray(normalized[0].children)).toBe(true);
    expect(normalized[0].children).toHaveLength(0);
  });
});

describe('collectCategoryTreeIds', () => {
  it('collects all ids recursively', () => {
    const tree: CategoryTree[] = [
      {
        id: 'root',
        name: 'Root',
        parent_id: null,
        color: null,
        icon: null,
        sort_order: 1,
        created_at: '2026-02-14',
        is_transfer: false,
        children: [
          {
            id: 'child',
            name: 'Child',
            parent_id: 'root',
            color: null,
            icon: null,
            sort_order: 1,
            created_at: '2026-02-14',
            is_transfer: false,
            children: [],
          },
        ],
      },
    ];

    const ids = collectCategoryTreeIds(tree);
    expect(ids.has('root')).toBe(true);
    expect(ids.has('child')).toBe(true);
    expect(ids.size).toBe(2);
  });
});

