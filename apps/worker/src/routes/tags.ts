import { Hono } from 'hono';
import {
  createTagSchema,
  updateTagSchema,
  generateId,
  type Tag,
  type TagsResponse,
} from '@expense/shared';
import type { Env } from '../types';

const tags = new Hono<{ Bindings: Env }>();

// Get all tags
tags.get('/', async (c) => {
  try {
    const result = await c.env.DB
      .prepare('SELECT * FROM tags ORDER BY name')
      .all<Tag>();

    const response: TagsResponse = {
      tags: result.results || [],
    };

    return c.json(response);
  } catch (error) {
    console.error('Tags list error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get single tag
tags.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');

    const result = await c.env.DB
      .prepare('SELECT * FROM tags WHERE id = ?')
      .bind(id)
      .first<Tag>();

    if (!result) {
      return c.json({ error: 'Tag not found' }, 404);
    }

    return c.json(result);
  } catch (error) {
    console.error('Tag get error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Create tag
tags.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = createTagSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.message }, 400);
    }

    const { name, color } = parsed.data;

    // Check for duplicate name
    const existing = await c.env.DB
      .prepare('SELECT 1 FROM tags WHERE name = ?')
      .bind(name)
      .first();

    if (existing) {
      return c.json({ error: 'Tag with this name already exists' }, 400);
    }

    const id = generateId();
    const now = new Date().toISOString();

    await c.env.DB
      .prepare('INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)')
      .bind(id, name, color || null, now)
      .run();

    const created = await c.env.DB
      .prepare('SELECT * FROM tags WHERE id = ?')
      .bind(id)
      .first<Tag>();

    return c.json(created, 201);
  } catch (error) {
    console.error('Tag create error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Update tag
tags.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = updateTagSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.message }, 400);
    }

    const existing = await c.env.DB
      .prepare('SELECT * FROM tags WHERE id = ?')
      .bind(id)
      .first<Tag>();

    if (!existing) {
      return c.json({ error: 'Tag not found' }, 404);
    }

    const { name, color } = parsed.data;

    // Check for duplicate name if changing
    if (name && name !== existing.name) {
      const duplicate = await c.env.DB
        .prepare('SELECT 1 FROM tags WHERE name = ? AND id != ?')
        .bind(name, id)
        .first();

      if (duplicate) {
        return c.json({ error: 'Tag with this name already exists' }, 400);
      }
    }

    const updates: string[] = [];
    const params: (string | null)[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    if (color !== undefined) {
      updates.push('color = ?');
      params.push(color);
    }

    if (updates.length > 0) {
      params.push(id);
      await c.env.DB
        .prepare(`UPDATE tags SET ${updates.join(', ')} WHERE id = ?`)
        .bind(...params)
        .run();
    }

    const updated = await c.env.DB
      .prepare('SELECT * FROM tags WHERE id = ?')
      .bind(id)
      .first<Tag>();

    return c.json(updated);
  } catch (error) {
    console.error('Tag update error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Delete tag
tags.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');

    const result = await c.env.DB
      .prepare('DELETE FROM tags WHERE id = ?')
      .bind(id)
      .run();

    if (result.meta.changes === 0) {
      return c.json({ error: 'Tag not found' }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Tag delete error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default tags;
