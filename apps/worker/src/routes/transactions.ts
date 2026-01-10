import { Hono } from 'hono';
import {
  transactionsQuerySchema,
  createTransactionSchema,
  computeTxHash,
  generateId,
  type Transaction,
  type TransactionWithMeta,
  type TransactionsResponse,
  DEFAULT_PAGE_SIZE,
} from '@expense/shared';
import type { Env } from '../types';
import { applyRulesToTransaction, getEnabledRules } from '../lib/rule-engine';

const transactions = new Hono<{ Bindings: Env }>();

// Helper to enrich transactions with metadata
async function enrichTransactions(
  db: D1Database,
  txs: Transaction[]
): Promise<TransactionWithMeta[]> {
  if (txs.length === 0) return [];

  const txIds = txs.map(t => t.id);
  const placeholders = txIds.map(() => '?').join(',');

  // Get metadata for all transactions
  const metaQuery = `
    SELECT
      tm.transaction_id,
      tm.category_id,
      tm.merchant_id,
      tm.notes,
      tm.is_recurring,
      c.name as category_name,
      c.color as category_color,
      m.canonical_name as merchant_name
    FROM transaction_meta tm
    LEFT JOIN categories c ON tm.category_id = c.id
    LEFT JOIN merchants m ON tm.merchant_id = m.id
    WHERE tm.transaction_id IN (${placeholders})
  `;

  const metaResults = await db.prepare(metaQuery).bind(...txIds).all<{
    transaction_id: string;
    category_id: string | null;
    merchant_id: string | null;
    notes: string | null;
    is_recurring: number;
    category_name: string | null;
    category_color: string | null;
    merchant_name: string | null;
  }>();

  const metaMap = new Map(
    (metaResults.results || []).map(m => [m.transaction_id, m])
  );

  // Get tags for all transactions
  const tagsQuery = `
    SELECT tt.transaction_id, t.id, t.name, t.color
    FROM transaction_tags tt
    JOIN tags t ON tt.tag_id = t.id
    WHERE tt.transaction_id IN (${placeholders})
  `;

  const tagsResults = await db.prepare(tagsQuery).bind(...txIds).all<{
    transaction_id: string;
    id: string;
    name: string;
    color: string | null;
  }>();

  const tagsMap = new Map<string, Array<{ id: string; name: string; color: string | null }>>();
  for (const tag of tagsResults.results || []) {
    const existing = tagsMap.get(tag.transaction_id) || [];
    existing.push({ id: tag.id, name: tag.name, color: tag.color });
    tagsMap.set(tag.transaction_id, existing);
  }

  // Get source filenames
  const fileHashes = [...new Set(txs.map(t => t.source_file_hash).filter(Boolean))];
  let filesMap = new Map<string, string>();

  if (fileHashes.length > 0) {
    const filePlaceholders = fileHashes.map(() => '?').join(',');
    const filesQuery = `SELECT file_hash, original_filename FROM ingested_files WHERE file_hash IN (${filePlaceholders})`;
    const filesResult = await db.prepare(filesQuery).bind(...fileHashes).all<{ file_hash: string; original_filename: string }>();
    filesMap = new Map((filesResult.results || []).map(f => [f.file_hash, f.original_filename]));
  }

  // Enrich transactions
  return txs.map(tx => {
    const meta = metaMap.get(tx.id);
    const tags = tagsMap.get(tx.id) || [];
    const sourceFilename = filesMap.get(tx.source_file_hash);

    return {
      ...tx,
      category_id: meta?.category_id || null,
      category_name: meta?.category_name || null,
      category_color: meta?.category_color || null,
      merchant_id: meta?.merchant_id || null,
      merchant_name: meta?.merchant_name || null,
      notes: meta?.notes || null,
      is_recurring: meta?.is_recurring === 1,
      source_filename: sourceFilename || null,
      tags,
    };
  });
}

