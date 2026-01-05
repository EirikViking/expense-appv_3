import { Hono } from 'hono';
import { transactionsQuerySchema, type Transaction, type TransactionsResponse } from '@expense/shared';
import type { Env } from '../types';

const transactions = new Hono<{ Bindings: Env }>();

transactions.get('/', async (c) => {
  try {
    const query = c.req.query();
    const parsed = transactionsQuerySchema.safeParse(query);

    if (!parsed.success) {
      return c.json({ error: 'Invalid query parameters', details: parsed.error.message }, 400);
    }

    const { date_from, date_to, status, source_type, limit, offset } = parsed.data;

    // Build query dynamically
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (date_from) {
      conditions.push('tx_date >= ?');
      params.push(date_from);
    }

    if (date_to) {
      conditions.push('tx_date <= ?');
      params.push(date_to);
    }

    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    if (source_type) {
      conditions.push('source_type = ?');
      params.push(source_type);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM transactions ${whereClause}`;
    const countResult = await c.env.DB.prepare(countQuery).bind(...params).first<{ total: number }>();
    const total = countResult?.total || 0;

    // Get transactions with pagination
    const selectQuery = `
      SELECT * FROM transactions
      ${whereClause}
      ORDER BY tx_date DESC, created_at DESC
      LIMIT ? OFFSET ?
    `;

    const results = await c.env.DB.prepare(selectQuery)
      .bind(...params, limit, offset)
      .all<Transaction>();

    const response: TransactionsResponse = {
      transactions: results.results || [],
      total,
    };

    return c.json(response);
  } catch (error) {
    console.error('Transactions query error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default transactions;
