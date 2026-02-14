import { Hono } from 'hono';
import {
  createBudgetSchema,
  updateBudgetSchema,
  generateId,
  type Budget,
  type BudgetWithSpent,
  type BudgetsResponse,
} from '@expense/shared';
import type { Env } from '../types';
import { getScopeUserId } from '../lib/request-scope';

const budgets = new Hono<{ Bindings: Env }>();

// Helper to get budget with spent amount
async function getBudgetWithSpent(db: D1Database, budgetId: string, userId: string): Promise<BudgetWithSpent | null> {
  const budget = await db
    .prepare('SELECT * FROM budgets WHERE id = ? AND user_id = ?')
    .bind(budgetId, userId)
    .first<Budget & { category_id?: string | null; amount?: number }>();

  if (!budget) return null;

  // Get total budget amount (if stored directly or sum of items)
  let totalAmount = budget.amount || 0;
  let categoryId = budget.category_id || null;

  // If no direct amount, calculate from budget_items
  if (!totalAmount) {
    const itemsResult = await db
      .prepare(`
        SELECT COALESCE(SUM(amount), 0) as total,
               MIN(category_id) as first_category
        FROM budget_items
        WHERE budget_id = ?
      `)
      .bind(budgetId)
      .first<{ total: number; first_category: string | null }>();

    totalAmount = itemsResult?.total || 0;
    if (!categoryId) {
      categoryId = itemsResult?.first_category || null;
    }
  }

  // Calculate spent amount for the budget period
  let spentQuery = `
    SELECT COALESCE(SUM(ABS(t.amount)), 0) as spent
    FROM transactions t
    LEFT JOIN transaction_meta tm ON t.id = tm.transaction_id
    WHERE t.tx_date >= ?
      AND (? IS NULL OR t.tx_date <= ?)
      AND t.amount < 0
      AND t.user_id = ?
  `;
  const spentParams: (string | null)[] = [budget.start_date, budget.end_date, budget.end_date, userId];

  if (categoryId) {
    spentQuery += ' AND tm.category_id = ?';
    spentParams.push(categoryId);
  }

  const spentResult = await db
    .prepare(spentQuery)
    .bind(...spentParams)
    .first<{ spent: number }>();

  return {
    id: budget.id,
    name: budget.name,
    amount: totalAmount,
    spent: spentResult?.spent || 0,
    period: budget.period_type,
    category_id: categoryId,
    start_date: budget.start_date,
    end_date: budget.end_date,
  };
}

