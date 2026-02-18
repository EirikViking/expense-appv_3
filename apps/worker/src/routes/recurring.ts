import { Hono } from 'hono';
import {
  createRecurringSchema,
  updateRecurringSchema,
  generateId,
  type Recurring,
  type RecurringResponse,
  type Transaction,
} from '@expense/shared';
import type { Env } from '../types';
import { getScopeUserId } from '../lib/request-scope';

const recurring = new Hono<{ Bindings: Env }>();

// Parse pattern JSON
function parsePattern(patternJson: string): Record<string, unknown> {
  try {
    return JSON.parse(patternJson);
  } catch {
    return {};
  }
}

// Get all recurring items
recurring.get('/', async (c) => {
  try {
    const scopeUserId = getScopeUserId(c as any);
    if (!scopeUserId) return c.json({ error: 'Unauthorized' }, 401);

    const activeOnly = c.req.query('active') === 'true';
    const subscriptionsOnly = c.req.query('subscriptions') === 'true';

    let query = 'SELECT * FROM recurring WHERE user_id = ?';
    const params: Array<string | number> = [scopeUserId];
    if (activeOnly) {
      query += ' AND is_active = 1';
    }
    if (subscriptionsOnly) {
      query += ' AND is_subscription = 1';
    }
    query += ' ORDER BY name';

    const result = await c.env.DB.prepare(query).bind(...params).all<{
      id: string;
      name: string;
      merchant_id: string | null;
      category_id: string | null;
      amount_expected: number | null;
      amount_min: number | null;
      amount_max: number | null;
      cadence: string;
      day_of_month: number | null;
      pattern: string;
      is_active: number;
      is_subscription: number;
      last_occurrence: string | null;
      next_expected: string | null;
      created_at: string;
      updated_at: string;
    }>();

    const items: Recurring[] = (result.results || []).map(r => ({
      ...r,
      pattern: parsePattern(r.pattern),
      is_active: Boolean(r.is_active),
      is_subscription: Boolean(r.is_subscription),
      cadence: r.cadence as Recurring['cadence'],
    }));

    const response: RecurringResponse = { items };
    return c.json(response);
  } catch (error) {
    console.error('Recurring list error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get single recurring item
recurring.get('/:id', async (c) => {
  try {
    const scopeUserId = getScopeUserId(c as any);
    if (!scopeUserId) return c.json({ error: 'Unauthorized' }, 401);

    const id = c.req.param('id');

    const result = await c.env.DB
      .prepare('SELECT * FROM recurring WHERE id = ? AND user_id = ?')
      .bind(id, scopeUserId)
      .first();

    if (!result) {
      return c.json({ error: 'Recurring item not found' }, 404);
    }

    return c.json({
      ...result,
      pattern: parsePattern(result.pattern as string),
      is_active: Boolean(result.is_active),
      is_subscription: Boolean(result.is_subscription),
    });
  } catch (error) {
    console.error('Recurring get error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Create recurring item
recurring.post('/', async (c) => {
  try {
    const scopeUserId = getScopeUserId(c as any);
    if (!scopeUserId) return c.json({ error: 'Unauthorized' }, 401);

    const body = await c.req.json();
    const parsed = createRecurringSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.message }, 400);
    }

    const {
      name,
      merchant_id,
      category_id,
      amount_expected,
      amount_min,
      amount_max,
      cadence,
      day_of_month,
      is_subscription,
    } = parsed.data;

    // Validate merchant if provided
    if (merchant_id) {
      const exists = await c.env.DB
        .prepare('SELECT 1 FROM merchants WHERE id = ?')
        .bind(merchant_id)
        .first();
      if (!exists) {
        return c.json({ error: 'Merchant not found' }, 400);
      }
    }

    // Validate category if provided
    if (category_id) {
      const exists = await c.env.DB
        .prepare('SELECT 1 FROM categories WHERE id = ?')
        .bind(category_id)
        .first();
      if (!exists) {
        return c.json({ error: 'Category not found' }, 400);
      }
    }

    const id = generateId();
    const now = new Date().toISOString();

    await c.env.DB
      .prepare(`
        INSERT INTO recurring (
          id, name, merchant_id, category_id, amount_expected, amount_min, amount_max,
          cadence, day_of_month, pattern, is_active, is_subscription, created_at, updated_at, user_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
      `)
      .bind(
        id,
        name,
        merchant_id || null,
        category_id || null,
        amount_expected || null,
        amount_min || null,
        amount_max || null,
        cadence,
        day_of_month || null,
        '{}',
        is_subscription ? 1 : 0,
        now,
        now,
        scopeUserId
      )
      .run();

    const created = await c.env.DB
      .prepare('SELECT * FROM recurring WHERE id = ? AND user_id = ?')
      .bind(id, scopeUserId)
      .first();

    return c.json({
      ...created,
      pattern: {},
      is_active: true,
      is_subscription: Boolean(is_subscription),
    }, 201);
  } catch (error) {
    console.error('Recurring create error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Update recurring item
recurring.put('/:id', async (c) => {
  try {
    const scopeUserId = getScopeUserId(c as any);
    if (!scopeUserId) return c.json({ error: 'Unauthorized' }, 401);

    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = updateRecurringSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.message }, 400);
    }

    const existing = await c.env.DB
      .prepare('SELECT 1 FROM recurring WHERE id = ? AND user_id = ?')
      .bind(id, scopeUserId)
      .first();

    if (!existing) {
      return c.json({ error: 'Recurring item not found' }, 404);
    }

    const {
      name,
      merchant_id,
      category_id,
      amount_expected,
      amount_min,
      amount_max,
      cadence,
      day_of_month,
      is_active,
      is_subscription,
    } = parsed.data;

    const updates: string[] = ['updated_at = ?'];
    const params: (string | number | null)[] = [new Date().toISOString()];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    if (merchant_id !== undefined) {
      updates.push('merchant_id = ?');
      params.push(merchant_id);
    }
    if (category_id !== undefined) {
      updates.push('category_id = ?');
      params.push(category_id);
    }
    if (amount_expected !== undefined) {
      updates.push('amount_expected = ?');
      params.push(amount_expected);
    }
    if (amount_min !== undefined) {
      updates.push('amount_min = ?');
      params.push(amount_min);
    }
    if (amount_max !== undefined) {
      updates.push('amount_max = ?');
      params.push(amount_max);
    }
    if (cadence !== undefined) {
      updates.push('cadence = ?');
      params.push(cadence);
    }
    if (day_of_month !== undefined) {
      updates.push('day_of_month = ?');
      params.push(day_of_month);
    }
    if (is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(is_active ? 1 : 0);
    }
    if (is_subscription !== undefined) {
      updates.push('is_subscription = ?');
      params.push(is_subscription ? 1 : 0);
    }

    params.push(id, scopeUserId);
    await c.env.DB
      .prepare(`UPDATE recurring SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`)
      .bind(...params)
      .run();

    const updated = await c.env.DB
      .prepare('SELECT * FROM recurring WHERE id = ? AND user_id = ?')
      .bind(id, scopeUserId)
      .first();

    return c.json({
      ...updated,
      pattern: parsePattern(updated?.pattern as string || '{}'),
      is_active: Boolean(updated?.is_active),
      is_subscription: Boolean(updated?.is_subscription),
    });
  } catch (error) {
    console.error('Recurring update error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Delete recurring item
recurring.delete('/:id', async (c) => {
  try {
    const scopeUserId = getScopeUserId(c as any);
    if (!scopeUserId) return c.json({ error: 'Unauthorized' }, 401);

    const id = c.req.param('id');

    const result = await c.env.DB
      .prepare('DELETE FROM recurring WHERE id = ? AND user_id = ?')
      .bind(id, scopeUserId)
      .run();

    if (result.meta.changes === 0) {
      return c.json({ error: 'Recurring item not found' }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Recurring delete error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Detect potential subscriptions from transaction history
recurring.get('/detect', async (c) => {
  try {
    const scopeUserId = getScopeUserId(c as any);
    if (!scopeUserId) return c.json({ error: 'Unauthorized' }, 401);

    const minOccurrences = parseInt(c.req.query('min') || '3');
    const lookbackMonths = parseInt(c.req.query('months') || '6');

    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - lookbackMonths);
    const startDateStr = startDate.toISOString().split('T')[0];

    // Find merchants with recurring patterns
    // Group by merchant (from description) and find similar amounts
    const result = await c.env.DB
      .prepare(`
        SELECT
          t.description,
          ROUND(ABS(t.amount), 0) as rounded_amount,
          COUNT(*) as occurrence_count,
          MIN(t.tx_date) as first_date,
          MAX(t.tx_date) as last_date,
          GROUP_CONCAT(t.id) as transaction_ids,
          AVG(ABS(t.amount)) as avg_amount
        FROM transactions t
        WHERE t.tx_date >= ?
          AND t.user_id = ?
          AND t.amount < 0
        GROUP BY t.description, rounded_amount
        HAVING COUNT(*) >= ?
        ORDER BY occurrence_count DESC
        LIMIT 50
      `)
      .bind(startDateStr, scopeUserId, minOccurrences)
      .all<{
        description: string;
        rounded_amount: number;
        occurrence_count: number;
        first_date: string;
        last_date: string;
        transaction_ids: string;
        avg_amount: number;
      }>();

    const detections = (result.results || []).map(r => {
      // Estimate cadence based on date spread and count
      const firstDate = new Date(r.first_date);
      const lastDate = new Date(r.last_date);
      const daySpan = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24);
      const avgDaysBetween = daySpan / (r.occurrence_count - 1);

      let cadence: string;
      let confidence: number;

      if (avgDaysBetween >= 25 && avgDaysBetween <= 35) {
        cadence = 'monthly';
        confidence = 0.9;
      } else if (avgDaysBetween >= 85 && avgDaysBetween <= 100) {
        cadence = 'quarterly';
        confidence = 0.8;
      } else if (avgDaysBetween >= 350 && avgDaysBetween <= 380) {
        cadence = 'yearly';
        confidence = 0.7;
      } else if (avgDaysBetween >= 6 && avgDaysBetween <= 8) {
        cadence = 'weekly';
        confidence = 0.8;
      } else if (avgDaysBetween >= 12 && avgDaysBetween <= 16) {
        cadence = 'biweekly';
        confidence = 0.7;
      } else {
        cadence = 'unknown';
        confidence = 0.3;
      }

      // Calculate expected next date
      const nextDate = new Date(lastDate);
      if (cadence === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
      else if (cadence === 'quarterly') nextDate.setMonth(nextDate.getMonth() + 3);
      else if (cadence === 'yearly') nextDate.setFullYear(nextDate.getFullYear() + 1);
      else if (cadence === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
      else if (cadence === 'biweekly') nextDate.setDate(nextDate.getDate() + 14);

      return {
        merchant_name: r.description.substring(0, 50),
        merchant_id: null,
        amount: r.avg_amount,
        frequency: cadence,
        confidence,
        last_date: r.last_date,
        next_expected: nextDate.toISOString().split('T')[0],
        transaction_ids: r.transaction_ids.split(','),
        occurrence_count: r.occurrence_count,
      };
    });

    return c.json({
      detections: detections.filter(d => d.confidence > 0.5),
    });
  } catch (error) {
    console.error('Recurring detect error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default recurring;
