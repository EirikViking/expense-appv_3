import { Hono } from 'hono';
import {
  updateTransactionMetaSchema,
  createSplitSchema,
  generateId,
  type TransactionSplit,
} from '@expense/shared';
import type { Env } from '../types';

const transactionMeta = new Hono<{ Bindings: Env }>();

// Update transaction metadata (category, merchant, notes)
transactionMeta.patch('/:id', async (c) => {
  try {
    const transactionId = c.req.param('id');
    const body = await c.req.json();
    const parsed = updateTransactionMetaSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.message }, 400);
    }

    // Check transaction exists
    const tx = await c.env.DB
      .prepare('SELECT 1 FROM transactions WHERE id = ?')
      .bind(transactionId)
      .first();

    if (!tx) {
      return c.json({ error: 'Transaction not found' }, 404);
    }

    const { category_id, merchant_id, notes, tag_ids } = parsed.data;

    // Validate category exists if provided
    if (category_id) {
      const exists = await c.env.DB
        .prepare('SELECT 1 FROM categories WHERE id = ?')
        .bind(category_id)
        .first();
      if (!exists) {
        return c.json({ error: 'Category not found' }, 400);
      }
    }

    // Validate merchant exists if provided
    if (merchant_id) {
      const exists = await c.env.DB
        .prepare('SELECT 1 FROM merchants WHERE id = ?')
        .bind(merchant_id)
        .first();
      if (!exists) {
        return c.json({ error: 'Merchant not found' }, 400);
      }
    }

    const now = new Date().toISOString();

    // Check if meta exists
    const existingMeta = await c.env.DB
      .prepare('SELECT 1 FROM transaction_meta WHERE transaction_id = ?')
      .bind(transactionId)
      .first();

    if (existingMeta) {
      // Update existing
      const updates: string[] = ['updated_at = ?'];
      const params: (string | number | null)[] = [now];

      if (category_id !== undefined) {
        updates.push('category_id = ?');
        params.push(category_id);
      }
      if (merchant_id !== undefined) {
        updates.push('merchant_id = ?');
        params.push(merchant_id);
      }
      if (notes !== undefined) {
        updates.push('notes = ?');
        params.push(notes);
      }

      params.push(transactionId);
      await c.env.DB
        .prepare(`UPDATE transaction_meta SET ${updates.join(', ')} WHERE transaction_id = ?`)
        .bind(...params)
        .run();
    } else {
      // Insert new
      await c.env.DB
        .prepare(`
          INSERT INTO transaction_meta (transaction_id, category_id, merchant_id, notes, is_recurring, updated_at)
          VALUES (?, ?, ?, ?, 0, ?)
        `)
        .bind(
          transactionId,
          category_id || null,
          merchant_id || null,
          notes || null,
          now
        )
        .run();
    }

    // Handle tags if provided
    if (tag_ids !== undefined) {
      // Validate all tags exist
      if (tag_ids.length > 0) {
        const placeholders = tag_ids.map(() => '?').join(',');
        const existingTags = await c.env.DB
          .prepare(`SELECT id FROM tags WHERE id IN (${placeholders})`)
          .bind(...tag_ids)
          .all<{ id: string }>();

        const existingTagIds = new Set((existingTags.results || []).map(t => t.id));
        const invalidTags = tag_ids.filter(id => !existingTagIds.has(id));

        if (invalidTags.length > 0) {
          return c.json({ error: 'Invalid tag IDs', invalid: invalidTags }, 400);
        }
      }

      // Remove all existing tags
      await c.env.DB
        .prepare('DELETE FROM transaction_tags WHERE transaction_id = ?')
        .bind(transactionId)
        .run();

      // Add new tags
      for (const tagId of tag_ids) {
        await c.env.DB
          .prepare('INSERT INTO transaction_tags (transaction_id, tag_id, created_at) VALUES (?, ?, ?)')
          .bind(transactionId, tagId, now)
          .run();
      }
    }

    // Return updated data
    const meta = await c.env.DB
      .prepare(`
        SELECT
          tm.*,
          c.name as category_name,
          c.color as category_color,
          m.canonical_name as merchant_name
        FROM transaction_meta tm
        LEFT JOIN categories c ON tm.category_id = c.id
        LEFT JOIN merchants m ON tm.merchant_id = m.id
        WHERE tm.transaction_id = ?
      `)
      .bind(transactionId)
      .first();

    const tags = await c.env.DB
      .prepare(`
        SELECT t.id, t.name, t.color
        FROM transaction_tags tt
        JOIN tags t ON tt.tag_id = t.id
        WHERE tt.transaction_id = ?
      `)
      .bind(transactionId)
      .all<{ id: string; name: string; color: string | null }>();

    return c.json({
      ...meta,
      is_recurring: meta?.is_recurring === 1,
      tags: tags.results || [],
    });
  } catch (error) {
    console.error('Transaction meta update error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Add tag to transaction
transactionMeta.post('/:id/tags/:tagId', async (c) => {
  try {
    const transactionId = c.req.param('id');
    const tagId = c.req.param('tagId');

    // Check transaction exists
    const tx = await c.env.DB
      .prepare('SELECT 1 FROM transactions WHERE id = ?')
      .bind(transactionId)
      .first();

    if (!tx) {
      return c.json({ error: 'Transaction not found' }, 404);
    }

    // Check tag exists
    const tag = await c.env.DB
      .prepare('SELECT 1 FROM tags WHERE id = ?')
      .bind(tagId)
      .first();

    if (!tag) {
      return c.json({ error: 'Tag not found' }, 404);
    }

    const now = new Date().toISOString();

    // Add tag (ignore if already exists)
    await c.env.DB
      .prepare('INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id, created_at) VALUES (?, ?, ?)')
      .bind(transactionId, tagId, now)
      .run();

    return c.json({ success: true });
  } catch (error) {
    console.error('Add tag error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Remove tag from transaction
transactionMeta.delete('/:id/tags/:tagId', async (c) => {
  try {
    const transactionId = c.req.param('id');
    const tagId = c.req.param('tagId');

    await c.env.DB
      .prepare('DELETE FROM transaction_tags WHERE transaction_id = ? AND tag_id = ?')
      .bind(transactionId, tagId)
      .run();

    return c.json({ success: true });
  } catch (error) {
    console.error('Remove tag error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get transaction splits
transactionMeta.get('/:id/splits', async (c) => {
  try {
    const transactionId = c.req.param('id');

    const result = await c.env.DB
      .prepare(`
        SELECT ts.*, c.name as category_name, c.color as category_color
        FROM transaction_splits ts
        LEFT JOIN categories c ON ts.category_id = c.id
        WHERE ts.parent_transaction_id = ?
        ORDER BY ts.created_at
      `)
      .bind(transactionId)
      .all();

    return c.json({ splits: result.results || [] });
  } catch (error) {
    console.error('Get splits error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Create transaction split
transactionMeta.post('/:id/splits', async (c) => {
  try {
    const transactionId = c.req.param('id');
    const body = await c.req.json();
    const parsed = createSplitSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.message }, 400);
    }

    // Check transaction exists
    const tx = await c.env.DB
      .prepare('SELECT * FROM transactions WHERE id = ?')
      .bind(transactionId)
      .first<{ id: string; amount: number }>();

    if (!tx) {
      return c.json({ error: 'Transaction not found' }, 404);
    }

    const { splits } = parsed.data;

    // Validate split amounts sum to transaction amount (with small tolerance for rounding)
    const totalSplit = splits.reduce((sum, s) => sum + s.amount, 0);
    const tolerance = 0.01;
    if (Math.abs(totalSplit - Math.abs(tx.amount)) > tolerance) {
      return c.json({
        error: 'Split amounts must equal transaction amount',
        transaction_amount: tx.amount,
        split_total: totalSplit,
      }, 400);
    }

    // Validate categories exist
    for (const split of splits) {
      if (split.category_id) {
        const exists = await c.env.DB
          .prepare('SELECT 1 FROM categories WHERE id = ?')
          .bind(split.category_id)
          .first();
        if (!exists) {
          return c.json({ error: `Category not found: ${split.category_id}` }, 400);
        }
      }
    }

    // Delete existing splits
    await c.env.DB
      .prepare('DELETE FROM transaction_splits WHERE parent_transaction_id = ?')
      .bind(transactionId)
      .run();

    // Create new splits
    const now = new Date().toISOString();
    const createdSplits: TransactionSplit[] = [];

    for (const split of splits) {
      const id = generateId();
      await c.env.DB
        .prepare(`
          INSERT INTO transaction_splits (id, parent_transaction_id, amount, category_id, description, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        .bind(
          id,
          transactionId,
          split.amount,
          split.category_id || null,
          split.description || null,
          now
        )
        .run();

      createdSplits.push({
        id,
        parent_transaction_id: transactionId,
        amount: split.amount,
        category_id: split.category_id || null,
        description: split.description || null,
        created_at: now,
      });
    }

    return c.json({ splits: createdSplits }, 201);
  } catch (error) {
    console.error('Create splits error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Delete all splits for transaction
transactionMeta.delete('/:id/splits', async (c) => {
  try {
    const transactionId = c.req.param('id');

    await c.env.DB
      .prepare('DELETE FROM transaction_splits WHERE parent_transaction_id = ?')
      .bind(transactionId)
      .run();

    return c.json({ success: true });
  } catch (error) {
    console.error('Delete splits error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Mark transaction as recurring
transactionMeta.post('/:id/recurring', async (c) => {
  try {
    const transactionId = c.req.param('id');
    const body = await c.req.json();
    const { recurring_id, is_recurring } = body;

    // Check transaction exists
    const tx = await c.env.DB
      .prepare('SELECT 1 FROM transactions WHERE id = ?')
      .bind(transactionId)
      .first();

    if (!tx) {
      return c.json({ error: 'Transaction not found' }, 404);
    }

    const now = new Date().toISOString();

    // Check if meta exists
    const existingMeta = await c.env.DB
      .prepare('SELECT 1 FROM transaction_meta WHERE transaction_id = ?')
      .bind(transactionId)
      .first();

    if (existingMeta) {
      await c.env.DB
        .prepare(`
          UPDATE transaction_meta
          SET is_recurring = ?, recurring_id = ?, updated_at = ?
          WHERE transaction_id = ?
        `)
        .bind(is_recurring ? 1 : 0, recurring_id || null, now, transactionId)
        .run();
    } else {
      await c.env.DB
        .prepare(`
          INSERT INTO transaction_meta (transaction_id, is_recurring, recurring_id, updated_at)
          VALUES (?, ?, ?, ?)
        `)
        .bind(transactionId, is_recurring ? 1 : 0, recurring_id || null, now)
        .run();
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Mark recurring error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default transactionMeta;
