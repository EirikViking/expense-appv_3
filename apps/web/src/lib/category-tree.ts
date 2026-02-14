import type { CategoryTree } from '@expense/shared';

export function normalizeCategoryTree(nodes: CategoryTree[] | undefined): CategoryTree[] {
  if (!Array.isArray(nodes)) return [];
  return nodes.map((node) => ({
    ...node,
    children: normalizeCategoryTree(node.children),
  }));
}

export function collectCategoryTreeIds(nodes: CategoryTree[]): Set<string> {
  const ids = new Set<string>();

  const walk = (items: CategoryTree[]) => {
    for (const node of items) {
      ids.add(node.id);
      if (node.children.length > 0) {
        walk(node.children);
      }
    }
  };

  walk(nodes);
  return ids;
}

