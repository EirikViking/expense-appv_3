import { Hono } from 'hono';
import {
  createRuleSchema,
  updateRuleSchema,
  applyRulesSchema,
  generateId,
  type Rule,
  type RulesResponse,
  type ApplyRulesResponse,
  type Transaction,
} from '@expense/shared';
import type { Env } from '../types';
import { getEnabledRules, applyRulesToBatch } from '../lib/rule-engine';

const rules = new Hono<{ Bindings: Env }>();

// Get all rules
rules.get('/', async (c) => {
  try {
    const enabledOnly = c.req.query('enabled') === 'true';

    let query = 'SELECT * FROM rules';
    if (enabledOnly) {
      query += ' WHERE enabled = 1';
    }
    query += ' ORDER BY priority ASC, name ASC';

    const result = await c.env.DB.prepare(query).all<Rule>();

    const rulesList = (result.results || []).map(r => ({
      ...r,
      enabled: Boolean(r.enabled),
    }));

    const response: RulesResponse = {
      rules: rulesList,
    };

    return c.json(response);
  } catch (error) {
    console.error('Rules list error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get single rule
rules.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');

    const result = await c.env.DB
      .prepare('SELECT * FROM rules WHERE id = ?')
      .bind(id)
      .first<Rule>();

    if (!result) {
      return c.json({ error: 'Rule not found' }, 404);
    }

    return c.json({
      ...result,
      enabled: Boolean(result.enabled),
    });
  } catch (error) {
    console.error('Rule get error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Create rule
rules.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = createRuleSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.message }, 400);
    }

    const {
      name,
      priority,
      enabled,
      match_field,
      match_type,
      match_value,
      match_value_secondary,
      action_type,
      action_value,
    } = parsed.data;

    // Validate action_value references exist
    if (action_type === 'set_category') {
      const exists = await c.env.DB
        .prepare('SELECT 1 FROM categories WHERE id = ?')
        .bind(action_value)
        .first();
      if (!exists) {
        return c.json({ error: 'Referenced category does not exist' }, 400);
      }
    } else if (action_type === 'add_tag') {
      const exists = await c.env.DB
        .prepare('SELECT 1 FROM tags WHERE id = ?')
        .bind(action_value)
        .first();
      if (!exists) {
        return c.json({ error: 'Referenced tag does not exist' }, 400);
      }
    } else if (action_type === 'set_merchant') {
      const exists = await c.env.DB
        .prepare('SELECT 1 FROM merchants WHERE id = ?')
        .bind(action_value)
        .first();
      if (!exists) {
        return c.json({ error: 'Referenced merchant does not exist' }, 400);
      }
    }

    const id = generateId();
    const now = new Date().toISOString();

    await c.env.DB
      .prepare(`
        INSERT INTO rules (id, name, priority, enabled, match_field, match_type, match_value, match_value_secondary, action_type, action_value, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        name,
        priority,
        enabled ? 1 : 0,
        match_field,
        match_type,
        match_value,
        match_value_secondary || null,
        action_type,
        action_value,
        now,
        now
      )
      .run();

    const created = await c.env.DB
      .prepare('SELECT * FROM rules WHERE id = ?')
      .bind(id)
      .first<Rule>();

    return c.json({
      ...created,
      enabled: Boolean(created!.enabled),
    }, 201);
  } catch (error) {
    console.error('Rule create error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Update rule
rules.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = updateRuleSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.message }, 400);
    }

    const existing = await c.env.DB
      .prepare('SELECT * FROM rules WHERE id = ?')
      .bind(id)
      .first<Rule>();

    if (!existing) {
      return c.json({ error: 'Rule not found' }, 404);
    }

    const {
      name,
      priority,
      enabled,
      match_field,
      match_type,
      match_value,
      match_value_secondary,
      action_type,
      action_value,
    } = parsed.data;

    // Validate action_value if being updated
    if (action_type && action_value) {
      if (action_type === 'set_category') {
        const exists = await c.env.DB
          .prepare('SELECT 1 FROM categories WHERE id = ?')
          .bind(action_value)
          .first();
        if (!exists) {
          return c.json({ error: 'Referenced category does not exist' }, 400);
        }
      } else if (action_type === 'add_tag') {
        const exists = await c.env.DB
          .prepare('SELECT 1 FROM tags WHERE id = ?')
          .bind(action_value)
          .first();
        if (!exists) {
          return c.json({ error: 'Referenced tag does not exist' }, 400);
        }
      } else if (action_type === 'set_merchant') {
        const exists = await c.env.DB
          .prepare('SELECT 1 FROM merchants WHERE id = ?')
          .bind(action_value)
          .first();
        if (!exists) {
          return c.json({ error: 'Referenced merchant does not exist' }, 400);
        }
      }
    }

    const updates: string[] = ['updated_at = ?'];
    const params: (string | number | null)[] = [new Date().toISOString()];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    if (priority !== undefined) {
      updates.push('priority = ?');
      params.push(priority);
    }
    if (enabled !== undefined) {
      updates.push('enabled = ?');
      params.push(enabled ? 1 : 0);
    }
    if (match_field !== undefined) {
      updates.push('match_field = ?');
      params.push(match_field);
    }
    if (match_type !== undefined) {
      updates.push('match_type = ?');
      params.push(match_type);
    }
    if (match_value !== undefined) {
      updates.push('match_value = ?');
      params.push(match_value);
    }
    if (match_value_secondary !== undefined) {
      updates.push('match_value_secondary = ?');
      params.push(match_value_secondary);
    }
    if (action_type !== undefined) {
      updates.push('action_type = ?');
      params.push(action_type);
    }
    if (action_value !== undefined) {
      updates.push('action_value = ?');
      params.push(action_value);
    }

    params.push(id);
    await c.env.DB
      .prepare(`UPDATE rules SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...params)
      .run();

    const updated = await c.env.DB
      .prepare('SELECT * FROM rules WHERE id = ?')
      .bind(id)
      .first<Rule>();

    return c.json({
      ...updated,
      enabled: Boolean(updated!.enabled),
    });
  } catch (error) {
    console.error('Rule update error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Delete rule
rules.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');

    const result = await c.env.DB
      .prepare('DELETE FROM rules WHERE id = ?')
      .bind(id)
      .run();

    if (result.meta.changes === 0) {
      return c.json({ error: 'Rule not found' }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Rule delete error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Test rule against sample transactions
rules.post('/:id/test', async (c) => {
  try {
    const id = c.req.param('id');
    const limit = Math.min(parseInt(c.req.query('limit') || '10'), 100);

    const rule = await c.env.DB
      .prepare('SELECT * FROM rules WHERE id = ?')
      .bind(id)
      .first<Rule>();

    if (!rule) {
      return c.json({ error: 'Rule not found' }, 404);
    }

    // Get sample transactions
    const transactions = await c.env.DB
      .prepare('SELECT * FROM transactions ORDER BY tx_date DESC LIMIT ?')
      .bind(limit)
      .all<Transaction>();

    // Import and use getMatchingRules
    const { getMatchingRules } = await import('../lib/rule-engine');

    const matches = [];
    for (const tx of transactions.results || []) {
      const actions = getMatchingRules(tx, [{ ...rule, enabled: true }]);
      if (actions.length > 0) {
        matches.push({
          transaction_id: tx.id,
          description: tx.description,
          amount: tx.amount,
          date: tx.tx_date,
        });
      }
    }

    return c.json({
      rule_id: id,
      tested: transactions.results?.length || 0,
      matched: matches.length,
      matches,
    });
  } catch (error) {
    console.error('Rule test error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Apply rules to transactions
rules.post('/apply', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = applyRulesSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.message }, 400);
    }

    const { transaction_ids, all, batch_size } = parsed.data;

    // Get enabled rules
    const enabledRules = await getEnabledRules(c.env.DB);

    if (enabledRules.length === 0) {
      return c.json({ processed: 0, updated: 0, errors: 0, message: 'No enabled rules' });
    }

    let totalProcessed = 0;
    let totalUpdated = 0;
    let totalErrors = 0;

    if (transaction_ids && transaction_ids.length > 0) {
      // Apply to specific transactions
      const placeholders = transaction_ids.map(() => '?').join(',');
      const result = await c.env.DB
        .prepare(`SELECT * FROM transactions WHERE id IN (${placeholders})`)
        .bind(...transaction_ids)
        .all<Transaction>();

      const batch = await applyRulesToBatch(c.env.DB, result.results || [], enabledRules);
      totalProcessed = batch.processed;
      totalUpdated = batch.updated;
      totalErrors = batch.errors;
    } else if (all) {
      // Apply to all transactions in batches
      let offset = 0;

      while (true) {
        const result = await c.env.DB
          .prepare('SELECT * FROM transactions ORDER BY tx_date DESC LIMIT ? OFFSET ?')
          .bind(batch_size, offset)
          .all<Transaction>();

        const transactions = result.results || [];
        if (transactions.length === 0) break;

        const batch = await applyRulesToBatch(c.env.DB, transactions, enabledRules);
        totalProcessed += batch.processed;
        totalUpdated += batch.updated;
        totalErrors += batch.errors;

        offset += batch_size;

        // Safety limit
        if (offset > 100000) {
          console.warn('Apply rules hit safety limit');
          break;
        }
      }
    }

    const response: ApplyRulesResponse = {
      processed: totalProcessed,
      updated: totalUpdated,
      errors: totalErrors,
    };

    return c.json(response);
  } catch (error) {
    console.error('Apply rules error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default rules;
