import { Hono } from 'hono';
import {
  createBudgetSchema,
  updateBudgetSchema,
  updateBudgetSettingsSchema,
  generateId,
  type Budget,
  type BudgetWithSpent,
  type BudgetsResponse,
  type BudgetSettings,
  type BudgetTrackingPeriod,
  type BudgetTrackingResponse,
} from '@expense/shared';
import type { Env } from '../types';
import { getScopeUserId } from '../lib/request-scope';

const budgets = new Hono<{ Bindings: Env }>();

type BudgetSettingsRow = {
  enabled: number;
  weekly_amount: number | null;
  monthly_amount: number | null;
  yearly_amount: number | null;
  updated_at: string | null;
};

async function ensureBudgetSettingsSchema(db: D1Database): Promise<void> {
  await db
    .prepare(`
      CREATE TABLE IF NOT EXISTS budget_settings (
        user_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 0,
        weekly_amount REAL,
        monthly_amount REAL,
        yearly_amount REAL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
    .run();

  const columnsRes = await db.prepare('PRAGMA table_info(budget_settings)').all<{ name: string }>();
  const columns = new Set((columnsRes.results || []).map((row) => String(row.name)));

  if (!columns.has('enabled')) {
    await db.prepare('ALTER TABLE budget_settings ADD COLUMN enabled INTEGER NOT NULL DEFAULT 0').run();
  }
  if (!columns.has('weekly_amount')) {
    await db.prepare('ALTER TABLE budget_settings ADD COLUMN weekly_amount REAL').run();
  }
  if (!columns.has('monthly_amount')) {
    await db.prepare('ALTER TABLE budget_settings ADD COLUMN monthly_amount REAL').run();
  }
  if (!columns.has('yearly_amount')) {
    await db.prepare('ALTER TABLE budget_settings ADD COLUMN yearly_amount REAL').run();
  }
  if (!columns.has('created_at')) {
    await db.prepare(`ALTER TABLE budget_settings ADD COLUMN created_at TEXT DEFAULT (datetime('now'))`).run();
  }
  if (!columns.has('updated_at')) {
    await db.prepare(`ALTER TABLE budget_settings ADD COLUMN updated_at TEXT DEFAULT (datetime('now'))`).run();
  }

  await db.prepare('CREATE INDEX IF NOT EXISTS idx_budget_settings_enabled ON budget_settings(enabled)').run();
}

function toDateIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseAsOfDate(raw: string | undefined): Date {
  if (!raw) return startOfUtcDay(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return startOfUtcDay(new Date());
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return startOfUtcDay(new Date());
  return startOfUtcDay(parsed);
}

function getPeriodRange(period: 'weekly' | 'monthly' | 'yearly', asOf: Date): { start: Date; end: Date } {
  if (period === 'weekly') {
    const start = new Date(asOf);
    const day = (start.getUTCDay() + 6) % 7; // Monday=0
    start.setUTCDate(start.getUTCDate() - day);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    return { start, end };
  }

  if (period === 'monthly') {
    const start = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1));
    const end = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + 1, 0));
    return { start, end };
  }

  const start = new Date(Date.UTC(asOf.getUTCFullYear(), 0, 1));
  const end = new Date(Date.UTC(asOf.getUTCFullYear(), 11, 31));
  return { start, end };
}

function daysBetweenInclusive(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(1, Math.floor(ms / 86_400_000) + 1);
}

function buildTrackingPeriod(
  period: 'weekly' | 'monthly' | 'yearly',
  budgetAmount: number,
  spentAmount: number,
  asOf: Date,
): BudgetTrackingPeriod {
  const { start, end } = getPeriodRange(period, asOf);
  const daysTotal = daysBetweenInclusive(start, end);
  const daysElapsed = clamp(daysBetweenInclusive(start, asOf), 1, daysTotal);
  const daysRemaining = Math.max(0, daysTotal - daysElapsed);

  const progressRatio = budgetAmount > 0 ? spentAmount / budgetAmount : 0;
  const expectedRatio = daysElapsed / daysTotal;
  const projectedSpent = daysElapsed > 0 ? (spentAmount / daysElapsed) * daysTotal : spentAmount;
  const projectedVariance = budgetAmount - projectedSpent;

  let status: BudgetTrackingPeriod['status'] = 'on_track';
  if (spentAmount > budgetAmount) {
    status = 'over_budget';
  } else if (progressRatio > expectedRatio + 0.1) {
    status = 'warning';
  }

  return {
    period,
    label: period,
    start_date: toDateIso(start),
    end_date: toDateIso(end),
    budget_amount: budgetAmount,
    spent_amount: spentAmount,
    remaining_amount: budgetAmount - spentAmount,
    progress_ratio: progressRatio,
    status,
    days_elapsed: daysElapsed,
    days_total: daysTotal,
    days_remaining: daysRemaining,
    projected_spent: projectedSpent,
    projected_variance: projectedVariance,
  };
}

async function loadBudgetSettings(db: D1Database, userId: string): Promise<BudgetSettings> {
  await ensureBudgetSettingsSchema(db);

  const row = await db
    .prepare('SELECT enabled, weekly_amount, monthly_amount, yearly_amount, updated_at FROM budget_settings WHERE user_id = ?')
    .bind(userId)
    .first<BudgetSettingsRow>();

  if (!row) {
    return {
      enabled: false,
      weekly_amount: null,
      monthly_amount: null,
      yearly_amount: null,
      updated_at: null,
    };
  }

  return {
    enabled: row.enabled === 1,
    weekly_amount: row.weekly_amount == null ? null : Number(row.weekly_amount),
    monthly_amount: row.monthly_amount == null ? null : Number(row.monthly_amount),
    yearly_amount: row.yearly_amount == null ? null : Number(row.yearly_amount),
    updated_at: row.updated_at,
  };
}

async function getSpentForRange(db: D1Database, userId: string, startDate: string, endDate: string): Promise<number> {
  const row = await db
    .prepare(`
      SELECT COALESCE(SUM(ABS(t.amount)), 0) as spent
      FROM transactions t
      WHERE t.user_id = ?
        AND t.tx_date >= ?
        AND t.tx_date <= ?
        AND t.amount < 0
        AND t.is_excluded = 0
        AND COALESCE(t.is_transfer, 0) = 0
    `)
    .bind(userId, startDate, endDate)
    .first<{ spent: number }>();

  return row?.spent == null ? 0 : Number(row.spent);
}

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

budgets.get('/settings', async (c) => {
  try {
    const scopeUserId = getScopeUserId(c as any);
    if (!scopeUserId) return c.json({ error: 'Unauthorized' }, 401);

    const settings = await loadBudgetSettings(c.env.DB, scopeUserId);
    return c.json({ settings });
  } catch (error) {
    console.error('Budget settings get error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

budgets.put('/settings', async (c) => {
  try {
    const scopeUserId = getScopeUserId(c as any);
    if (!scopeUserId) return c.json({ error: 'Unauthorized' }, 401);

    const body = await c.req.json();
    const parsed = updateBudgetSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.message }, 400);
    }

    const existing = await loadBudgetSettings(c.env.DB, scopeUserId);
    const nextSettings: BudgetSettings = {
      enabled: parsed.data.enabled,
      weekly_amount: parsed.data.weekly_amount !== undefined ? parsed.data.weekly_amount : existing.weekly_amount,
      monthly_amount: parsed.data.monthly_amount !== undefined ? parsed.data.monthly_amount : existing.monthly_amount,
      yearly_amount: parsed.data.yearly_amount !== undefined ? parsed.data.yearly_amount : existing.yearly_amount,
      updated_at: new Date().toISOString(),
    };

    const now = new Date().toISOString();
    await c.env.DB
      .prepare(`
        INSERT INTO budget_settings (user_id, enabled, weekly_amount, monthly_amount, yearly_amount, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          enabled = excluded.enabled,
          weekly_amount = excluded.weekly_amount,
          monthly_amount = excluded.monthly_amount,
          yearly_amount = excluded.yearly_amount,
          updated_at = excluded.updated_at
      `)
      .bind(
        scopeUserId,
        nextSettings.enabled ? 1 : 0,
        nextSettings.weekly_amount,
        nextSettings.monthly_amount,
        nextSettings.yearly_amount,
        now,
        now,
      )
      .run();

    const settings = await loadBudgetSettings(c.env.DB, scopeUserId);
    return c.json({ settings });
  } catch (error) {
    console.error('Budget settings update error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

budgets.get('/tracking', async (c) => {
  try {
    const scopeUserId = getScopeUserId(c as any);
    if (!scopeUserId) return c.json({ error: 'Unauthorized' }, 401);

    const settings = await loadBudgetSettings(c.env.DB, scopeUserId);
    const asOf = parseAsOfDate(c.req.query('as_of'));

    if (!settings.enabled) {
      const response: BudgetTrackingResponse = {
        enabled: false,
        settings,
        periods: [],
        generated_at: new Date().toISOString(),
      };
      return c.json(response);
    }

    const configs: Array<{ period: 'weekly' | 'monthly' | 'yearly'; amount: number | null }> = [
      { period: 'weekly', amount: settings.weekly_amount },
      { period: 'monthly', amount: settings.monthly_amount },
      { period: 'yearly', amount: settings.yearly_amount },
    ];

    const periods: BudgetTrackingPeriod[] = [];
    for (const config of configs) {
      if (config.amount == null || config.amount <= 0) continue;
      const range = getPeriodRange(config.period, asOf);
      const spent = await getSpentForRange(c.env.DB, scopeUserId, toDateIso(range.start), toDateIso(range.end));
      periods.push(buildTrackingPeriod(config.period, config.amount, spent, asOf));
    }

    const response: BudgetTrackingResponse = {
      enabled: true,
      settings,
      periods,
      generated_at: new Date().toISOString(),
    };

    return c.json(response);
  } catch (error) {
    console.error('Budget tracking error:', error);
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
