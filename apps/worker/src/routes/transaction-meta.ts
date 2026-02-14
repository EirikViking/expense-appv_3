import { Hono } from 'hono';
import {
  updateTransactionMetaSchema,
  bulkSetTransactionCategorySchema,
  createSplitSchema,
  generateId,
  type TransactionSplit,
} from '@expense/shared';
import type { Env } from '../types';
import { getScopeUserId } from '../lib/request-scope';

const transactionMeta = new Hono<{ Bindings: Env }>();

async function hasScopedTransaction(db: D1Database, transactionId: string, userId: string): Promise<boolean> {
  const tx = await db
    .prepare('SELECT 1 FROM transactions WHERE id = ? AND user_id = ?')
    .bind(transactionId, userId)
    .first();
  return Boolean(tx);
}

transactionMeta.post('/bulk/category', async (c) => {
  try {
    const scopeUserId = getScopeUserId(c as any);
    if (!scopeUserId) return c.json({ error: 'Unauthorized' }, 401);

    const body = await c.req.json();
    const parsed = bulkSetTransactionCategorySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.message }, 400);
    }

    const { transaction_ids, category_id } = parsed.data;

    let desiredIsTransfer: boolean | null = null;
    if (category_id) {
      const cat = await c.env.DB
        .prepare('SELECT COALESCE(is_transfer, 0) as is_transfer FROM categories WHERE id = ?')
        .bind(category_id)
        .first<{ is_transfer: 0 | 1 }>();
      if (!cat) return c.json({ error: 'Category not found' }, 400);
      desiredIsTransfer = cat.is_transfer === 1;
    }

    const now = new Date().toISOString();
    const CHUNK_SIZE = 80;
    const chunks: string[][] = [];
    for (let i = 0; i < transaction_ids.length; i += CHUNK_SIZE) {
      chunks.push(transaction_ids.slice(i, i + CHUNK_SIZE));
    }

    let updated = 0;

    for (const ids of chunks) {
      const placeholders = ids.map(() => '?').join(',');
      const existing = await c.env.DB
        .prepare(`SELECT id FROM transactions WHERE user_id = ? AND id IN (${placeholders})`)
        .bind(scopeUserId, ...ids)
        .all<{ id: string }>();
      const existingIds = new Set((existing.results || []).map((r) => r.id));
      const missing = ids.filter((id) => !existingIds.has(id));
      if (missing.length > 0) {
        return c.json({ error: 'Some transactions were not found', missing }, 404);
      }

      const stmts = ids.map((id) =>
        c.env.DB.prepare(`
          INSERT INTO transaction_meta (transaction_id, category_id, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(transaction_id) DO UPDATE SET
            category_id = excluded.category_id,
            updated_at = excluded.updated_at
        `).bind(id, category_id, now)
      );

      await c.env.DB.batch(stmts);
      updated += ids.length;

      if (desiredIsTransfer !== null) {
        if (desiredIsTransfer) {
          await c.env.DB
            .prepare(`
              UPDATE transactions
              SET
                is_transfer = 1,
                is_excluded = 1,
                flow_type = 'transfer'
              WHERE user_id = ? AND id IN (${placeholders})
            `)
            .bind(scopeUserId, ...ids)
            .run();
        } else {
          await c.env.DB
            .prepare(`
              UPDATE transactions
              SET
                is_transfer = 0,
                is_excluded = CASE WHEN COALESCE(is_transfer, 0) = 1 THEN 0 ELSE is_excluded END,
                flow_type = CASE
                  WHEN amount < 0 THEN 'expense'
                  WHEN amount > 0 THEN 'income'
                  ELSE 'unknown'
                END
              WHERE user_id = ? AND id IN (${placeholders})
            `)
            .bind(scopeUserId, ...ids)
            .run();
        }
      }
    }

    return c.json({ success: true, updated });
  } catch (error) {
    console.error('Bulk category update error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

transactionMeta.patch('/:id', async (c) => {
  try {
    const scopeUserId = getScopeUserId(c as any);
    if (!scopeUserId) return c.json({ error: 'Unauthorized' }, 401);

    const transactionId = c.req.param('id');
    const body = await c.req.json();
    const parsed = updateTransactionMetaSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.message }, 400);
    }

    const tx = await c.env.DB
      .prepare('SELECT id, amount, COALESCE(is_transfer, 0) as is_transfer, COALESCE(is_excluded, 0) as is_excluded, flow_type FROM transactions WHERE id = ? AND user_id = ?')
      .bind(transactionId, scopeUserId)
      .first<{ id: string; amount: number; is_transfer: 0 | 1; is_excluded: 0 | 1; flow_type: string }>();

    if (!tx) {
      return c.json({ error: 'Transaction not found' }, 404);
    }

    const { category_id, merchant_id, notes, tag_ids } = parsed.data;

    if (category_id) {
      const exists = await c.env.DB.prepare('SELECT 1 FROM categories WHERE id = ?').bind(category_id).first();
      if (!exists) return c.json({ error: 'Category not found' }, 400);
    }

    if (merchant_id) {
      const exists = await c.env.DB.prepare('SELECT 1 FROM merchants WHERE id = ?').bind(merchant_id).first();
      if (!exists) return c.json({ error: 'Merchant not found' }, 400);
    }

    const now = new Date().toISOString();
    const existingMeta = await c.env.DB
      .prepare('SELECT 1 FROM transaction_meta WHERE transaction_id = ?')
      .bind(transactionId)
      .first();

    if (existingMeta) {
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
      await c.env.DB
        .prepare(`
          INSERT INTO transaction_meta (transaction_id, category_id, merchant_id, notes, is_recurring, updated_at)
          VALUES (?, ?, ?, ?, 0, ?)
        `)
        .bind(transactionId, category_id || null, merchant_id || null, notes || null, now)
        .run();
    }

    if (tag_ids !== undefined) {
      if (tag_ids.length > 0) {
        const placeholders = tag_ids.map(() => '?').join(',');
        const existingTags = await c.env.DB
          .prepare(`SELECT id FROM tags WHERE id IN (${placeholders})`)
          .bind(...tag_ids)
          .all<{ id: string }>();

        const existingTagIds = new Set((existingTags.results || []).map((t) => t.id));
        const invalidTags = tag_ids.filter((id) => !existingTagIds.has(id));
        if (invalidTags.length > 0) {
          return c.json({ error: 'Invalid tag IDs', invalid: invalidTags }, 400);
        }
      }

      await c.env.DB.prepare('DELETE FROM transaction_tags WHERE transaction_id = ?').bind(transactionId).run();
      for (const tagId of tag_ids) {
        await c.env.DB
          .prepare('INSERT INTO transaction_tags (transaction_id, tag_id, created_at) VALUES (?, ?, ?)')
          .bind(transactionId, tagId, now)
          .run();
      }
    }

    if (category_id !== undefined && category_id !== null) {
      const cat = await c.env.DB
        .prepare('SELECT COALESCE(is_transfer, 0) as is_transfer FROM categories WHERE id = ?')
        .bind(category_id)
        .first<{ is_transfer: 0 | 1 }>();

      const desiredIsTransfer = (cat?.is_transfer ?? 0) === 1;
      const currentIsTransfer = tx.is_transfer === 1;

      if (desiredIsTransfer !== currentIsTransfer) {
        const updates: string[] = ['is_transfer = ?'];
        const params: Array<string | number> = [desiredIsTransfer ? 1 : 0];

        if (desiredIsTransfer) {
          updates.push("flow_type = 'transfer'");
          if (tx.is_excluded === 0) updates.push('is_excluded = 1');
        } else {
          const amount = Number(tx.amount ?? 0);
          const inferred = amount < 0 ? 'expense' : amount > 0 ? 'income' : 'unknown';
          updates.push('flow_type = ?');
          params.push(inferred);
          if (tx.is_excluded === 1) updates.push('is_excluded = 0');
        }

        params.push(transactionId);
        await c.env.DB
          .prepare(`UPDATE transactions SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`)
          .bind(...params, scopeUserId)
          .run();
      }
    }

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
      is_recurring: (meta as any)?.is_recurring === 1,
      tags: tags.results || [],
    });
  } catch (error) {
    console.error('Transaction meta update error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

transactionMeta.post('/:id/tags/:tagId', async (c) => {
  try {
    const scopeUserId = getScopeUserId(c as any);
    if (!scopeUserId) return c.json({ error: 'Unauthorized' }, 401);

    const transactionId = c.req.param('id');
    const tagId = c.req.param('tagId');

    const tx = await c.env.DB
      .prepare('SELECT 1 FROM transactions WHERE id = ? AND user_id = ?')
      .bind(transactionId, scopeUserId)
      .first();
    if (!tx) return c.json({ error: 'Transaction not found' }, 404);

    const tag = await c.env.DB.prepare('SELECT 1 FROM tags WHERE id = ?').bind(tagId).first();
    if (!tag) return c.json({ error: 'Tag not found' }, 404);

    const now = new Date().toISOString();
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

transactionMeta.delete('/:id/tags/:tagId', async (c) => {
  try {
    const scopeUserId = getScopeUserId(c as any);
    if (!scopeUserId) return c.json({ error: 'Unauthorized' }, 401);

    const transactionId = c.req.param('id');
    const tagId = c.req.param('tagId');
    if (!(await hasScopedTransaction(c.env.DB, transactionId, scopeUserId))) {
      return c.json({ error: 'Transaction not found' }, 404);
    }

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

transactionMeta.get('/:id/splits', async (c) => {
  try {
    const scopeUserId = getScopeUserId(c as any);
    if (!scopeUserId) return c.json({ error: 'Unauthorized' }, 401);

    const transactionId = c.req.param('id');
    if (!(await hasScopedTransaction(c.env.DB, transactionId, scopeUserId))) {
      return c.json({ error: 'Transaction not found' }, 404);
    }

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

transactionMeta.post('/:id/splits', async (c) => {
  try {
    const scopeUserId = getScopeUserId(c as any);
    if (!scopeUserId) return c.json({ error: 'Unauthorized' }, 401);

    const transactionId = c.req.param('id');
    const body = await c.req.json();
    const parsed = createSplitSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.message }, 400);
    }

    const tx = await c.env.DB
      .prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?')
      .bind(transactionId, scopeUserId)
      .first<{ id: string; amount: number }>();
    if (!tx) return c.json({ error: 'Transaction not found' }, 404);

    const { splits } = parsed.data;
    const totalSplit = splits.reduce((sum, s) => sum + s.amount, 0);
    const tolerance = 0.01;
    if (Math.abs(totalSplit - Math.abs(tx.amount)) > tolerance) {
      return c.json(
        {
          error: 'Split amounts must equal transaction amount',
          transaction_amount: tx.amount,
          split_total: totalSplit,
        },
        400
      );
    }

    for (const split of splits) {
      if (split.category_id) {
        const exists = await c.env.DB.prepare('SELECT 1 FROM categories WHERE id = ?').bind(split.category_id).first();
        if (!exists) return c.json({ error: `Category not found: ${split.category_id}` }, 400);
      }
    }

    await c.env.DB.prepare('DELETE FROM transaction_splits WHERE parent_transaction_id = ?').bind(transactionId).run();

    const now = new Date().toISOString();
    const createdSplits: TransactionSplit[] = [];
    for (const split of splits) {
      const id = generateId();
      await c.env.DB
        .prepare(`
          INSERT INTO transaction_splits (id, parent_transaction_id, amount, category_id, description, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        .bind(id, transactionId, split.amount, split.category_id || null, split.description || null, now)
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

transactionMeta.delete('/:id/splits', async (c) => {
  try {
    const scopeUserId = getScopeUserId(c as any);
    if (!scopeUserId) return c.json({ error: 'Unauthorized' }, 401);

    const transactionId = c.req.param('id');
    if (!(await hasScopedTransaction(c.env.DB, transactionId, scopeUserId))) {
      return c.json({ error: 'Transaction not found' }, 404);
    }

    await c.env.DB.prepare('DELETE FROM transaction_splits WHERE parent_transaction_id = ?').bind(transactionId).run();
    return c.json({ success: true });
  } catch (error) {
    console.error('Delete splits error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

transactionMeta.post('/:id/recurring', async (c) => {
  try {
    const scopeUserId = getScopeUserId(c as any);
    if (!scopeUserId) return c.json({ error: 'Unauthorized' }, 401);

    const transactionId = c.req.param('id');
    const body = await c.req.json();
    const { recurring_id, is_recurring } = body;

    if (!(await hasScopedTransaction(c.env.DB, transactionId, scopeUserId))) {
      return c.json({ error: 'Transaction not found' }, 404);
    }

    const now = new Date().toISOString();
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