// Get all budgets
budgets.get('/', async (c) => {
  try {
    const scopeUserId = getScopeUserId(c as any);
    if (!scopeUserId) return c.json({ error: 'Unauthorized' }, 401);

    const activeOnly = c.req.query('active') === 'true';

    let query = 'SELECT id FROM budgets WHERE user_id = ?';
    const params: Array<string | number> = [scopeUserId];
    if (activeOnly) {
      query += ' AND is_active = 1';
    }
    query += ' ORDER BY start_date DESC';

    const result = await c.env.DB.prepare(query).bind(...params).all<{ id: string }>();

    const budgetsList: BudgetWithSpent[] = [];
    for (const { id } of result.results || []) {
      const budget = await getBudgetWithSpent(c.env.DB, id, scopeUserId);
      if (budget) budgetsList.push(budget);
    }

    const response: BudgetsResponse = {
      budgets: budgetsList,
    };

    return c.json(response);
  } catch (error) {
    console.error('Budgets list error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get current active budget
budgets.get('/current', async (c) => {
  try {
    const scopeUserId = getScopeUserId(c as any);
    if (!scopeUserId) return c.json({ error: 'Unauthorized' }, 401);

    const today = new Date().toISOString().split('T')[0];

    const result = await c.env.DB
      .prepare(`
        SELECT id FROM budgets
        WHERE user_id = ?
          AND is_active = 1
          AND start_date <= ?
          AND (end_date IS NULL OR end_date >= ?)
        ORDER BY start_date DESC
        LIMIT 1
      `)
      .bind(scopeUserId, today, today)
      .first<{ id: string }>();

    if (!result) {
      return c.json({ budget: null });
    }

    const budget = await getBudgetWithSpent(c.env.DB, result.id, scopeUserId);
    return c.json({ budget });
  } catch (error) {
    console.error('Current budget error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get single budget
budgets.get('/:id', async (c) => {
  try {
    const scopeUserId = getScopeUserId(c as any);
    if (!scopeUserId) return c.json({ error: 'Unauthorized' }, 401);

    const id = c.req.param('id');
    const budget = await getBudgetWithSpent(c.env.DB, id, scopeUserId);

    if (!budget) {
      return c.json({ error: 'Budget not found' }, 404);
    }

    return c.json(budget);
  } catch (error) {
    console.error('Budget get error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Create budget (simplified - single category budget)
budgets.post('/', async (c) => {
  try {
    const scopeUserId = getScopeUserId(c as any);
    if (!scopeUserId) return c.json({ error: 'Unauthorized' }, 401);

    const body = await c.req.json();
    const parsed = createBudgetSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.message }, 400);
    }

    const { name, amount, period, category_id, start_date, end_date } = parsed.data;

    // Validate category if provided
    if (category_id) {
      const exists = await c.env.DB
        .prepare('SELECT 1 FROM categories WHERE id = ?')
        .bind(category_id)
        .first();
      if (!exists) {
        return c.json({ error: `Category not found: ${category_id}` }, 400);
      }
    }

    const budgetId = generateId();
    const now = new Date().toISOString();
    const budgetStartDate = start_date || now.split('T')[0];

    // Create budget
    await c.env.DB
      .prepare(`
        INSERT INTO budgets (id, name, period_type, start_date, end_date, is_active, created_at, updated_at, user_id)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
      `)
      .bind(budgetId, name, period, budgetStartDate, end_date || null, now, now, scopeUserId)
      .run();

    // Create budget item if category specified
    if (category_id) {
      const itemId = generateId();
      await c.env.DB
        .prepare(`
          INSERT INTO budget_items (id, budget_id, category_id, amount, created_at)
          VALUES (?, ?, ?, ?, ?)
        `)
        .bind(itemId, budgetId, category_id, amount, now)
        .run();
    }

    const created = await getBudgetWithSpent(c.env.DB, budgetId, scopeUserId);
    return c.json(created, 201);
  } catch (error) {
    console.error('Budget create error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Update budget
budgets.put('/:id', async (c) => {
  try {
    const scopeUserId = getScopeUserId(c as any);
    if (!scopeUserId) return c.json({ error: 'Unauthorized' }, 401);

    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = updateBudgetSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.message }, 400);
    }

    const existing = await c.env.DB
      .prepare('SELECT 1 FROM budgets WHERE id = ? AND user_id = ?')
      .bind(id, scopeUserId)
      .first();

    if (!existing) {
      return c.json({ error: 'Budget not found' }, 404);
    }

    const { name, amount, period, category_id, start_date, end_date } = parsed.data;
    const now = new Date().toISOString();

    // Update budget
    const updates: string[] = ['updated_at = ?'];
    const params: (string | number | null)[] = [now];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    if (period !== undefined) {
      updates.push('period_type = ?');
      params.push(period);
    }
    if (start_date !== undefined) {
      updates.push('start_date = ?');
      params.push(start_date);
    }
    if (end_date !== undefined) {
      updates.push('end_date = ?');
      params.push(end_date);
    }

    params.push(id);
    params.push(scopeUserId);
    await c.env.DB
      .prepare(`UPDATE budgets SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`)
      .bind(...params)
      .run();

    // Update budget item if amount or category changed
    if (amount !== undefined || category_id !== undefined) {
      // Delete existing items
      await c.env.DB
        .prepare('DELETE FROM budget_items WHERE budget_id = ?')
        .bind(id)
        .run();

      // Create new item if we have both amount and category
      if (category_id) {
        const itemId = generateId();
        await c.env.DB
          .prepare(`
            INSERT INTO budget_items (id, budget_id, category_id, amount, created_at)
            VALUES (?, ?, ?, ?, ?)
          `)
          .bind(itemId, id, category_id, amount || 0, now)
          .run();
      }
    }

    const updated = await getBudgetWithSpent(c.env.DB, id, scopeUserId);
    return c.json(updated);
  } catch (error) {
    console.error('Budget update error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Delete budget
budgets.delete('/:id', async (c) => {
  try {
    const scopeUserId = getScopeUserId(c as any);
    if (!scopeUserId) return c.json({ error: 'Unauthorized' }, 401);

    const id = c.req.param('id');

    const result = await c.env.DB
      .prepare('DELETE FROM budgets WHERE id = ? AND user_id = ?')
      .bind(id, scopeUserId)
      .run();

    if (result.meta.changes === 0) {
      return c.json({ error: 'Budget not found' }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Budget delete error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default budgets;
