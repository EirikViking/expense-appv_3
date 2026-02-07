import { Hono } from 'hono';
import {
  transactionsQuerySchema,
  createTransactionSchema,
  updateTransactionSchema,
  computeTxHash,
  generateId,
  type Transaction,
  type TransactionWithMeta,
  type TransactionsResponse,
  DEFAULT_PAGE_SIZE,
} from '@expense/shared';
import type { Env } from '../types';
import { applyRulesToTransaction, getEnabledRules } from '../lib/rule-engine';
import { detectIsTransfer } from '../lib/transfer-detect';
import { extractMerchantFromPdfLine, parsePdfTransactionLine } from '../lib/pdf-parser';
import { extractSectionLabelFromRawJson, isPaymentLikeRow, isPurchaseSection, isRefundLike } from '../lib/xlsx-normalize';
import { normalizeXlsxAmountForIngest } from '../lib/xlsx-normalize';
import { classifyFlowType, normalizeAmountAndFlags } from '../lib/flow-classify';

const transactions = new Hono<{ Bindings: Env }>();

type DbBool = 0 | 1;
type DbTransactionRow = Omit<Transaction, 'is_excluded' | 'is_transfer'> & {
  is_excluded: DbBool;
  is_transfer: DbBool;
};

// Helper to enrich transactions with metadata
async function enrichTransactions(
  db: D1Database,
  txs: DbTransactionRow[]
): Promise<TransactionWithMeta[]> {
  if (txs.length === 0) return [];

  // D1/SQLite variable limits can be lower than local SQLite defaults.
  // Chunk IN(...) queries to avoid "too many SQL variables" 500s when limit is large (e.g. 200+).
  const CHUNK_SIZE = 80;
  const chunk = <T,>(arr: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  const txIds = txs.map(t => t.id);
  const metaMap = new Map<
    string,
    {
      transaction_id: string;
      category_id: string | null;
      merchant_id: string | null;
      notes: string | null;
      is_recurring: number;
      category_name: string | null;
      category_color: string | null;
      merchant_name: string | null;
    }
  >();

  for (const ids of chunk(txIds, CHUNK_SIZE)) {
    const placeholders = ids.map(() => '?').join(',');
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

    const metaResults = await db.prepare(metaQuery).bind(...ids).all<{
      transaction_id: string;
      category_id: string | null;
      merchant_id: string | null;
      notes: string | null;
      is_recurring: number;
      category_name: string | null;
      category_color: string | null;
      merchant_name: string | null;
    }>();

    for (const m of metaResults.results || []) {
      metaMap.set(m.transaction_id, m);
    }
  }

  // Get tags for all transactions
  const tagsMap = new Map<string, Array<{ id: string; name: string; color: string | null }>>();
  for (const ids of chunk(txIds, CHUNK_SIZE)) {
    const placeholders = ids.map(() => '?').join(',');
    const tagsQuery = `
      SELECT tt.transaction_id, t.id, t.name, t.color
      FROM transaction_tags tt
      JOIN tags t ON tt.tag_id = t.id
      WHERE tt.transaction_id IN (${placeholders})
    `;
    const tagsResults = await db.prepare(tagsQuery).bind(...ids).all<{
      transaction_id: string;
      id: string;
      name: string;
      color: string | null;
    }>();

    for (const tag of tagsResults.results || []) {
      const existing = tagsMap.get(tag.transaction_id) || [];
      existing.push({ id: tag.id, name: tag.name, color: tag.color });
      tagsMap.set(tag.transaction_id, existing);
    }
  }

  // Get source filenames
  const fileHashes = [...new Set(txs.map(t => t.source_file_hash).filter(Boolean))];
  let filesMap = new Map<string, string>();

  if (fileHashes.length > 0) {
    for (const hashes of chunk(fileHashes, CHUNK_SIZE)) {
      const filePlaceholders = hashes.map(() => '?').join(',');
      const filesQuery = `SELECT file_hash, original_filename FROM ingested_files WHERE file_hash IN (${filePlaceholders})`;
      const filesResult = await db.prepare(filesQuery).bind(...hashes).all<{ file_hash: string; original_filename: string }>();
      for (const f of filesResult.results || []) {
        filesMap.set(f.file_hash, f.original_filename);
      }
    }
  }

  // Enrich transactions
  return txs.map(tx => {
    const meta = metaMap.get(tx.id);
    const tags = tagsMap.get(tx.id) || [];
    const sourceFilename = filesMap.get(tx.source_file_hash);

    return {
      ...tx,
      is_excluded: tx.is_excluded === 1,
      is_transfer: tx.is_transfer === 1,
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
      flow_type,
      include_transfers,
      include_excluded,
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

    if (flow_type) {
      conditions.push('t.flow_type = ?');
      params.push(flow_type);
    }

    // Hide excluded rows by default. If include_transfers is enabled, still show transfers even though they are marked excluded.
    if (!include_excluded) {
      if (include_transfers) {
        conditions.push('(COALESCE(t.is_excluded, 0) = 0 OR COALESCE(t.is_transfer, 0) = 1 OR t.flow_type = \'transfer\')');
      } else {
        conditions.push('COALESCE(t.is_excluded, 0) = 0');
      }
    }

    if (!include_transfers) {
      conditions.push('COALESCE(t.is_transfer, 0) = 0');
      conditions.push("t.flow_type != 'transfer'");
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

      // "merchant_name" comes from aggregated views (dashboard/insights) and often represents a store name
      // rather than an exact string match to a single row's description. Use a case-insensitive contains
      // match so variants like "KIWI 505 BARCODE ..." are included.
      const mn = merchant_name.trim();
      const needle = `%${mn}%`;
      conditions.push(`(
        COALESCE(m.canonical_name, '') LIKE ? COLLATE NOCASE OR
        COALESCE(t.merchant, '') LIKE ? COLLATE NOCASE OR
        t.description LIKE ? COLLATE NOCASE
      )`);
      params.push(needle, needle, needle);
    }

    if (search && search.trim()) {
      // Make "search" useful by matching:
      // - description
      // - canonical merchant name (if available)
      // - raw PDF/XLSX text hints stored in raw_json (raw_line/raw_block)
      if (!joinClause.includes('transaction_meta')) {
        joinClause += ' LEFT JOIN transaction_meta tm ON t.id = tm.transaction_id';
      }
      const merchantsJoin = ' LEFT JOIN merchants m ON tm.merchant_id = m.id';
      if (!joinClause.includes('merchants m')) {
        joinClause += merchantsJoin;
      }
      const needle = `%${search.trim()}%`;
      conditions.push(`(
        t.description LIKE ? COLLATE NOCASE OR
        COALESCE(m.canonical_name, '') LIKE ? COLLATE NOCASE OR
        COALESCE(t.merchant, '') LIKE ? COLLATE NOCASE OR
        (
          json_valid(t.raw_json) AND
          COALESCE(json_extract(t.raw_json, '$.raw_line'), '') LIKE ? COLLATE NOCASE
        ) OR
        (
          json_valid(t.raw_json) AND
          COALESCE(json_extract(t.raw_json, '$.raw_block'), '') LIKE ? COLLATE NOCASE
        )
      )`);
      params.push(needle, needle, needle, needle, needle);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Ensure necessary joins for sorting.
    if (sort_by === 'merchant') {
      if (!joinClause.includes('transaction_meta')) {
        joinClause += ' LEFT JOIN transaction_meta tm ON t.id = tm.transaction_id';
      }
      const merchantsJoin = ' LEFT JOIN merchants m ON tm.merchant_id = m.id';
      if (!joinClause.includes('merchants m')) {
        joinClause += merchantsJoin;
      }
    }

    // Map sort_by to column
    const sortColumn =
      sort_by === 'amount' ? 't.amount' :
      sort_by === 'amount_abs' ? 'ABS(t.amount)' :
      sort_by === 'description' ? 't.description' :
      sort_by === 'merchant' ? "COALESCE(NULLIF(TRIM(m.canonical_name), ''), NULLIF(TRIM(t.merchant), ''), NULLIF(TRIM(t.description), '')) COLLATE NOCASE" :
      't.tx_date';
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
      .all<DbTransactionRow>();

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
    ).bind(id).first<DbTransactionRow>();

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

// Patch transaction core fields (transfer/excluded flags, merchant override, and optional category_id)
transactions.patch('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = updateTransactionSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.message }, 400);
    }

    // Ensure transaction exists
    const existing = await c.env.DB.prepare('SELECT 1 FROM transactions WHERE id = ?').bind(id).first();
    if (!existing) {
      return c.json({ error: 'Transaction not found' }, 404);
    }

    const now = new Date().toISOString();
    const { is_transfer, is_excluded, merchant, category_id } = parsed.data;

    const updates: string[] = [];
    const params: (string | number | null)[] = [];

    if (merchant !== undefined) {
      updates.push('merchant = ?');
      params.push(merchant);
    }

    if (is_transfer !== undefined) {
      updates.push('is_transfer = ?');
      params.push(is_transfer ? 1 : 0);

      // If user marks transfer and didn't explicitly set excluded, default to excluded.
      if (is_transfer === true && is_excluded === undefined) {
        updates.push('is_excluded = 1');
      }

      // If user UN-marks transfer and didn't explicitly set excluded, default to included.
      // Also normalize flow_type back to expense/income based on sign, so analytics & UI are consistent.
      if (is_transfer === false && is_excluded === undefined) {
        updates.push('is_excluded = 0');
      }

      if (is_transfer === false) {
        // Recompute flow_type from amount sign for non-transfer rows.
        // This makes "was incorrectly marked transfer" immediately show up in Expenses/Travel etc.
        const amtRow = await c.env.DB
          .prepare('SELECT amount FROM transactions WHERE id = ?')
          .bind(id)
          .first<{ amount: number }>();
        const amount = Number(amtRow?.amount ?? 0);
        const inferred = amount < 0 ? 'expense' : amount > 0 ? 'income' : 'unknown';
        updates.push('flow_type = ?');
        params.push(inferred);
      } else if (is_transfer === true) {
        // Ensure transfer flow_type is consistent for analytics.
        updates.push(`flow_type = 'transfer'`);
      }
    }

    if (is_excluded !== undefined) {
      updates.push('is_excluded = ?');
      params.push(is_excluded ? 1 : 0);
    }

    if (updates.length > 0) {
      params.push(id);
      await c.env.DB.prepare(`UPDATE transactions SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();
    }

    // Optional category update via transaction_meta (keeps existing meta endpoint working)
    if (category_id !== undefined) {
      // Validate category exists if provided (null clears)
      if (category_id) {
        const cat = await c.env.DB.prepare('SELECT 1 FROM categories WHERE id = ?').bind(category_id).first();
        if (!cat) {
          return c.json({ error: 'Category not found' }, 400);
        }
      }

      const metaExists = await c.env.DB.prepare('SELECT 1 FROM transaction_meta WHERE transaction_id = ?').bind(id).first();
      if (metaExists) {
        await c.env.DB.prepare('UPDATE transaction_meta SET category_id = ?, updated_at = ? WHERE transaction_id = ?')
          .bind(category_id || null, now, id).run();
      } else {
        await c.env.DB.prepare('INSERT INTO transaction_meta (transaction_id, category_id, updated_at) VALUES (?, ?, ?)')
          .bind(id, category_id || null, now).run();
      }
    }

    const updated = await c.env.DB.prepare('SELECT * FROM transactions WHERE id = ?').bind(id).first<DbTransactionRow>();
    if (!updated) return c.json({ error: 'Transaction not found' }, 404);
    const enriched = await enrichTransactions(c.env.DB, [updated]);
    return c.json(enriched[0]);
  } catch (error) {
    console.error('Transaction patch error:', error);
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

    if (category_id) {
      const categoryExists = await c.env.DB
        .prepare('SELECT 1 FROM categories WHERE id = ?')
        .bind(category_id)
        .first();
      if (!categoryExists) {
        return c.json({ error: 'Category not found' }, 400);
      }
    }

    if (merchant_id) {
      const merchantExists = await c.env.DB
        .prepare('SELECT 1 FROM merchants WHERE id = ?')
        .bind(merchant_id)
        .first();
      if (!merchantExists) {
        return c.json({ error: 'Merchant not found' }, 400);
      }
    }

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
    const flowType: 'expense' | 'income' = amount < 0 ? 'expense' : 'income';
    await c.env.DB.prepare(`
      INSERT INTO transactions
        (id, tx_hash, tx_date, booked_date, description, merchant, amount, currency, status, source_type, source_file_hash, raw_json, created_at, flow_type, is_excluded, is_transfer)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'NOK', 'booked', 'manual', ?, ?, ?, ?, 0, 0)
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
      now,
      flowType
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
          flow_type: flowType,
          is_excluded: false,
          is_transfer: false,
        }, rules);
      }
    }

    // Return the enriched transaction
    const newTx = await c.env.DB.prepare('SELECT * FROM transactions WHERE id = ?').bind(id).first<DbTransactionRow>();
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

// Detect transfers in existing data (heuristic backfill)
transactions.post('/admin/detect-transfers', async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as { limit?: number; dry_run?: boolean };
    const limit = Math.min(Math.max(1, body.limit ?? 5000), 20000);
    const dryRun = body.dry_run === true;

    const rows = await c.env.DB.prepare(
      'SELECT id, description FROM transactions WHERE COALESCE(is_transfer, 0) = 0 LIMIT ?'
    ).bind(limit).all<{ id: string; description: string }>();

    const matchedIds: string[] = [];
    for (const r of rows.results || []) {
      if (detectIsTransfer(r.description)) {
        matchedIds.push(r.id);
      }
    }

    if (!dryRun && matchedIds.length > 0) {
      await c.env.DB.batch(
        matchedIds.map((id) =>
          c.env.DB.prepare('UPDATE transactions SET is_transfer = 1, is_excluded = 1 WHERE id = ?').bind(id)
        )
      );
    }

    return c.json({
      success: true,
      scanned: (rows.results || []).length,
      matched: matchedIds.length,
      updated: dryRun ? 0 : matchedIds.length,
      dry_run: dryRun,
    });
  } catch (error) {
    console.error('Detect transfers error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Repair corrupted PDF transactions where the amount was accidentally parsed from the year token (e.g. 2026.00).
transactions.post('/admin/repair-year-amounts', async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as { limit?: number; dry_run?: boolean };
    const limit = Math.min(Math.max(1, body.limit ?? 5000), 20000);
    const dryRun = body.dry_run !== false; // default true

    const rows = await c.env.DB.prepare(
      `
        SELECT id, tx_date, amount, description, tx_hash, raw_json, is_excluded
        FROM transactions
        WHERE source_type = 'pdf'
          AND amount >= 1900 AND amount <= 2100
          AND CAST(amount AS INTEGER) = amount
          AND (description IS NULL OR description NOT GLOB '*[A-Za-z]*')
          AND description GLOB '*[0-9][0-9].[0-9][0-9].[0-9][0-9][0-9][0-9]*'
        LIMIT ?
      `
    ).bind(limit).all<{
      id: string;
      tx_date: string;
      amount: number;
      description: string;
      tx_hash: string;
      raw_json: string;
      is_excluded: 0 | 1;
    }>();

    const scanned = (rows.results || []).length;

    let reparsed = 0;
    let updated = 0;
    let excluded = 0;
    let missingRawLine = 0;
    let parseFailed = 0;
    let hashConflicts = 0;

    const statements: D1PreparedStatement[] = [];

    const addMetaNote = (txId: string, note: string) => {
      statements.push(
        c.env.DB.prepare(
          `
            INSERT INTO transaction_meta (transaction_id, notes, updated_at)
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(transaction_id) DO UPDATE SET
              notes = CASE
                WHEN notes IS NULL OR notes = '' THEN excluded.notes
                ELSE notes || char(10) || excluded.notes
              END,
              updated_at = datetime('now')
          `
        ).bind(txId, note)
      );
    };

    for (const r of rows.results || []) {
      let rawLine: string | null = null;
      try {
        const parsed = JSON.parse(r.raw_json || '{}');
        if (typeof parsed?.raw_line === 'string' && parsed.raw_line.trim()) {
          rawLine = parsed.raw_line.trim();
        }
      } catch {
        // ignore
      }

      if (!rawLine) {
        missingRawLine++;
        excluded++;
        if (!dryRun) {
          // Set amount to 0 to remove the poisoned year value from aggregates; keep is_excluded=1.
          statements.push(
            c.env.DB.prepare('UPDATE transactions SET is_excluded = 1, amount = 0 WHERE id = ?').bind(r.id)
          );
          addMetaNote(r.id, '[auto] year-amount repair: excluded (missing raw_line)');
        }
        continue;
      }

      const parsedTx = parsePdfTransactionLine(rawLine);
      if (!parsedTx) {
        parseFailed++;
        excluded++;
        if (!dryRun) {
          statements.push(
            c.env.DB.prepare('UPDATE transactions SET is_excluded = 1, amount = 0 WHERE id = ?').bind(r.id)
          );
          addMetaNote(r.id, '[auto] year-amount repair: excluded (unable to reparse)');
        }
        continue;
      }

      // If the re-parse still yields the year as amount, treat as unrecoverable.
      const year = Number(String(r.tx_date).slice(0, 4));
      if (Number.isFinite(year) && parsedTx.amount >= 1900 && parsedTx.amount <= 2100 && parsedTx.amount === year) {
        parseFailed++;
        excluded++;
        if (!dryRun) {
          statements.push(
            c.env.DB.prepare('UPDATE transactions SET is_excluded = 1, amount = 0 WHERE id = ?').bind(r.id)
          );
          addMetaNote(r.id, '[auto] year-amount repair: excluded (amount still looks like year)');
        }
        continue;
      }

      reparsed++;

      // Update amount + description + tx_hash (to keep dedupe sane).
      const nextHash = await computeTxHash(r.tx_date, parsedTx.description, parsedTx.amount, 'pdf');

      // If another row already has the corrected hash, exclude this one as a duplicate.
      const conflict = await c.env.DB.prepare(
        'SELECT id FROM transactions WHERE tx_hash = ? AND id != ? LIMIT 1'
      ).bind(nextHash, r.id).first<{ id: string }>();

      if (conflict?.id) {
        hashConflicts++;
        excluded++;
        if (!dryRun) {
          statements.push(
            c.env.DB.prepare('UPDATE transactions SET is_excluded = 1, amount = 0 WHERE id = ?').bind(r.id)
          );
          addMetaNote(r.id, `[auto] year-amount repair: excluded (hash conflict with ${conflict.id})`);
        }
        continue;
      }

      updated++;
      if (!dryRun) {
        statements.push(
          c.env.DB.prepare(
            'UPDATE transactions SET amount = ?, description = ?, tx_hash = ?, is_excluded = 0 WHERE id = ?'
          ).bind(parsedTx.amount, parsedTx.description, nextHash, r.id)
        );
        addMetaNote(r.id, '[auto] year-amount repair: repaired amount/description');
      }
    }

    if (!dryRun && statements.length > 0) {
      await c.env.DB.batch(statements);
    }

    return c.json({
      success: true,
      dry_run: dryRun,
      scanned,
      reparsed,
      updated: dryRun ? 0 : updated,
      excluded: dryRun ? 0 : excluded,
      missing_raw_line: missingRawLine,
      parse_failed: parseFailed,
      hash_conflicts: hashConflicts,
    });
  } catch (error) {
    console.error('Repair year amounts error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Exclude obviously non-transaction summary rows accidentally ingested from XLSX exports.
// This is intentionally conservative and only targets amount=0 rows with known summary labels.
transactions.post('/admin/exclude-xlsx-junk', async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as { limit?: number; dry_run?: boolean };
    const limit = Math.min(Math.max(1, body.limit ?? 5000), 20000);
    const dryRun = body.dry_run !== false; // default true

    const rows = await c.env.DB.prepare(
      `
        SELECT id, tx_date, amount, description, raw_json
        FROM transactions
        WHERE source_type = 'xlsx'
          AND COALESCE(is_excluded, 0) = 0
          AND amount = 0
          AND (
            LOWER(COALESCE(description, '')) LIKE 'saldo%'
            OR LOWER(COALESCE(description, '')) LIKE 'totalbel%'
            OR LOWER(COALESCE(description, '')) IN ('dato', 'beløp', 'belop', 'spesifikasjon', 'bokført', 'bokfort')
          )
        LIMIT ?
      `
    ).bind(limit).all<{ id: string; tx_date: string; amount: number; description: string; raw_json: string }>();

    const matched = (rows.results || []).length;

    if (dryRun) {
      return c.json({
        success: true,
        dry_run: true,
        matched,
      });
    }

    const statements: D1PreparedStatement[] = [];

    const addMetaNote = (txId: string, note: string) => {
      statements.push(
        c.env.DB.prepare(
          `
            INSERT INTO transaction_meta (transaction_id, notes, updated_at)
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(transaction_id) DO UPDATE SET
              notes = CASE
                WHEN notes IS NULL OR notes = '' THEN excluded.notes
                ELSE notes || char(10) || excluded.notes
              END,
              updated_at = datetime('now')
          `
        ).bind(txId, note)
      );
    };

    const ids = (rows.results || []).map((r) => r.id);
    for (const id of ids) {
      statements.push(
        c.env.DB.prepare('UPDATE transactions SET is_excluded = 1 WHERE id = ?').bind(id)
      );
      addMetaNote(id, '[auto] excel junk row excluded');
    }

    if (statements.length > 0) {
      await c.env.DB.batch(statements);
    }

    return c.json({
      success: true,
      dry_run: false,
      matched,
      updated: ids.length,
    });
  } catch (error) {
    console.error('Exclude xlsx junk error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Repair XLSX sign mistakes (purchases stored as positive amounts) and mark payment rows as transfers.
// This keeps analytics consistent with the sign convention: expenses are negative, income is positive.
transactions.post('/admin/repair-xlsx-signs', async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as { limit?: number; dry_run?: boolean };
    const limit = Math.min(Math.max(1, body.limit ?? 5000), 20000);
    const dryRun = body.dry_run !== false; // default true

    const rows = await c.env.DB.prepare(
      `
        SELECT
          t.id,
          t.tx_date,
          t.amount,
          t.description,
          t.tx_hash,
          t.raw_json,
          COALESCE(t.is_excluded, 0) as is_excluded,
          COALESCE(t.is_transfer, 0) as is_transfer,
          tm.category_id as category_id
        FROM transactions t
        LEFT JOIN transaction_meta tm ON t.id = tm.transaction_id
        WHERE t.source_type = 'xlsx'
          AND COALESCE(t.is_excluded, 0) = 0
          AND t.amount > 0
        LIMIT ?
      `
    ).bind(limit).all<{
      id: string;
      tx_date: string;
      amount: number;
      description: string;
      tx_hash: string;
      raw_json: string;
      is_excluded: 0 | 1;
      is_transfer: 0 | 1;
      category_id: string | null;
    }>();

    const scanned = (rows.results || []).length;

    let matchedFlip = 0;
    let matchedMarkTransfer = 0;
    let updatedFlip = 0;
    let updatedTransfer = 0;
    let excludedDuplicates = 0;
    let skippedRefunds = 0;
    let skippedNoContext = 0;

    const enabledRules = await getEnabledRules(c.env.DB);
    const statements: D1PreparedStatement[] = [];
    const touchedIds: string[] = [];

    const addMetaNote = (txId: string, note: string) => {
      statements.push(
        c.env.DB.prepare(
          `
            INSERT INTO transaction_meta (transaction_id, notes, updated_at)
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(transaction_id) DO UPDATE SET
              notes = CASE
                WHEN notes IS NULL OR notes = '' THEN excluded.notes
                ELSE notes || char(10) || excluded.notes
              END,
              updated_at = datetime('now')
          `
        ).bind(txId, note)
      );
    };

    const looksLikeGroceries = (d: string) => {
      const s = (d || '').toUpperCase();
      return /\b(REMA|KIWI|MENY|COOP|EXTRA|OBS|SPAR|JOKER)\b/.test(s);
    };

    for (const r of rows.results || []) {
      const section = extractSectionLabelFromRawJson(r.raw_json);

      // Mark payment-like rows as transfers and excluded.
      if (!r.is_transfer && isPaymentLikeRow(r.description, section)) {
        matchedMarkTransfer++;
        if (!dryRun) {
          statements.push(
            c.env.DB.prepare('UPDATE transactions SET is_transfer = 1, is_excluded = 1 WHERE id = ?').bind(r.id)
          );
          addMetaNote(r.id, '[auto] xlsx sign repair: marked payment row as transfer');
          updatedTransfer++;
          touchedIds.push(r.id);
        }
        continue;
      }

      // Sign repair (only for purchases). Never touch refunds.
      if (isRefundLike(r.description)) {
        skippedRefunds++;
        continue;
      }

      const inPurchaseSection = isPurchaseSection(section);
      const fallbackGroceries = r.category_id === 'cat_food_groceries' && looksLikeGroceries(r.description);

      if (!inPurchaseSection && !fallbackGroceries) {
        skippedNoContext++;
        continue;
      }

      matchedFlip++;

      if (dryRun) continue;

      const nextAmount = -Math.abs(r.amount);
      const nextHash = await computeTxHash(r.tx_date, r.description, nextAmount, 'xlsx');

      const conflict = await c.env.DB.prepare(
        'SELECT id FROM transactions WHERE tx_hash = ? AND id != ? LIMIT 1'
      ).bind(nextHash, r.id).first<{ id: string }>();

      if (conflict?.id) {
        excludedDuplicates++;
        statements.push(
          c.env.DB.prepare('UPDATE transactions SET is_excluded = 1, amount = 0 WHERE id = ?').bind(r.id)
        );
        addMetaNote(r.id, `[auto] xlsx sign repair: excluded (hash conflict with ${conflict.id})`);
        touchedIds.push(r.id);
        continue;
      }

      statements.push(
        c.env.DB.prepare('UPDATE transactions SET amount = ?, tx_hash = ? WHERE id = ?').bind(nextAmount, nextHash, r.id)
      );
      addMetaNote(r.id, '[auto] xlsx sign repair: flipped purchase amount sign');
      updatedFlip++;
      touchedIds.push(r.id);
    }

    if (!dryRun && statements.length > 0) {
      await c.env.DB.batch(statements);

      // Re-run rules for touched rows so category/merchant mapping stays consistent.
      // (Rules can depend on amount and this also re-attaches tags deterministically.)
      for (const id of touchedIds) {
        const txRow = await c.env.DB.prepare('SELECT * FROM transactions WHERE id = ?').bind(id).first<any>();
        if (!txRow) continue;

        const tx: Transaction = {
          ...txRow,
          is_excluded: !!txRow.is_excluded,
          is_transfer: !!txRow.is_transfer,
        };

        try {
          await applyRulesToTransaction(c.env.DB, tx, enabledRules);
        } catch {
          // keep endpoint best-effort; repair already updated the core row
        }
      }
    }

    return c.json({
      success: true,
      dry_run: dryRun,
      scanned,
      matched_flip_sign: matchedFlip,
      matched_mark_transfer: matchedMarkTransfer,
      updated_flip_sign: dryRun ? 0 : updatedFlip,
      updated_mark_transfer: dryRun ? 0 : updatedTransfer,
      excluded_duplicates: dryRun ? 0 : excludedDuplicates,
      skipped_refunds: skippedRefunds,
      skipped_no_context: skippedNoContext,
    });
  } catch (error) {
    console.error('Repair xlsx signs error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Diagnostic: find rows that look like purchases but are stored as positive amounts (income by sign convention).
transactions.get('/admin/diagnostics/suspicious-positive-purchases', async (c) => {
  try {
    const limitRaw = c.req.query('limit');
    const limit = Math.min(Math.max(1, Number(limitRaw || 50)), 200);

    // Keep this list short and obvious; it's for evidence + debugging, not a categorization engine.
    const patterns = [
      'SATS%',
      'GOOGLE%',
      'APPLE%',
      'VIPPS%',
      'WOLT%',
      'FOODORA%',
      'NARVESEN%',
      '7-ELEVEN%',
      'LOS TACOS%',
      'CUTTERS%',
      'XXL%',
      'REMA%',
      'KIWI%',
      'MENY%',
      'COOP%',
      'EXTRA%',
      'OBS%',
      'SPAR%',
      'JOKER%',
    ];

    const likeClause = patterns.map(() => 'UPPER(TRIM(t.description)) LIKE UPPER(?)').join(' OR ');

    const rows = await c.env.DB.prepare(
      `
        SELECT
          t.id,
          t.tx_date,
          t.amount,
          t.description,
          t.merchant,
          COALESCE(t.is_transfer, 0) as is_transfer,
          COALESCE(t.is_excluded, 0) as is_excluded,
          tm.category_id as category_id,
          c.name as category_name,
          CASE WHEN json_valid(t.raw_json) THEN json_extract(t.raw_json, '$.section_label') ELSE NULL END as section_label,
          CASE
            WHEN json_valid(t.raw_json) THEN substr(COALESCE(json_extract(t.raw_json, '$.raw_line'), ''), 1, 200)
            ELSE NULL
          END as raw_line
        FROM transactions t
        LEFT JOIN transaction_meta tm ON t.id = tm.transaction_id
        LEFT JOIN categories c ON tm.category_id = c.id
        WHERE t.source_type IN ('xlsx', 'pdf')
          AND t.amount > 0
          AND COALESCE(t.is_excluded, 0) = 0
          AND COALESCE(t.is_transfer, 0) = 0
          AND (${likeClause})
        ORDER BY t.tx_date DESC, t.created_at DESC
        LIMIT ?
      `
    ).bind(...patterns, limit).all<{
      id: string;
      tx_date: string;
      amount: number;
      description: string;
      merchant: string | null;
      is_transfer: 0 | 1;
      is_excluded: 0 | 1;
      category_id: string | null;
      category_name: string | null;
      section_label: string | null;
      raw_line: string | null;
    }>();

    return c.json({
      success: true,
      scanned_limit: limit,
      matched: (rows.results || []).length,
      rows: rows.results || [],
    });
  } catch (error) {
    console.error('Suspicious positive purchases diagnostic error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Validate the integrity of ingested data for a date range (read-only; admin-protected by auth middleware).
// This is designed to be fast and summary-only so scripts/UI can fail fast after imports.
transactions.get('/admin/validate-ingest', async (c) => {
  try {
    const q = c.req.query();
    const dateFrom = q.date_from;
    const dateTo = q.date_to;

    const isIsoDate = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
    if (!isIsoDate(dateFrom) || !isIsoDate(dateTo)) {
      return c.json({ error: 'date_from and date_to are required (YYYY-MM-DD)' }, 400);
    }

    // Counts by flow_type
    const flowCountsRes = await c.env.DB.prepare(
      `
        SELECT t.flow_type as flow_type, COUNT(*) as count
        FROM transactions t
        WHERE t.tx_date >= ? AND t.tx_date <= ?
        GROUP BY t.flow_type
      `
    ).bind(dateFrom, dateTo).all<{ flow_type: string; count: number }>();

    const flow_counts: Record<string, number> = {};
    for (const r of flowCountsRes.results || []) {
      flow_counts[String(r.flow_type || 'unknown')] = r.count;
    }

    // Excluded + zero-amount stats
    const statsRes = await c.env.DB.prepare(
      `
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN COALESCE(t.is_excluded, 0) = 1 THEN 1 ELSE 0 END) as excluded,
          SUM(CASE WHEN t.amount = 0 AND COALESCE(t.is_excluded, 0) = 1 THEN 1 ELSE 0 END) as zero_amount_excluded,
          SUM(CASE WHEN t.amount = 0 AND COALESCE(t.is_excluded, 0) = 0 THEN 1 ELSE 0 END) as zero_amount_active
        FROM transactions t
        WHERE t.tx_date >= ? AND t.tx_date <= ?
      `
    ).bind(dateFrom, dateTo).first<{
      total: number;
      excluded: number;
      zero_amount_excluded: number;
      zero_amount_active: number;
    }>();

    const sourceCountsRes = await c.env.DB.prepare(
      `
        SELECT t.source_type as source_type, COUNT(*) as count
        FROM transactions t
        WHERE t.tx_date >= ? AND t.tx_date <= ?
        GROUP BY t.source_type
      `
    ).bind(dateFrom, dateTo).all<{ source_type: string; count: number }>();

    const source_counts: Record<string, number> = {};
    for (const r of sourceCountsRes.results || []) {
      source_counts[String(r.source_type || 'unknown')] = r.count;
    }

    // Groceries sums: strict (flow_type=expense) vs fallback (expense OR unknown-negative) to catch misclassified flow/sign.
    // Also compute an "analytics-style" total for groceries (matching /analytics/by-category conditions) and compare.
    const groceriesStrict = await c.env.DB.prepare(
      `
        SELECT
          COUNT(*) as tx_count,
          COALESCE(SUM(ABS(t.amount)), 0) as sum_abs
        FROM transactions t
        JOIN transaction_meta tm ON t.id = tm.transaction_id
        WHERE t.tx_date >= ? AND t.tx_date <= ?
          AND COALESCE(t.is_excluded, 0) = 0
          AND tm.category_id = 'cat_food_groceries'
          AND t.flow_type = 'expense'
      `
    ).bind(dateFrom, dateTo).first<{ tx_count: number; sum_abs: number }>();

    const groceriesFallback = await c.env.DB.prepare(
      `
        SELECT
          COUNT(*) as tx_count,
          COALESCE(SUM(ABS(t.amount)), 0) as sum_abs
        FROM transactions t
        JOIN transaction_meta tm ON t.id = tm.transaction_id
        WHERE t.tx_date >= ? AND t.tx_date <= ?
          AND COALESCE(t.is_excluded, 0) = 0
          AND tm.category_id = 'cat_food_groceries'
          AND (
            t.flow_type = 'expense' OR
            (t.flow_type = 'unknown' AND t.amount < 0)
          )
      `
    ).bind(dateFrom, dateTo).first<{ tx_count: number; sum_abs: number }>();

    const groceriesIncomeLeak = await c.env.DB.prepare(
      `
        SELECT COUNT(*) as count
        FROM transactions t
        JOIN transaction_meta tm ON t.id = tm.transaction_id
        WHERE t.tx_date >= ? AND t.tx_date <= ?
          AND COALESCE(t.is_excluded, 0) = 0
          AND tm.category_id = 'cat_food_groceries'
          AND t.flow_type = 'income'
      `
    ).bind(dateFrom, dateTo).first<{ count: number }>();

    // Match /analytics/by-category behavior for groceries, including splits and excluding transfers by default.
    const groceriesAnalytics = await c.env.DB.prepare(
      `
        WITH categorized AS (
          SELECT
            t.id as transaction_id,
            ABS(t.amount) as amount,
            tm.category_id as category_id
          FROM transactions t
          LEFT JOIN transaction_meta tm ON t.id = tm.transaction_id
          WHERE t.tx_date >= ? AND t.tx_date <= ?
            AND (t.flow_type = 'expense' OR (t.flow_type = 'unknown' AND t.amount < 0))
            AND COALESCE(t.is_excluded, 0) = 0
            AND COALESCE(t.is_transfer, 0) = 0
            AND t.flow_type != 'transfer'
            AND NOT EXISTS (
              SELECT 1 FROM transaction_splits ts WHERE ts.parent_transaction_id = t.id
            )
          UNION ALL
          SELECT
            t.id as transaction_id,
            ABS(ts.amount) as amount,
            ts.category_id as category_id
          FROM transactions t
          JOIN transaction_splits ts ON ts.parent_transaction_id = t.id
          WHERE t.tx_date >= ? AND t.tx_date <= ?
            AND (t.flow_type = 'expense' OR (t.flow_type = 'unknown' AND t.amount < 0))
            AND COALESCE(t.is_excluded, 0) = 0
            AND COALESCE(t.is_transfer, 0) = 0
            AND t.flow_type != 'transfer'
        )
        SELECT
          COALESCE(SUM(categorized.amount), 0) as total
        FROM categorized
        WHERE categorized.category_id = 'cat_food_groceries'
      `
    ).bind(dateFrom, dateTo, dateFrom, dateTo).first<{ total: number }>();

    // Base-transaction sum (matches /transactions listing without splits).
    const groceriesTxBase = await c.env.DB.prepare(
      `
        SELECT COALESCE(SUM(ABS(t.amount)), 0) as total
        FROM transactions t
        JOIN transaction_meta tm ON t.id = tm.transaction_id
        WHERE t.tx_date >= ? AND t.tx_date <= ?
          AND COALESCE(t.is_excluded, 0) = 0
          AND COALESCE(t.is_transfer, 0) = 0
          AND t.flow_type != 'transfer'
          AND tm.category_id = 'cat_food_groceries'
          AND (t.flow_type = 'expense' OR (t.flow_type = 'unknown' AND t.amount < 0))
      `
    ).bind(dateFrom, dateTo).first<{ total: number }>();

    const groceries_strict_sum = Number(groceriesStrict?.sum_abs || 0);
    const groceries_fallback_sum = Number(groceriesFallback?.sum_abs || 0);
    const groceries_flow_delta = Math.abs(groceries_fallback_sum - groceries_strict_sum);
    const groceries_analytics_total = Number(groceriesAnalytics?.total || 0);
    const groceries_tx_base_total = Number(groceriesTxBase?.total || 0);
    const groceries_analytics_delta = Math.abs(groceries_analytics_total - groceries_tx_base_total);

    // Suspicious income (purchase keywords)
    const keywords = [
      'REMA', 'KIWI', 'MENY', 'COOP', 'EXTRA', 'OBS', 'SPAR', 'JOKER',
      'XXL', 'SATS', 'GOOGLE ONE', 'NARVESEN', 'VIPPS', 'PING',
    ];

    const keywordClause = keywords.map(() => '(t.description LIKE ? COLLATE NOCASE OR COALESCE(t.merchant, \'\') LIKE ? COLLATE NOCASE OR COALESCE(m.canonical_name, \'\') LIKE ? COLLATE NOCASE)').join(' OR ');
    const keywordParams: string[] = [];
    for (const k of keywords) {
      const needle = `%${k}%`;
      keywordParams.push(needle, needle, needle);
    }

    const suspiciousIncomeRes = await c.env.DB.prepare(
      `
        SELECT
          TRIM(t.description) as description,
          COUNT(*) as count,
          COALESCE(SUM(ABS(t.amount)), 0) as total_abs
        FROM transactions t
        LEFT JOIN transaction_meta tm ON t.id = tm.transaction_id
        LEFT JOIN merchants m ON tm.merchant_id = m.id
        WHERE t.tx_date >= ? AND t.tx_date <= ?
          AND COALESCE(t.is_excluded, 0) = 0
          AND t.flow_type = 'income'
          AND (${keywordClause})
        GROUP BY TRIM(t.description)
        ORDER BY count DESC, total_abs DESC
        LIMIT 20
      `
    ).bind(dateFrom, dateTo, ...keywordParams).all<{ description: string; count: number; total_abs: number }>();

    const suspicious_income = (suspiciousIncomeRes.results || []).map((r) => ({
      description: r.description,
      count: r.count,
      total_abs: r.total_abs,
    }));

    const zero_active = Number(statsRes?.zero_amount_active || 0);
    const suspicious_count = suspicious_income.reduce((acc, r) => acc + (r.count || 0), 0);

    const failures: string[] = [];
    if (zero_active > 0) failures.push('zero_amount_rows_active');
    if (suspicious_count > 0) failures.push('suspicious_income_purchases');
    if (groceries_flow_delta > 1) failures.push('groceries_flow_type_mismatch');
    if (groceries_analytics_delta > 1) failures.push('groceries_analytics_mismatch');
    if (Number(groceriesIncomeLeak?.count || 0) > 0) failures.push('groceries_income_leak');

    return c.json({
      ok: failures.length === 0,
      failures,
      period: { date_from: dateFrom, date_to: dateTo },
      counts: {
        total: Number(statsRes?.total || 0),
        excluded: Number(statsRes?.excluded || 0),
        flow_type: flow_counts,
        zero_amount: {
          active: zero_active,
          excluded: Number(statsRes?.zero_amount_excluded || 0),
        },
        source_type: source_counts,
      },
      groceries: {
        analytics_total: groceries_analytics_total,
        tx_base_total: groceries_tx_base_total,
        analytics_delta: groceries_analytics_delta,
        strict: {
          tx_count: Number(groceriesStrict?.tx_count || 0),
          sum_abs: groceries_strict_sum,
        },
        fallback: {
          tx_count: Number(groceriesFallback?.tx_count || 0),
          sum_abs: groceries_fallback_sum,
        },
        flow_delta: groceries_flow_delta,
        income_leak_count: Number(groceriesIncomeLeak?.count || 0),
      },
      suspicious_income,
    });
  } catch (error) {
    console.error('Validate ingest error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Hard D1 diagnostics for categorization within a date range (admin-only; source of truth).
// This intentionally uses the same join shape as analytics (transaction_meta.category_id),
// since `transactions` itself does not store category_id.
transactions.post('/admin/diag-categories', async (c) => {
  try {
    const body = await c.req.json().catch(() => null) as { from?: unknown; to?: unknown } | null;
    const from = body?.from;
    const to = body?.to;

    const isIsoDate = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
    if (!isIsoDate(from) || !isIsoDate(to)) {
      return c.json({ error: 'from and to are required (YYYY-MM-DD)' }, 400);
    }

    const totalRes = await c.env.DB.prepare(
      `
        SELECT COUNT(*) as total
        FROM transactions t
        WHERE t.tx_date >= ? AND t.tx_date <= ?
      `
    ).bind(from, to).first<{ total: number }>();

    const categorizedRes = await c.env.DB.prepare(
      `
        SELECT COUNT(*) as categorized
        FROM transactions t
        LEFT JOIN transaction_meta tm ON t.id = tm.transaction_id
        WHERE t.tx_date >= ? AND t.tx_date <= ?
          AND COALESCE(t.is_excluded, 0) = 0
          AND tm.category_id IS NOT NULL
      `
    ).bind(from, to).first<{ categorized: number }>();

    const topMerchantsRes = await c.env.DB.prepare(
      `
        SELECT
          COALESCE(NULLIF(TRIM(t.merchant), ''), NULLIF(TRIM(t.description), ''), 'Unknown') as merchant,
          COUNT(*) as count
        FROM transactions t
        WHERE t.tx_date >= ? AND t.tx_date <= ?
          AND COALESCE(t.is_excluded, 0) = 0
        GROUP BY merchant
        ORDER BY count DESC
        LIMIT 10
      `
    ).bind(from, to).all<{ merchant: string; count: number }>();

    const terms = ['REMA', 'KIWI', 'COOP'];
    const likeParams: string[] = [];
    const likeClauses: string[] = [];
    for (const term of terms) {
      likeClauses.push('(t.merchant LIKE ? OR t.description LIKE ?)');
      const pat = `%${term}%`;
      likeParams.push(pat, pat);
    }

    const sampleRes = await c.env.DB.prepare(
      `
        SELECT
          t.id,
          t.tx_date,
          t.merchant,
          t.description,
          tm.category_id,
          COALESCE(t.is_excluded, 0) as is_excluded,
          COALESCE(t.is_transfer, 0) as is_transfer,
          t.flow_type
        FROM transactions t
        LEFT JOIN transaction_meta tm ON t.id = tm.transaction_id
        WHERE t.tx_date >= ? AND t.tx_date <= ?
          AND (${likeClauses.join(' OR ')})
        ORDER BY t.tx_date DESC
        LIMIT 10
      `
    )
      .bind(from, to, ...likeParams)
      .all<{
        id: string;
        tx_date: string;
        merchant: string | null;
        description: string;
        category_id: string | null;
        is_excluded: 0 | 1;
        is_transfer: 0 | 1;
        flow_type: string;
      }>();

    return c.json({
      success: true,
      period: { from, to },
      counts: {
        total_in_range: Number(totalRes?.total || 0),
        categorized_in_range: Number(categorizedRes?.categorized || 0),
      },
      top_merchants: topMerchantsRes.results || [],
      samples: sampleRes.results || [],
      note: 'category_id is stored in transaction_meta; this endpoint joins it directly from D1',
    });
  } catch (error) {
    console.error('Diag categories error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Fill a default category for uncategorized *expense* rows in a date range.
// This is intended as a safe "make analytics usable" backfill, not a replacement for rules.
// - Only affects active (not excluded) expense-like rows.
// - Does NOT touch transfers.
// - Fills missing split categories first, then fills transaction_meta.category_id for non-split transactions.
transactions.post('/admin/fill-default-category', async (c) => {
  try {
    const body = await c.req.json().catch(() => null) as {
      from?: unknown;
      to?: unknown;
      category_id?: unknown;
      dry_run?: unknown;
    } | null;

    const from = body?.from;
    const to = body?.to;
    const categoryId = typeof body?.category_id === 'string' && body.category_id ? body.category_id : 'cat_other';
    const dryRun = body?.dry_run === true;

    const isIsoDate = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
    if (!isIsoDate(from) || !isIsoDate(to)) {
      return c.json({ error: 'from and to are required (YYYY-MM-DD)' }, 400);
    }

    // Count candidates (expense-like, active, not transfer, uncategorized either via splits or meta).
    const candidateRes = await c.env.DB.prepare(
      `
        WITH expense_rows AS (
          SELECT t.id
          FROM transactions t
          LEFT JOIN transaction_meta tm ON tm.transaction_id = t.id
          WHERE t.tx_date >= ? AND t.tx_date <= ?
            AND COALESCE(t.is_excluded, 0) = 0
            AND COALESCE(t.is_transfer, 0) = 0
            AND t.flow_type != 'transfer'
            AND (t.flow_type = 'expense' OR (t.flow_type = 'unknown' AND t.amount < 0))
        )
        SELECT
          (SELECT COUNT(*) FROM expense_rows) as expense_total,
          (SELECT COUNT(*)
            FROM expense_rows er
            WHERE EXISTS (
              SELECT 1 FROM transaction_splits ts WHERE ts.parent_transaction_id = er.id AND ts.category_id IS NULL
            )
          ) as split_uncategorized_parents,
          (SELECT COUNT(*)
            FROM expense_rows er
            LEFT JOIN transaction_meta tm2 ON tm2.transaction_id = er.id
            WHERE NOT EXISTS (SELECT 1 FROM transaction_splits ts WHERE ts.parent_transaction_id = er.id)
              AND tm2.category_id IS NULL
          ) as meta_uncategorized
      `
    ).bind(from, to).first<{
      expense_total: number;
      split_uncategorized_parents: number;
      meta_uncategorized: number;
    }>();

    if (dryRun) {
      return c.json({
        success: true,
        dry_run: true,
        period: { from, to },
        category_id: categoryId,
        candidates: {
          expense_total: Number(candidateRes?.expense_total || 0),
          split_uncategorized_parents: Number(candidateRes?.split_uncategorized_parents || 0),
          meta_uncategorized: Number(candidateRes?.meta_uncategorized || 0),
        },
      });
    }

    const now = new Date().toISOString();

    const splitRes = await c.env.DB.prepare(
      `
        UPDATE transaction_splits
        SET category_id = ?
        WHERE category_id IS NULL
          AND parent_transaction_id IN (
            SELECT t.id
            FROM transactions t
            WHERE t.tx_date >= ? AND t.tx_date <= ?
              AND COALESCE(t.is_excluded, 0) = 0
              AND COALESCE(t.is_transfer, 0) = 0
              AND t.flow_type != 'transfer'
              AND (t.flow_type = 'expense' OR (t.flow_type = 'unknown' AND t.amount < 0))
          )
      `
    ).bind(categoryId, from, to).run();

    const insertRes = await c.env.DB.prepare(
      `
        INSERT INTO transaction_meta (transaction_id, category_id, updated_at)
        SELECT t.id, ?, ?
        FROM transactions t
        LEFT JOIN transaction_meta tm ON tm.transaction_id = t.id
        WHERE t.tx_date >= ? AND t.tx_date <= ?
          AND COALESCE(t.is_excluded, 0) = 0
          AND COALESCE(t.is_transfer, 0) = 0
          AND t.flow_type != 'transfer'
          AND (t.flow_type = 'expense' OR (t.flow_type = 'unknown' AND t.amount < 0))
          AND tm.transaction_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM transaction_splits ts WHERE ts.parent_transaction_id = t.id)
      `
    ).bind(categoryId, now, from, to).run();

    const updateRes = await c.env.DB.prepare(
      `
        UPDATE transaction_meta
        SET category_id = ?, updated_at = ?
        WHERE transaction_id IN (
          SELECT t.id
          FROM transactions t
          LEFT JOIN transaction_meta tm2 ON tm2.transaction_id = t.id
          WHERE t.tx_date >= ? AND t.tx_date <= ?
            AND COALESCE(t.is_excluded, 0) = 0
            AND COALESCE(t.is_transfer, 0) = 0
            AND t.flow_type != 'transfer'
            AND (t.flow_type = 'expense' OR (t.flow_type = 'unknown' AND t.amount < 0))
            AND tm2.category_id IS NULL
            AND NOT EXISTS (SELECT 1 FROM transaction_splits ts WHERE ts.parent_transaction_id = t.id)
        )
      `
    ).bind(categoryId, now, from, to).run();

    return c.json({
      success: true,
      dry_run: false,
      period: { from, to },
      category_id: categoryId,
      changed: {
        split_updates: Number((splitRes as any)?.meta?.changes || 0),
        meta_inserts: Number((insertRes as any)?.meta?.changes || 0),
        meta_updates: Number((updateRes as any)?.meta?.changes || 0),
      },
    });
  } catch (error) {
    console.error('Fill default category error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Rebuild flow_type and normalize amount signs for existing rows (idempotent; supports dry_run).
transactions.post('/admin/rebuild-flow-and-signs', async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as {
      dry_run?: boolean;
      limit?: number;
      date_from?: string;
      date_to?: string;
      source_type?: 'xlsx' | 'pdf' | 'manual';
      cursor?: string;
    };

    const dryRun = body.dry_run !== false; // default true
    const limit = Math.min(Math.max(1, body.limit ?? 500), 1000);

    const b64Decode = (value: string): string => {
      // Workers runtime: atob/btoa. Node test/runtime: Buffer.
      if (typeof (globalThis as any).atob === 'function') return (globalThis as any).atob(value);
      const B = (globalThis as any).Buffer;
      if (B) return B.from(value, 'base64').toString('utf8');
      throw new Error('No base64 decoder available');
    };

    const b64Encode = (value: string): string => {
      if (typeof (globalThis as any).btoa === 'function') return (globalThis as any).btoa(value);
      const B = (globalThis as any).Buffer;
      if (B) return B.from(value, 'utf8').toString('base64');
      throw new Error('No base64 encoder available');
    };

    const decodeCursor = (cursor: string | undefined): { tx_date: string; created_at: string; id: string } | null => {
      if (!cursor) return null;
      try {
        const json = b64Decode(cursor);
        const parsed = JSON.parse(json);
        if (!parsed || typeof parsed !== 'object') return null;
        const { tx_date, created_at, id } = parsed as any;
        if (typeof tx_date !== 'string' || typeof created_at !== 'string' || typeof id !== 'string') return null;
        return { tx_date, created_at, id };
      } catch {
        return null;
      }
    };

    const encodeCursor = (row: { tx_date: string; created_at: string; id: string } | null): string | null => {
      if (!row) return null;
      const json = JSON.stringify({ tx_date: row.tx_date, created_at: row.created_at, id: row.id });
      return b64Encode(json);
    };

    const cursor = decodeCursor(body.cursor);

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (body.date_from) {
      conditions.push('t.tx_date >= ?');
      params.push(body.date_from);
    }
    if (body.date_to) {
      conditions.push('t.tx_date <= ?');
      params.push(body.date_to);
    }
    if (body.source_type) {
      conditions.push('t.source_type = ?');
      params.push(body.source_type);
    }

    // Cursor pagination (stable ordering): ORDER BY tx_date DESC, created_at DESC, id DESC
    if (cursor) {
      conditions.push(`(
        t.tx_date < ? OR
        (t.tx_date = ? AND t.created_at < ?) OR
        (t.tx_date = ? AND t.created_at = ? AND t.id < ?)
      )`);
      params.push(cursor.tx_date, cursor.tx_date, cursor.created_at, cursor.tx_date, cursor.created_at, cursor.id);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await c.env.DB.prepare(
      `
        SELECT
          t.id,
          t.tx_date,
          t.created_at,
          t.amount,
          t.description,
          t.merchant,
          t.source_type,
          t.tx_hash,
          t.raw_json,
          t.flow_type,
          COALESCE(t.is_transfer, 0) as is_transfer,
          COALESCE(t.is_excluded, 0) as is_excluded
        FROM transactions t
        ${whereClause}
        ORDER BY t.tx_date DESC, t.created_at DESC, t.id DESC
        LIMIT ?
      `
    ).bind(...params, limit).all<{
      id: string;
      tx_date: string;
      created_at: string;
      amount: number;
      description: string;
      merchant: string | null;
      source_type: 'xlsx' | 'pdf' | 'manual';
      tx_hash: string;
      raw_json: string;
      flow_type: string;
      is_transfer: 0 | 1;
      is_excluded: 0 | 1;
    }>();

    const scanned = (rows.results || []).length;
    const lastRow = scanned > 0 ? (rows.results as any)[scanned - 1] as { tx_date: string; created_at: string; id: string } : null;
    const nextCursor = encodeCursor(lastRow);
    const done = scanned < limit;

    let flowChanged = 0;
    let signFixed = 0;
    let transferMarked = 0;
    let excludedMarked = 0;
    let skippedNoRaw = 0;
    let excludedDuplicates = 0;
    let descriptionUpdated = 0;
    let merchantUpdated = 0;
    let wouldUpdate = 0;

    const enabledRules = await getEnabledRules(c.env.DB);
    const statements: D1PreparedStatement[] = [];
    const touchedIds: string[] = [];

    const addMetaNote = (txId: string, note: string) => {
      statements.push(
        c.env.DB.prepare(
          `
            INSERT INTO transaction_meta (transaction_id, notes, updated_at)
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(transaction_id) DO UPDATE SET
              notes = CASE
                WHEN notes IS NULL OR notes = '' THEN excluded.notes
                ELSE notes || char(10) || excluded.notes
              END,
              updated_at = datetime('now')
          `
        ).bind(txId, note)
      );
    };

    for (const r of rows.results || []) {
      if (!r.raw_json || !String(r.raw_json).trim()) {
        skippedNoRaw++;
        continue;
      }

      let rawLine: string | null = null;
      let rawObj: any = null;
      try {
        rawObj = JSON.parse(r.raw_json);
        if (rawObj && typeof rawObj === 'object') {
          if (typeof rawObj.raw_line === 'string') rawLine = rawObj.raw_line;
          else if (typeof rawObj.rawLine === 'string') rawLine = rawObj.rawLine;
        }
      } catch {
        rawObj = null;
      }

      // Optionally repair poisoned PDF rows by re-parsing amount/description from raw_line.
      // This addresses historical cases where a year token (e.g. 2026) became the amount.
      let nextDescription = r.description;
      let nextMerchant = r.merchant;
      let amountForClassify = r.amount;

      if (r.source_type === 'pdf' && rawLine) {
        const reparsed = parsePdfTransactionLine(rawLine);
        const sameDate = reparsed?.date === r.tx_date;

        const looksLikeYearAmount = r.amount >= 1900 && r.amount <= 2100 && Math.abs(r.amount - Math.round(r.amount)) < 0.00001;
        const shouldTryRepair = looksLikeYearAmount || r.amount === 0;

        if (sameDate && reparsed) {
          if (shouldTryRepair) {
            amountForClassify = reparsed.amount;
          }
          // Always prefer a cleaner parsed description if we have it.
          if (reparsed.description && reparsed.description.length >= 3) {
            nextDescription = reparsed.description;
          }
        }

        const merchantHint = extractMerchantFromPdfLine(rawLine);
        if (merchantHint) nextMerchant = merchantHint;

        if (rawObj && typeof rawObj === 'object') {
          rawObj.parsed_description = nextDescription;
          rawObj.parsed_amount = amountForClassify;
          rawObj.merchant_hint = nextMerchant;
        }
      }

      // XLSX: use raw_json.original_amount when present so rebuild is deterministic across repeated runs.
      if (r.source_type === 'xlsx' && rawObj && typeof rawObj === 'object') {
        if (typeof rawObj.original_amount === 'number' && Number.isFinite(rawObj.original_amount)) {
          amountForClassify = rawObj.original_amount;
        }
        // Prefer raw_row Spesifikasjon for description when present.
        const rr = rawObj.raw_row;
        if (rr && typeof rr === 'object') {
          const spec = (rr as any).Spesifikasjon ?? (rr as any).spesifikasjon;
          if (typeof spec === 'string' && spec.trim()) nextDescription = spec.trim();
        }
      }

      const forcedTransfer = r.is_transfer === 1;
      const classification = forcedTransfer
        ? { flow_type: 'transfer' as const, reason: 'forced-is_transfer' }
        : classifyFlowType({
          source_type: r.source_type,
          description: nextDescription,
          amount: amountForClassify,
          raw_json: rawObj ? JSON.stringify(rawObj) : r.raw_json,
        });

      const nextFlow = classification.flow_type;

      const preNormalizedAmount = (() => {
        if (r.source_type !== 'xlsx') return amountForClassify;
        try {
          const xlsxNorm = normalizeXlsxAmountForIngest({
            amount: amountForClassify,
            description: nextDescription,
            raw_json: rawObj ? JSON.stringify(rawObj) : r.raw_json,
          });
          return xlsxNorm.amount;
        } catch {
          return amountForClassify;
        }
      })();

      const normalized = normalizeAmountAndFlags({ flow_type: nextFlow, amount: preNormalizedAmount });

      const nextAmount = normalized.amount;
      const nextIsTransfer = nextFlow === 'transfer' ? 1 : 0;
      const nextIsExcluded = nextFlow === 'transfer' ? 1 : r.is_excluded;

      const flowDiff = String(r.flow_type || 'unknown') !== nextFlow;
      const signDiff = nextAmount !== r.amount;
      const transferDiff = nextIsTransfer !== r.is_transfer;
      const excludedDiff = nextIsExcluded !== r.is_excluded;
      const descriptionDiff = nextDescription !== r.description;
      const merchantDiff = (nextMerchant || null) !== (r.merchant || null);

      if (flowDiff) flowChanged++;
      if (signDiff) signFixed++;
      if (transferDiff && nextIsTransfer === 1) transferMarked++;
      if (excludedDiff && nextIsExcluded === 1) excludedMarked++;
      if (descriptionDiff) descriptionUpdated++;
      if (merchantDiff) merchantUpdated++;
      if (flowDiff || signDiff || transferDiff || excludedDiff || descriptionDiff || merchantDiff) wouldUpdate++;

      if (dryRun) continue;

      if (!flowDiff && !signDiff && !transferDiff && !excludedDiff && !descriptionDiff && !merchantDiff) continue;

      // If description or amount changes we must update tx_hash to keep dedupe sane.
      let nextHash = r.tx_hash;
      if (signDiff || descriptionDiff) {
        nextHash = await computeTxHash(r.tx_date, nextDescription, nextAmount, r.source_type);

        const conflict = await c.env.DB.prepare(
          'SELECT id FROM transactions WHERE tx_hash = ? AND id != ? LIMIT 1'
        ).bind(nextHash, r.id).first<{ id: string }>();

        if (conflict?.id) {
          excludedDuplicates++;
          statements.push(
            c.env.DB.prepare('UPDATE transactions SET is_excluded = 1, amount = 0 WHERE id = ?').bind(r.id)
          );
          addMetaNote(r.id, `[auto] rebuild-flow: excluded (hash conflict with ${conflict.id})`);
          touchedIds.push(r.id);
          continue;
        }
      }

      statements.push(
        c.env.DB.prepare(
          `
            UPDATE transactions
            SET flow_type = ?, amount = ?, tx_hash = ?, is_transfer = ?, is_excluded = ?, description = ?, merchant = ?, raw_json = ?
            WHERE id = ?
          `
        ).bind(
          nextFlow,
          nextAmount,
          nextHash,
          nextIsTransfer,
          nextIsExcluded,
          nextDescription,
          nextMerchant || null,
          rawObj ? JSON.stringify(rawObj) : r.raw_json,
          r.id
        )
      );

      addMetaNote(
        r.id,
        `[auto] rebuild: old_flow=${String(r.flow_type || 'unknown')} new_flow=${nextFlow} old_amount=${r.amount} new_amount=${nextAmount}`
      );
      touchedIds.push(r.id);
    }

    if (!dryRun && statements.length > 0) {
      await c.env.DB.batch(statements);

      // Re-run rules for touched rows so category/tags remain consistent after sign/flow changes.
      for (const id of touchedIds) {
        const txRow = await c.env.DB.prepare('SELECT * FROM transactions WHERE id = ?').bind(id).first<any>();
        if (!txRow) continue;

        const tx: Transaction = {
          ...txRow,
          is_excluded: !!txRow.is_excluded,
          is_transfer: !!txRow.is_transfer,
          flow_type: (txRow.flow_type || 'unknown') as any,
        };

        try {
          await applyRulesToTransaction(c.env.DB, tx, enabledRules);
        } catch {
          // best-effort
        }
      }
    }

    return c.json({
      success: true,
      dry_run: dryRun,
      scanned,
      done,
      next_cursor: done ? null : nextCursor,
      skipped: Math.max(0, (scanned - skippedNoRaw) - (dryRun ? wouldUpdate : touchedIds.length)),
      would_update: dryRun ? wouldUpdate : undefined,
      flow_changed: flowChanged,
      sign_fixed: signFixed,
      description_updated: descriptionUpdated,
      merchant_updated: merchantUpdated,
      transfer_marked: transferMarked,
      excluded_marked: excludedMarked,
      skipped_no_raw: skippedNoRaw,
      excluded_duplicates: dryRun ? 0 : excludedDuplicates,
      updated: dryRun ? 0 : touchedIds.length,
    });
  } catch (error) {
    console.error('Rebuild flow/signs error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default transactions;