transactions.get('/', async (c) => {
  try {
    const query = c.req.query();
    const parsed = transactionsQuerySchema.safeParse(query);

    if (!parsed.success) {
      return c.json({ error: 'Invalid query parameters', details: parsed.error.message }, 400);
    }

    const {
      date_from,
      date_to,
      status,
      source_type,
      category_id,
      tag_id,
      merchant_id,
      merchant_name,
      min_amount,
      max_amount,
      search,
      limit,
      offset,
      sort_by,
      sort_order,
    } = parsed.data;

    // Build query dynamically
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (date_from) {
      conditions.push('t.tx_date >= ?');
      params.push(date_from);
    }

    if (date_to) {
      conditions.push('t.tx_date <= ?');
      params.push(date_to);
    }

    if (status) {
      conditions.push('t.status = ?');
      params.push(status);
    }

    if (source_type) {
      conditions.push('t.source_type = ?');
      params.push(source_type);
    }

    if (min_amount !== undefined) {
      conditions.push('t.amount >= ?');
      params.push(min_amount);
    }

    if (max_amount !== undefined) {
      conditions.push('t.amount <= ?');
      params.push(max_amount);
    }

    if (search) {
      conditions.push('t.description LIKE ?');
      params.push(`%${search}%`);
    }

    // Join conditions for category/tag/merchant filtering
    let joinClause = '';
    if (category_id) {
      joinClause += ' LEFT JOIN transaction_meta tm ON t.id = tm.transaction_id';
      conditions.push('tm.category_id = ?');
      params.push(category_id);
    }

    if (tag_id) {
      joinClause += ' LEFT JOIN transaction_tags tt ON t.id = tt.transaction_id';
      conditions.push('tt.tag_id = ?');
      params.push(tag_id);
    }

    if (merchant_id) {
      if (!joinClause.includes('transaction_meta')) {
        joinClause += ' LEFT JOIN transaction_meta tm ON t.id = tm.transaction_id';
      }
      conditions.push('tm.merchant_id = ?');
      params.push(merchant_id);
    }

    if (merchant_name) {
      // Join merchants to match canonical name OR raw description, mirroring the aggregate logic
      if (!joinClause.includes('transaction_meta')) {
        joinClause += ' LEFT JOIN transaction_meta tm ON t.id = tm.transaction_id';
      }
      // We also need merchants table joined to check canonical_name
      // Note: enrichTransactions does this later, but we need it here for filtering
      // check if we can join merchants easily.
      // Wait, we can't easily join 'merchants' here without conflicting with potential future logic?
      // Actually, we can just LEFT JOIN merchants m ON tm.merchant_id = m.id
      // But we need to make sure we don't double join if we add other filters later.
      // For now, let's just add it to joinClause if not present.

      const merchantsJoin = ' LEFT JOIN merchants m ON tm.merchant_id = m.id';
      if (!joinClause.includes('merchants m')) {
        joinClause += merchantsJoin;
      }

      conditions.push('COALESCE(m.canonical_name, TRIM(t.description)) = ?');
      params.push(merchant_name.trim());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Map sort_by to column
    const sortColumn = sort_by === 'amount' ? 't.amount' : sort_by === 'description' ? 't.description' : 't.tx_date';
    const sortDirection = sort_order === 'asc' ? 'ASC' : 'DESC';

    // Get total count
    const countQuery = `SELECT COUNT(DISTINCT t.id) as total FROM transactions t ${joinClause} ${whereClause}`;
    const countResult = await c.env.DB.prepare(countQuery).bind(...params).first<{ total: number }>();
    const total = countResult?.total || 0;

    // Get transactions with pagination
    const selectQuery = `
      SELECT DISTINCT t.* FROM transactions t
      ${joinClause}
      ${whereClause}
      ORDER BY ${sortColumn} ${sortDirection}, t.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const results = await c.env.DB.prepare(selectQuery)
      .bind(...params, limit, offset)
      .all<Transaction>();

    // Enrich with metadata
    const enrichedTransactions = await enrichTransactions(c.env.DB, results.results || []);

    const response: TransactionsResponse = {
      transactions: enrichedTransactions,
      total,
      page: Math.floor(offset / limit) + 1,
      page_size: limit,
    };

    return c.json(response);
  } catch (error) {
    console.error('Transactions query error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get single transaction with full details
transactions.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');

    const result = await c.env.DB.prepare(
      'SELECT * FROM transactions WHERE id = ?'
    ).bind(id).first<Transaction>();

    if (!result) {
      return c.json({ error: 'Transaction not found' }, 404);
    }

    const enriched = await enrichTransactions(c.env.DB, [result]);
    return c.json(enriched[0]);
  } catch (error) {
    console.error('Transaction get error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Create manual transaction
transactions.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = createTransactionSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.message }, 400);
    }

    const { date, amount, description, category_id, merchant_id, notes } = parsed.data;

    const id = generateId();
    const now = new Date().toISOString();
    const txHash = await computeTxHash(date, description, amount, 'manual');
    const sourceFileHash = await computeTxHash(date, `${description}-manual`, amount, 'manual');

    const duplicate = await c.env.DB
      .prepare('SELECT 1 FROM transactions WHERE tx_hash = ?')
      .bind(txHash)
      .first();
    if (duplicate) {
      return c.json({ error: 'Duplicate transaction', code: 'duplicate_transaction' }, 409);
    }

    await c.env.DB.prepare(`
      INSERT OR IGNORE INTO ingested_files (id, file_hash, source_type, original_filename, uploaded_at, metadata_json)
      VALUES (?, ?, 'manual', ?, ?, ?)
    `).bind(
      generateId(),
      sourceFileHash,
      'Manual entry',
      now,
      JSON.stringify({ source: 'manual', created_at: now })
    ).run();

    // Insert transaction
    await c.env.DB.prepare(`
      INSERT INTO transactions
        (id, tx_hash, tx_date, booked_date, description, merchant, amount, currency, status, source_type, source_file_hash, raw_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'NOK', 'booked', 'manual', ?, ?, ?)
    `).bind(
      id,
      txHash,
      date,
      date,
      description,
      null,
      amount,
      sourceFileHash,
      JSON.stringify({ source: 'manual', notes: notes || null }),
      now
    ).run();

    // Insert meta
    if (category_id || merchant_id || notes) {
      await c.env.DB.prepare(`
        INSERT INTO transaction_meta (transaction_id, category_id, merchant_id, notes, is_recurring, updated_at)
        VALUES (?, ?, ?, ?, 0, ?)
      `).bind(id, category_id || null, merchant_id || null, notes || null, now).run();
    } else {
      const rules = await getEnabledRules(c.env.DB);
      if (rules.length > 0) {
        await applyRulesToTransaction(c.env.DB, {
          id,
          tx_hash: txHash,
          tx_date: date,
          booked_date: date,
          description,
          merchant: null,
          amount,
          currency: 'NOK',
          status: 'booked',
          source_type: 'manual',
          source_file_hash: sourceFileHash,
          raw_json: JSON.stringify({ source: 'manual' }),
          created_at: now,
          is_excluded: false,
        }, rules);
      }
    }

    // Return the enriched transaction
    const newTx = await c.env.DB.prepare('SELECT * FROM transactions WHERE id = ?').bind(id).first<Transaction>();
    if (!newTx) {
      return c.json({ error: 'Failed to create transaction' }, 500);
    }

    const enriched = await enrichTransactions(c.env.DB, [newTx]);
    return c.json(enriched[0], 201);
  } catch (error) {
    console.error('Create transaction error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Delete specific transaction
transactions.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');

    // Check if exists
    const exists = await c.env.DB.prepare('SELECT id FROM transactions WHERE id = ?').bind(id).first();
    if (!exists) {
      return c.json({ error: 'Transaction not found' }, 404);
    }

    // Delete (cascade should handle meta/tags if set up, but let's be safe)
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM transaction_meta WHERE transaction_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM transaction_tags WHERE transaction_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM transactions WHERE id = ?').bind(id)
    ]);

    return c.json({ success: true });
  } catch (error) {
    console.error('Delete transaction error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Exclude a single transaction from analytics
transactions.post('/:id/exclude', async (c) => {
  try {
    const id = c.req.param('id');

    const result = await c.env.DB.prepare(
      'UPDATE transactions SET is_excluded = 1 WHERE id = ?'
    ).bind(id).run();

    if (result.meta.changes === 0) {
      return c.json({ error: 'Transaction not found' }, 404);
    }

    return c.json({ success: true, id, is_excluded: true });
  } catch (error) {
    console.error('Exclude transaction error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Include a transaction back into analytics
transactions.post('/:id/include', async (c) => {
  try {
    const id = c.req.param('id');

    const result = await c.env.DB.prepare(
      'UPDATE transactions SET is_excluded = 0 WHERE id = ?'
    ).bind(id).run();

    if (result.meta.changes === 0) {
      return c.json({ error: 'Transaction not found' }, 404);
    }

    return c.json({ success: true, id, is_excluded: false });
  } catch (error) {
    console.error('Include transaction error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Bulk exclude transactions by criteria
transactions.post('/bulk/exclude', async (c) => {
  try {
    const body = await c.req.json() as {
      transaction_ids?: string[];
      amount_threshold?: number; // Exclude transactions >= this absolute amount
      merchant_name?: string;
    };

    const { transaction_ids, amount_threshold, merchant_name } = body;

    let updated = 0;

    if (transaction_ids && transaction_ids.length > 0) {
      // Exclude specific transactions
      const placeholders = transaction_ids.map(() => '?').join(',');
      const result = await c.env.DB.prepare(
        `UPDATE transactions SET is_excluded = 1 WHERE id IN (${placeholders})`
      ).bind(...transaction_ids).run();
      updated = result.meta.changes || 0;
    } else if (amount_threshold !== undefined) {
      // Exclude by amount threshold (absolute value)
      const result = await c.env.DB.prepare(
        'UPDATE transactions SET is_excluded = 1 WHERE ABS(amount) >= ?'
      ).bind(amount_threshold).run();
      updated = result.meta.changes || 0;
    } else if (merchant_name) {
      // Exclude by merchant name (matches description)
      const result = await c.env.DB.prepare(
        'UPDATE transactions SET is_excluded = 1 WHERE description LIKE ?'
      ).bind(`%${merchant_name}%`).run();
      updated = result.meta.changes || 0;
    } else {
      return c.json({ error: 'No criteria provided. Use transaction_ids, amount_threshold, or merchant_name.' }, 400);
    }

    return c.json({ success: true, updated });
  } catch (error) {
    console.error('Bulk exclude error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Bulk include (un-exclude) transactions
transactions.post('/bulk/include', async (c) => {
  try {
    const body = await c.req.json() as {
      transaction_ids?: string[];
      all?: boolean; // Include all excluded transactions back
    };

    const { transaction_ids, all } = body;

    let updated = 0;

    if (all === true) {
      // Un-exclude all transactions
      const result = await c.env.DB.prepare(
        'UPDATE transactions SET is_excluded = 0 WHERE is_excluded = 1'
      ).run();
      updated = result.meta.changes || 0;
    } else if (transaction_ids && transaction_ids.length > 0) {
      // Include specific transactions
      const placeholders = transaction_ids.map(() => '?').join(',');
      const result = await c.env.DB.prepare(
        `UPDATE transactions SET is_excluded = 0 WHERE id IN (${placeholders})`
      ).bind(...transaction_ids).run();
      updated = result.meta.changes || 0;
    } else {
      return c.json({ error: 'No criteria provided. Use transaction_ids or all=true.' }, 400);
    }

    return c.json({ success: true, updated });
  } catch (error) {
    console.error('Bulk include error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Reset all data (DANGER)
transactions.delete('/admin/reset', async (c) => {
  try {
    // Verify some secret or just allow it? User requested it.
    // Ideally requires a confirmation flag in body?
    const { confirm } = await c.req.json() as { confirm: boolean };
    if (confirm !== true) {
      return c.json({ error: 'Confirmation required' }, 400);
    }

    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM transaction_meta'),
      c.env.DB.prepare('DELETE FROM transaction_tags'),
      c.env.DB.prepare('DELETE FROM transactions'),
      c.env.DB.prepare('DELETE FROM ingested_files'),
      // Also clear budgets and rules?? User said "delete all data".
      // Maybe not config? I'll stick to transaction data for now.
    ]);

    return c.json({ success: true, message: 'All transaction data deleted' });
  } catch (error) {
    console.error('Reset error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default transactions;
