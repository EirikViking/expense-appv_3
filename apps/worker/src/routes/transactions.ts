import { Hono } from 'hono';
import {
  transactionsQuerySchema,
  type Transaction,
  type TransactionWithMeta,
  type TransactionsResponse,
  DEFAULT_PAGE_SIZE,
} from '@expense/shared';
import type { Env } from '../types';

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

  // Enrich transactions
  return txs.map(tx => {
    const meta = metaMap.get(tx.id);
    const tags = tagsMap.get(tx.id) || [];

    return {
      ...tx,
      category_id: meta?.category_id || null,
      category_name: meta?.category_name || null,
      category_color: meta?.category_color || null,
      merchant_id: meta?.merchant_id || null,
      merchant_name: meta?.merchant_name || null,
      notes: meta?.notes || null,
      is_recurring: meta?.is_recurring === 1,
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

      conditions.push('COALESCE(m.canonical_name, t.description) = ?');
      params.push(merchant_name);
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

export default transactions;
