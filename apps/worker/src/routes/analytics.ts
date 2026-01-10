import { Hono } from 'hono';
import {
  analyticsQuerySchema,
  compareQuerySchema,
  type AnalyticsSummary,
  type MerchantBreakdown,
  type TimeSeriesPoint,
  type AnomalyItem,
  type PeriodComparison,
  type SubscriptionDetection,
} from '@expense/shared';
import type { Env } from '../types';
import { buildCategoryBreakdown } from '../lib/analytics';

const analytics = new Hono<{ Bindings: Env }>();

// Build WHERE clause from query params
// By default, excludes transactions marked as is_excluded unless include_excluded is true
function buildWhereClause(params: Record<string, unknown>, options?: { include_excluded?: boolean }): { clause: string; bindings: (string | number)[] } {
  const conditions: string[] = [];
  const bindings: (string | number)[] = [];

  // Default: exclude transactions marked as excluded (is_excluded = 0 or NULL for old rows)
  if (!options?.include_excluded) {
    conditions.push('COALESCE(t.is_excluded, 0) = 0');
  }

  if (params.date_from) {
    conditions.push('t.tx_date >= ?');
    bindings.push(params.date_from as string);
  }
  if (params.date_to) {
    conditions.push('t.tx_date <= ?');
    bindings.push(params.date_to as string);
  }
  if (params.status) {
    conditions.push('t.status = ?');
    bindings.push(params.status as string);
  }
  if (params.source_type) {
    conditions.push('t.source_type = ?');
    bindings.push(params.source_type as string);
  }
  if (params.category_id) {
    conditions.push('tm.category_id = ?');
    bindings.push(params.category_id as string);
  }
  if (params.merchant_id) {
    conditions.push('tm.merchant_id = ?');
    bindings.push(params.merchant_id as string);
  }
  if (params.tag_id) {
    conditions.push('EXISTS (SELECT 1 FROM transaction_tags tt WHERE tt.transaction_id = t.id AND tt.tag_id = ?)');
    bindings.push(params.tag_id as string);
  }

  return {
    clause: conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '',
    bindings,
  };
}

