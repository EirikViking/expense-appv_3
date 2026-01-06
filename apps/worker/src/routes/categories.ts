import { Hono } from 'hono';
import {
  createCategorySchema,
  updateCategorySchema,
  generateId,
  type Category,
  type CategoryWithChildren,
  type CategoriesResponse,
} from '@expense/shared';
import type { Env } from '../types';

const categories = new Hono<{ Bindings: Env }>();

// Build category tree from flat list
function buildCategoryTree(categories: Category[]): CategoryWithChildren[] {
  const categoryMap = new Map<string, CategoryWithChildren>();
  const roots: CategoryWithChildren[] = [];

  // First pass: create all nodes
  for (const cat of categories) {
    categoryMap.set(cat.id, { ...cat, children: [] });
  }

  // Second pass: build tree
  for (const cat of categories) {
    const node = categoryMap.get(cat.id)!;
    if (cat.parent_id && categoryMap.has(cat.parent_id)) {
      categoryMap.get(cat.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children by sort_order
  const sortChildren = (nodes: CategoryWithChildren[]) => {
    nodes.sort((a, b) => a.sort_order - b.sort_order);
    for (const node of nodes) {
      sortChildren(node.children);
    }
  };
  sortChildren(roots);

  return roots;
}

// Get all categories as tree
categories.get('/', async (c) => {
  try {
    const result = await c.env.DB
      .prepare('SELECT * FROM categories ORDER BY sort_order, name')
      .all<Category>();

    const flatCategories = result.results || [];
    const tree = buildCategoryTree(flatCategories);

    const response: CategoriesResponse = {
      categories: flatCategories,
      tree: tree,
    };

    return c.json(response);
  } catch (error) {
    console.error('Categories list error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get flat list of categories (for dropdowns)
categories.get('/flat', async (c) => {
  try {
    const result = await c.env.DB
      .prepare('SELECT * FROM categories ORDER BY sort_order, name')
      .all<Category>();

    return c.json({ categories: result.results || [] });
  } catch (error) {
    console.error('Categories flat list error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get single category
categories.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');

    const result = await c.env.DB
      .prepare('SELECT * FROM categories WHERE id = ?')
      .bind(id)
      .first<Category>();

    if (!result) {
      return c.json({ error: 'Category not found' }, 404);
    }

    return c.json(result);
  } catch (error) {
    console.error('Category get error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Create category
categories.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = createCategorySchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.message }, 400);
    }

    const { name, parent_id, color, icon, sort_order } = parsed.data;

    // Validate parent exists if provided
    if (parent_id) {
      const parent = await c.env.DB
        .prepare('SELECT 1 FROM categories WHERE id = ?')
        .bind(parent_id)
        .first();

      if (!parent) {
        return c.json({ error: 'Parent category not found' }, 400);
      }
    }

    const id = generateId();
    const now = new Date().toISOString();

    await c.env.DB
      .prepare(`
        INSERT INTO categories (id, name, parent_id, color, icon, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(id, name, parent_id || null, color || null, icon || null, sort_order, now)
      .run();

    const created = await c.env.DB
      .prepare('SELECT * FROM categories WHERE id = ?')
      .bind(id)
      .first<Category>();

    return c.json(created, 201);
  } catch (error) {
    console.error('Category create error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Update category
categories.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = updateCategorySchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.message }, 400);
    }

    // Check category exists
    const existing = await c.env.DB
      .prepare('SELECT * FROM categories WHERE id = ?')
      .bind(id)
      .first<Category>();

    if (!existing) {
      return c.json({ error: 'Category not found' }, 404);
    }

    const { name, parent_id, color, icon, sort_order } = parsed.data;

    // Prevent circular reference
    if (parent_id === id) {
      return c.json({ error: 'Category cannot be its own parent' }, 400);
    }

    // Validate parent exists if provided
    if (parent_id) {
      const parent = await c.env.DB
        .prepare('SELECT 1 FROM categories WHERE id = ?')
        .bind(parent_id)
        .first();

      if (!parent) {
        return c.json({ error: 'Parent category not found' }, 400);
      }
    }

    // Build update query
    const updates: string[] = [];
    const params: (string | number | null)[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    if (parent_id !== undefined) {
      updates.push('parent_id = ?');
      params.push(parent_id);
    }
    if (color !== undefined) {
      updates.push('color = ?');
      params.push(color);
    }
    if (icon !== undefined) {
      updates.push('icon = ?');
      params.push(icon);
    }
    if (sort_order !== undefined) {
      updates.push('sort_order = ?');
      params.push(sort_order);
    }

    if (updates.length > 0) {
      params.push(id);
      await c.env.DB
        .prepare(`UPDATE categories SET ${updates.join(', ')} WHERE id = ?`)
        .bind(...params)
        .run();
    }

    const updated = await c.env.DB
      .prepare('SELECT * FROM categories WHERE id = ?')
      .bind(id)
      .first<Category>();

    return c.json(updated);
  } catch (error) {
    console.error('Category update error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Delete category
categories.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');

    // Check if category has children
    const hasChildren = await c.env.DB
      .prepare('SELECT 1 FROM categories WHERE parent_id = ?')
      .bind(id)
      .first();

    if (hasChildren) {
      return c.json({ error: 'Cannot delete category with children' }, 400);
    }

    // Delete - foreign keys will handle nullifying references
    const result = await c.env.DB
      .prepare('DELETE FROM categories WHERE id = ?')
      .bind(id)
      .run();

    if (result.meta.changes === 0) {
      return c.json({ error: 'Category not found' }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Category delete error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default categories;