// Summary endpoint - totals for period
analytics.get('/summary', async (c) => {
  try {
    const query = c.req.query();
    const parsed = analyticsQuerySchema.safeParse(query);

    if (!parsed.success) {
      return c.json({ error: 'Invalid query', details: parsed.error.message }, 400);
    }

    const { date_from, date_to, status, source_type, category_id, merchant_id, tag_id } = parsed.data;
    const { clause, bindings } = buildWhereClause({ date_from, date_to, status, source_type, category_id, merchant_id, tag_id });

    // Join with categories to check is_transfer for income calculation
    // Transfers (where category is_transfer=1) should NOT count as income
    const result = await c.env.DB
      .prepare(`
        SELECT
          COALESCE(SUM(CASE 
            WHEN t.amount > 0 AND COALESCE(c.is_transfer, 0) = 0 
            THEN t.amount ELSE 0 
          END), 0) as total_income,
          COALESCE(SUM(CASE WHEN t.amount < 0 THEN ABS(t.amount) ELSE 0 END), 0) as total_expenses,
          COALESCE(SUM(t.amount), 0) as net,
          COALESCE(SUM(CASE WHEN t.status = 'pending' THEN 1 ELSE 0 END), 0) as pending_count,
          COALESCE(SUM(CASE WHEN t.status = 'pending' THEN ABS(t.amount) ELSE 0 END), 0) as pending_amount,
          COALESCE(SUM(CASE WHEN t.status = 'booked' THEN 1 ELSE 0 END), 0) as booked_count,
          COALESCE(SUM(CASE WHEN t.status = 'booked' THEN ABS(t.amount) ELSE 0 END), 0) as booked_amount,
          COUNT(*) as transaction_count,
          COALESCE(AVG(ABS(t.amount)), 0) as avg_transaction
        FROM transactions t
        LEFT JOIN transaction_meta tm ON t.id = tm.transaction_id
        LEFT JOIN categories c ON tm.category_id = c.id
        ${clause}
      `)
      .bind(...bindings)
      .first<{
        total_income: number;
        total_expenses: number;
        net: number;
        pending_count: number;
        pending_amount: number;
        booked_count: number;
        booked_amount: number;
        transaction_count: number;
        avg_transaction: number;
      }>();

    const summary: AnalyticsSummary = {
      total_income: result?.total_income || 0,
      total_expenses: result?.total_expenses || 0,
      net: result?.net || 0,
      pending_count: result?.pending_count || 0,
      pending_amount: result?.pending_amount || 0,
      booked_count: result?.booked_count || 0,
      booked_amount: result?.booked_amount || 0,
      transaction_count: result?.transaction_count || 0,
      avg_transaction: result?.avg_transaction || 0,
      period: {
        start: date_from,
        end: date_to,
      },
    };

    return c.json(summary);
  } catch (error) {
    console.error('Analytics summary error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// By category breakdown
analytics.get('/by-category', async (c) => {
  try {
    const query = c.req.query();
    const parsed = analyticsQuerySchema.safeParse(query);

    if (!parsed.success) {
      return c.json({ error: 'Invalid query', details: parsed.error.message }, 400);
    }

    const { date_from, date_to, status, source_type, tag_id } = parsed.data;

    // Build base conditions
    const conditions: string[] = ['t.tx_date >= ?', 't.tx_date <= ?', 't.amount < 0'];
    const bindings: (string | number)[] = [date_from, date_to];

    if (status) {
      conditions.push('t.status = ?');
      bindings.push(status);
    }
    if (source_type) {
      conditions.push('t.source_type = ?');
      bindings.push(source_type);
    }
    if (tag_id) {
      conditions.push('EXISTS (SELECT 1 FROM transaction_tags tt WHERE tt.transaction_id = t.id AND tt.tag_id = ?)');
      bindings.push(tag_id);
    }

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    // Get category totals
    const result = await c.env.DB
      .prepare(`
        SELECT
          c.id as category_id,
          COALESCE(c.name, 'Uncategorized') as category_name,
          c.color as category_color,
          c.parent_id,
          COALESCE(SUM(ABS(t.amount)), 0) as total,
          COUNT(*) as count
        FROM transactions t
        LEFT JOIN transaction_meta tm ON t.id = tm.transaction_id
        LEFT JOIN categories c ON tm.category_id = c.id
        ${whereClause}
        GROUP BY c.id, c.name, c.color, c.parent_id
        ORDER BY total DESC
      `)
      .bind(...bindings)
      .all<{
        category_id: string | null;
        category_name: string;
        category_color: string | null;
        parent_id: string | null;
        total: number;
        count: number;
      }>();

    const { categories, total } = buildCategoryBreakdown(result.results || []);

    return c.json({ categories, total });
  } catch (error) {
    console.error('Analytics by-category error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// By merchant breakdown
analytics.get('/by-merchant', async (c) => {
  try {
    const query = c.req.query();
    const parsed = analyticsQuerySchema.safeParse(query);

    if (!parsed.success) {
      return c.json({ error: 'Invalid query', details: parsed.error.message }, 400);
    }

    const { date_from, date_to, status, source_type, category_id, tag_id } = parsed.data;
    const limit = parseInt(c.req.query('limit') || '20');

    // Current period
    const { clause, bindings } = buildWhereClause({
      date_from,
      date_to,
      status,
      source_type,
      category_id,
      tag_id,
    });

    const currentResult = await c.env.DB
      .prepare(`
        SELECT
          m.id as merchant_id,
          COALESCE(m.canonical_name, t.description) as merchant_name,
          COALESCE(SUM(ABS(t.amount)), 0) as total,
          COUNT(*) as count,
          COALESCE(AVG(ABS(t.amount)), 0) as avg
        FROM transactions t
        LEFT JOIN transaction_meta tm ON t.id = tm.transaction_id
        LEFT JOIN merchants m ON tm.merchant_id = m.id
        ${clause} ${clause ? 'AND' : 'WHERE'} t.amount < 0
        GROUP BY m.id, COALESCE(m.canonical_name, t.description)
        ORDER BY total DESC
        LIMIT ?
      `)
      .bind(...bindings, limit)
      .all<{
        merchant_id: string | null;
        merchant_name: string;
        total: number;
        count: number;
        avg: number;
      }>();

    // Calculate previous period for trend
    const dateDiff = new Date(date_to).getTime() - new Date(date_from).getTime();
    const prevEnd = new Date(new Date(date_from).getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - dateDiff);

    const { clause: prevClause, bindings: prevBindings } = buildWhereClause({
      date_from: prevStart.toISOString().split('T')[0],
      date_to: prevEnd.toISOString().split('T')[0],
      status,
      source_type,
      category_id,
      tag_id,
    });

    const prevResult = await c.env.DB
      .prepare(`
        SELECT
          COALESCE(m.canonical_name, t.description) as merchant_name,
          COALESCE(SUM(ABS(t.amount)), 0) as total
        FROM transactions t
        LEFT JOIN transaction_meta tm ON t.id = tm.transaction_id
        LEFT JOIN merchants m ON tm.merchant_id = m.id
        ${prevClause} ${prevClause ? 'AND' : 'WHERE'} t.amount < 0
        GROUP BY COALESCE(m.canonical_name, t.description)
      `)
      .bind(...prevBindings)
      .all<{ merchant_name: string; total: number }>();

    const prevMap = new Map((prevResult.results || []).map(r => [r.merchant_name, r.total]));

    const merchants: MerchantBreakdown[] = (currentResult.results || []).map(r => {
      const prevTotal = prevMap.get(r.merchant_name) || 0;
      const trend = prevTotal > 0 ? ((r.total - prevTotal) / prevTotal) * 100 : 0;

      return {
        merchant_id: r.merchant_id,
        merchant_name: r.merchant_name,
        total: r.total,
        count: r.count,
        avg: r.avg,
        trend,
      };
    });

    return c.json({ merchants });
  } catch (error) {
    console.error('Analytics by-merchant error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Time series
analytics.get('/timeseries', async (c) => {
  try {
    const query = c.req.query();
    const parsed = analyticsQuerySchema.safeParse(query);

    if (!parsed.success) {
      return c.json({ error: 'Invalid query', details: parsed.error.message }, 400);
    }

    const { date_from, date_to, status, source_type, category_id, merchant_id, tag_id, granularity } = parsed.data;
    const { clause, bindings } = buildWhereClause({ date_from, date_to, status, source_type, category_id, merchant_id, tag_id });

    // Determine date grouping
    let dateExpr: string;
    if (granularity === 'month') {
      dateExpr = "strftime('%Y-%m', t.tx_date)";
    } else if (granularity === 'week') {
      dateExpr = "strftime('%Y-%W', t.tx_date)";
    } else {
      dateExpr = 't.tx_date';
    }

    const result = await c.env.DB
      .prepare(`
        SELECT
          ${dateExpr} as date,
          COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END), 0) as income,
          COALESCE(SUM(CASE WHEN t.amount < 0 THEN ABS(t.amount) ELSE 0 END), 0) as expenses,
          COALESCE(SUM(t.amount), 0) as net,
          COUNT(*) as count
        FROM transactions t
        LEFT JOIN transaction_meta tm ON t.id = tm.transaction_id
        ${clause}
        GROUP BY ${dateExpr}
        ORDER BY date ASC
      `)
      .bind(...bindings)
      .all<TimeSeriesPoint>();

    return c.json({ series: result.results || [] });
  } catch (error) {
    console.error('Analytics timeseries error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Subscription detection
analytics.get('/subscriptions', async (c) => {
  try {
    const minOccurrences = parseInt(c.req.query('min') || '3');
    const monthsBack = parseInt(c.req.query('months') || '6');

    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - monthsBack);
    const startDateStr = startDate.toISOString().split('T')[0];

    const result = await c.env.DB
      .prepare(`
        SELECT
          COALESCE(m.id, 'unknown') as merchant_id,
          COALESCE(m.canonical_name, t.description) as merchant_name,
          ROUND(AVG(ABS(t.amount)), 2) as amount,
          COUNT(*) as occurrence_count,
          MIN(t.tx_date) as first_date,
          MAX(t.tx_date) as last_date,
          GROUP_CONCAT(t.id) as transaction_ids
        FROM transactions t
        LEFT JOIN transaction_meta tm ON t.id = tm.transaction_id
        LEFT JOIN merchants m ON tm.merchant_id = m.id
        WHERE t.tx_date >= ?
          AND t.amount < 0
        GROUP BY COALESCE(m.id, t.description)
        HAVING COUNT(*) >= ?
          AND MAX(ABS(t.amount)) - MIN(ABS(t.amount)) < AVG(ABS(t.amount)) * 0.2
        ORDER BY occurrence_count DESC
        LIMIT 50
      `)
      .bind(startDateStr, minOccurrences)
      .all<{
        merchant_id: string;
        merchant_name: string;
        amount: number;
        occurrence_count: number;
        first_date: string;
        last_date: string;
        transaction_ids: string;
      }>();

    const subscriptions: SubscriptionDetection[] = (result.results || []).map(r => {
      const firstDate = new Date(r.first_date);
      const lastDate = new Date(r.last_date);
      const daySpan = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24);
      const avgDaysBetween = r.occurrence_count > 1 ? daySpan / (r.occurrence_count - 1) : 30;

      let frequency: SubscriptionDetection['frequency'];
      let confidence: number;

      if (avgDaysBetween >= 25 && avgDaysBetween <= 35) {
        frequency = 'monthly';
        confidence = 0.9;
      } else if (avgDaysBetween >= 85 && avgDaysBetween <= 100) {
        frequency = 'quarterly';
        confidence = 0.8;
      } else if (avgDaysBetween >= 350 && avgDaysBetween <= 380) {
        frequency = 'yearly';
        confidence = 0.7;
      } else if (avgDaysBetween >= 6 && avgDaysBetween <= 8) {
        frequency = 'weekly';
        confidence = 0.8;
      } else if (avgDaysBetween >= 12 && avgDaysBetween <= 16) {
        frequency = 'biweekly';
        confidence = 0.7;
      } else {
        frequency = 'monthly';
        confidence = 0.4;
      }

      const nextDate = new Date(lastDate);
      if (frequency === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
      else if (frequency === 'quarterly') nextDate.setMonth(nextDate.getMonth() + 3);
      else if (frequency === 'yearly') nextDate.setFullYear(nextDate.getFullYear() + 1);
      else if (frequency === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
      else if (frequency === 'biweekly') nextDate.setDate(nextDate.getDate() + 14);

      return {
        merchant_name: r.merchant_name,
        merchant_id: r.merchant_id === 'unknown' ? null : r.merchant_id,
        amount: r.amount,
        frequency,
        confidence,
        last_date: r.last_date,
        next_expected: nextDate.toISOString().split('T')[0],
        transaction_ids: r.transaction_ids.split(','),
      };
    });

    return c.json({ subscriptions: subscriptions.filter(s => s.confidence >= 0.6) });
  } catch (error) {
    console.error('Analytics subscriptions error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Anomaly detection
analytics.get('/anomalies', async (c) => {
  try {
    const query = c.req.query();
    const parsed = analyticsQuerySchema.safeParse(query);

    if (!parsed.success) {
      return c.json({ error: 'Invalid query', details: parsed.error.message }, 400);
    }

    const { date_from, date_to } = parsed.data;
    const threshold = parseFloat(c.req.query('threshold') || '2.5');

    // Get transactions with amount stats
    const statsResult = await c.env.DB
      .prepare(`
        SELECT
          AVG(ABS(amount)) as mean,
          AVG(ABS(amount) * ABS(amount)) - AVG(ABS(amount)) * AVG(ABS(amount)) as variance
        FROM transactions
        WHERE tx_date >= ? AND tx_date <= ? AND amount < 0
      `)
      .bind(date_from, date_to)
      .first<{ mean: number; variance: number }>();

    const mean = statsResult?.mean || 0;
    const stdDev = Math.sqrt(Math.max(0, statsResult?.variance || 0));

    if (stdDev === 0) {
      return c.json({ anomalies: [] });
    }

    // Find outliers
    const outlierThreshold = mean + threshold * stdDev;

    const result = await c.env.DB
      .prepare(`
        SELECT
          t.id as transaction_id,
          t.description,
          t.amount,
          t.tx_date as date
        FROM transactions t
        WHERE t.tx_date >= ? AND t.tx_date <= ?
          AND ABS(t.amount) > ?
        ORDER BY ABS(t.amount) DESC
        LIMIT 50
      `)
      .bind(date_from, date_to, outlierThreshold)
      .all<{
        transaction_id: string;
        description: string;
        amount: number;
        date: string;
      }>();

    const anomalies: AnomalyItem[] = (result.results || []).map(r => {
      const absAmount = Math.abs(r.amount);
      const zScore = (absAmount - mean) / stdDev;

      let severity: AnomalyItem['severity'];
      if (zScore > 4) severity = 'high';
      else if (zScore > 3) severity = 'medium';
      else severity = 'low';

      return {
        transaction_id: r.transaction_id,
        description: r.description,
        amount: r.amount,
        date: r.date,
        reason: `Amount ${Math.round(zScore * 10) / 10}x standard deviations from average`,
        severity,
        z_score: Math.round(zScore * 100) / 100,
      };
    });

    return c.json({
      anomalies,
      stats: { mean: Math.round(mean * 100) / 100, std_dev: Math.round(stdDev * 100) / 100 },
    });
  } catch (error) {
    console.error('Analytics anomalies error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Period comparison
analytics.get('/compare', async (c) => {
  try {
    const query = c.req.query();

    // Support both query param shapes:
    // Shape A: current_start, current_end, previous_start, previous_end
    // Shape B: date_from_1, date_to_1, date_from_2, date_to_2 (legacy)
    let normalizedQuery: {
      current_start?: string;
      current_end?: string;
      previous_start?: string;
      previous_end?: string;
    };

    if (query.date_from_1 || query.date_to_1 || query.date_from_2 || query.date_to_2) {
      // Shape B: Map to Shape A
      // date_from_1/date_to_1 = previous period, date_from_2/date_to_2 = current period
      normalizedQuery = {
        previous_start: query.date_from_1,
        previous_end: query.date_to_1,
        current_start: query.date_from_2,
        current_end: query.date_to_2,
      };
    } else {
      // Shape A: Use as-is
      normalizedQuery = {
        current_start: query.current_start,
        current_end: query.current_end,
        previous_start: query.previous_start,
        previous_end: query.previous_end,
      };
    }

    const parsed = compareQuerySchema.safeParse(normalizedQuery);

    if (!parsed.success) {
      // Build helpful error message
      const dateFormat = /^\d{4}-\d{2}-\d{2}$/;
      const missingFields: string[] = [];
      const invalidFields: string[] = [];

      const requiredFields = ['current_start', 'current_end', 'previous_start', 'previous_end'] as const;
      for (const field of requiredFields) {
        const value = normalizedQuery[field];
        if (!value) {
          missingFields.push(field);
        } else if (!dateFormat.test(value)) {
          invalidFields.push(`${field} (got: "${value}", expected: YYYY-MM-DD)`);
        }
      }

      const errorParts: string[] = [];
      if (missingFields.length > 0) {
        errorParts.push(`Missing required fields: ${missingFields.join(', ')}`);
      }
      if (invalidFields.length > 0) {
        errorParts.push(`Invalid date format: ${invalidFields.join(', ')}`);
      }

      return c.json({
        error: 'Invalid query parameters',
        details: errorParts.join('. ') || parsed.error.message,
        accepted_params: {
          shape_a: 'current_start, current_end, previous_start, previous_end',
          shape_b: 'date_from_1, date_to_1, date_from_2, date_to_2',
        },
      }, 400);
    }

    const { current_start, current_end, previous_start, previous_end } = parsed.data;

    // Get current period stats
    const currentResult = await c.env.DB
      .prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as total_income,
          COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as total_expenses,
          COALESCE(SUM(amount), 0) as net,
          COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) as pending_count,
          COALESCE(SUM(CASE WHEN status = 'pending' THEN ABS(amount) ELSE 0 END), 0) as pending_amount,
          COALESCE(SUM(CASE WHEN status = 'booked' THEN 1 ELSE 0 END), 0) as booked_count,
          COALESCE(SUM(CASE WHEN status = 'booked' THEN ABS(amount) ELSE 0 END), 0) as booked_amount,
          COUNT(*) as transaction_count,
          COALESCE(AVG(ABS(amount)), 0) as avg_transaction
        FROM transactions
        WHERE tx_date >= ? AND tx_date <= ?
      `)
      .bind(current_start, current_end)
      .first();

    // Get previous period stats
    const previousResult = await c.env.DB
      .prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as total_income,
          COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as total_expenses,
          COALESCE(SUM(amount), 0) as net,
          COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) as pending_count,
          COALESCE(SUM(CASE WHEN status = 'pending' THEN ABS(amount) ELSE 0 END), 0) as pending_amount,
          COALESCE(SUM(CASE WHEN status = 'booked' THEN 1 ELSE 0 END), 0) as booked_count,
          COALESCE(SUM(CASE WHEN status = 'booked' THEN ABS(amount) ELSE 0 END), 0) as booked_amount,
          COUNT(*) as transaction_count,
          COALESCE(AVG(ABS(amount)), 0) as avg_transaction
        FROM transactions
        WHERE tx_date >= ? AND tx_date <= ?
      `)
      .bind(previous_start, previous_end)
      .first();

    const current: AnalyticsSummary = {
      total_income: (currentResult?.total_income as number) || 0,
      total_expenses: (currentResult?.total_expenses as number) || 0,
      net: (currentResult?.net as number) || 0,
      pending_count: (currentResult?.pending_count as number) || 0,
      pending_amount: (currentResult?.pending_amount as number) || 0,
      booked_count: (currentResult?.booked_count as number) || 0,
      booked_amount: (currentResult?.booked_amount as number) || 0,
      transaction_count: (currentResult?.transaction_count as number) || 0,
      avg_transaction: (currentResult?.avg_transaction as number) || 0,
      period: { start: current_start, end: current_end },
    };

    const previous: AnalyticsSummary = {
      total_income: (previousResult?.total_income as number) || 0,
      total_expenses: (previousResult?.total_expenses as number) || 0,
      net: (previousResult?.net as number) || 0,
      pending_count: (previousResult?.pending_count as number) || 0,
      pending_amount: (previousResult?.pending_amount as number) || 0,
      booked_count: (previousResult?.booked_count as number) || 0,
      booked_amount: (previousResult?.booked_amount as number) || 0,
      transaction_count: (previousResult?.transaction_count as number) || 0,
      avg_transaction: (previousResult?.avg_transaction as number) || 0,
      period: { start: previous_start, end: previous_end },
    };

    const calcChange = (curr: number, prev: number) => curr - prev;
    const calcPct = (curr: number, prev: number) => prev !== 0 ? ((curr - prev) / prev) * 100 : 0;

    const comparison: PeriodComparison = {
      current,
      previous,
      change: {
        income: calcChange(current.total_income, previous.total_income),
        expenses: calcChange(current.total_expenses, previous.total_expenses),
        net: calcChange(current.net, previous.net),
        count: calcChange(current.transaction_count, previous.transaction_count),
      },
      change_percentage: {
        income: calcPct(current.total_income, previous.total_income),
        expenses: calcPct(current.total_expenses, previous.total_expenses),
        net: calcPct(current.net, previous.net),
        count: calcPct(current.transaction_count, previous.transaction_count),
      },
    };

    return c.json(comparison);
  } catch (error) {
    console.error('Analytics compare error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Fun facts endpoint - interesting insights about spending
interface FunFact {
  id: string;
  icon: string;
  title: string;
  value: string;
  description: string;
}

analytics.get('/fun-facts', async (c) => {
  try {
    const query = c.req.query();
    const parsed = analyticsQuerySchema.safeParse(query);

    if (!parsed.success) {
      return c.json({ error: 'Invalid query', details: parsed.error.message }, 400);
    }

    const { date_from, date_to } = parsed.data;
    const facts: FunFact[] = [];

    // Fact 1: Biggest spending day
    const biggestDayResult = await c.env.DB
      .prepare(`
        SELECT tx_date, SUM(ABS(amount)) as total
        FROM transactions
        WHERE tx_date >= ? AND tx_date <= ? AND amount < 0
          AND COALESCE(is_excluded, 0) = 0
        GROUP BY tx_date
        ORDER BY total DESC
        LIMIT 1
      `)
      .bind(date_from, date_to)
      .first<{ tx_date: string; total: number }>();

    if (biggestDayResult) {
      const date = new Date(biggestDayResult.tx_date);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
      facts.push({
        id: 'biggest-day',
        icon: '📅',
        title: 'Biggest Spending Day',
        value: `${biggestDayResult.total.toLocaleString('no-NO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} kr`,
        description: `on ${dayName}, ${biggestDayResult.tx_date}`,
      });
    }

    // Fact 2: Most frequent merchant
    const topMerchantResult = await c.env.DB
      .prepare(`
        SELECT description, COUNT(*) as count, SUM(ABS(amount)) as total
        FROM transactions
        WHERE tx_date >= ? AND tx_date <= ? AND amount < 0
          AND COALESCE(is_excluded, 0) = 0
        GROUP BY description
        ORDER BY count DESC
        LIMIT 1
      `)
      .bind(date_from, date_to)
      .first<{ description: string; count: number; total: number }>();

    if (topMerchantResult && topMerchantResult.count > 1) {
      facts.push({
        id: 'frequent-merchant',
        icon: '🏪',
        title: 'Your Go-To Place',
        value: topMerchantResult.description.slice(0, 25),
        description: `${topMerchantResult.count} visits, ${topMerchantResult.total.toLocaleString('no-NO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} kr total`,
      });
    }

    // Fact 3: Average transaction size
    const avgResult = await c.env.DB
      .prepare(`
        SELECT AVG(ABS(amount)) as avg_amount, COUNT(*) as count
        FROM transactions
        WHERE tx_date >= ? AND tx_date <= ? AND amount < 0
          AND COALESCE(is_excluded, 0) = 0
      `)
      .bind(date_from, date_to)
      .first<{ avg_amount: number; count: number }>();

    if (avgResult && avgResult.count > 0) {
      facts.push({
        id: 'avg-transaction',
        icon: '💳',
        title: 'Average Purchase',
        value: `${Math.round(avgResult.avg_amount).toLocaleString('no-NO')} kr`,
        description: `across ${avgResult.count} transactions`,
      });
    }

    // Fact 4: Spending velocity (per day)
    if (avgResult && avgResult.count > 0) {
      const daysDiff = Math.max(1, (new Date(date_to).getTime() - new Date(date_from).getTime()) / (1000 * 60 * 60 * 24));
      const perDay = (avgResult.avg_amount * avgResult.count) / daysDiff;
      facts.push({
        id: 'daily-average',
        icon: '📈',
        title: 'Daily Spending Rate',
        value: `${Math.round(perDay).toLocaleString('no-NO')} kr/day`,
        description: `or ${Math.round(perDay * 30).toLocaleString('no-NO')} kr/month at this pace`,
      });
    }

    // Fact 5: Weekend vs weekday spending
    const weekendResult = await c.env.DB
      .prepare(`
        SELECT 
          CASE WHEN strftime('%w', tx_date) IN ('0', '6') THEN 'weekend' ELSE 'weekday' END as day_type,
          SUM(ABS(amount)) as total,
          COUNT(*) as count
        FROM transactions
        WHERE tx_date >= ? AND tx_date <= ? AND amount < 0
          AND COALESCE(is_excluded, 0) = 0
        GROUP BY day_type
      `)
      .bind(date_from, date_to)
      .all<{ day_type: string; total: number; count: number }>();

    if (weekendResult.results && weekendResult.results.length === 2) {
      const weekend = weekendResult.results.find(r => r.day_type === 'weekend');
      const weekday = weekendResult.results.find(r => r.day_type === 'weekday');
      if (weekend && weekday) {
        const weekendAvg = weekend.total / 2; // 2 weekend days
        const weekdayAvg = weekday.total / 5; // 5 weekday days
        const ratio = weekendAvg / weekdayAvg;
        facts.push({
          id: 'weekend-spending',
          icon: '🎉',
          title: ratio > 1 ? 'Weekend Spender' : 'Weekday Shopper',
          value: `${Math.round(ratio * 100)}%`,
          description: ratio > 1
            ? `You spend ${Math.round((ratio - 1) * 100)}% more on weekends`
            : `You spend ${Math.round((1 - ratio) * 100)}% more on weekdays`,
        });
      }
    }

    // Fact 6: Smallest purchase
    const smallestResult = await c.env.DB
      .prepare(`
        SELECT description, ABS(amount) as amount
        FROM transactions
        WHERE tx_date >= ? AND tx_date <= ? AND amount < 0
          AND COALESCE(is_excluded, 0) = 0
        ORDER BY ABS(amount) ASC
        LIMIT 1
      `)
      .bind(date_from, date_to)
      .first<{ description: string; amount: number }>();

    if (smallestResult && smallestResult.amount > 0) {
      facts.push({
        id: 'smallest-purchase',
        icon: '🪙',
        title: 'Tiniest Purchase',
        value: `${smallestResult.amount.toFixed(2)} kr`,
        description: smallestResult.description.slice(0, 30),
      });
    }

    return c.json({ facts });
  } catch (error) {
    console.error('Analytics fun-facts error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default analytics;
