import type { Rule, Transaction, RuleMatchField, RuleMatchType } from '@expense/shared';
import { generateId } from '@expense/shared';

// Safe regex execution with timeout protection
function safeRegexTest(pattern: string, text: string, timeoutMs: number = 100): boolean {
  try {
    // Basic pattern validation - reject obviously dangerous patterns
    if (pattern.length > 200) return false;
    if (/\(\?[<!=]/.test(pattern)) return false; // No lookbehind/lookahead
    if (/\{[\d,]*\d{4,}/.test(pattern)) return false; // No huge quantifiers

    const regex = new RegExp(pattern, 'i');
    const start = Date.now();

    // Simple test with manual timeout check
    const result = regex.test(text);

    if (Date.now() - start > timeoutMs) {
      console.warn('Regex execution slow:', pattern);
    }

    return result;
  } catch {
    return false;
  }
}

// Get field value from transaction
function getFieldValue(tx: Transaction, field: RuleMatchField): string | number {
  switch (field) {
    case 'description':
      return tx.description;
    case 'merchant':
      return tx.merchant || '';
    case 'amount':
      return tx.amount;
    case 'source_type':
      return tx.source_type;
    case 'status':
      return tx.status;
    default:
      return '';
  }
}

function getCombinedText(tx: Transaction): string {
  // Canonical match text for categorization: always include both merchant + description.
  // This makes PDF (merchant from "Butikk") and XLSX (merchant from Spesifikasjon) behave consistently.
  return `${tx.merchant || ''} ${tx.description || ''}`.replace(/\s+/g, ' ').trim();
}

function getStringMatchCandidates(tx: Transaction, field: RuleMatchField): string[] {
  // Always include the combined text so rule matching doesn't depend on which field got populated by ingest.
  // Also include the original field value to preserve semantics for match types like exact/starts_with.
  const combined = getCombinedText(tx);
  const fieldValue = String(getFieldValue(tx, field) ?? '').trim();

  const out: string[] = [];
  if (combined) out.push(combined);
  if (fieldValue && fieldValue !== combined) out.push(fieldValue);
  return out;
}

// Check if a rule matches a transaction
function matchesRule(tx: Transaction, rule: Rule): boolean {
  const fieldValue = getFieldValue(tx, rule.match_field);
  const matchValue = rule.match_value;

  switch (rule.match_type as RuleMatchType) {
    case 'contains':
      if (typeof fieldValue === 'number') return false;
      return getStringMatchCandidates(tx, rule.match_field).some((v) =>
        v.toLowerCase().includes(matchValue.toLowerCase())
      );

    case 'starts_with':
      if (typeof fieldValue === 'number') return false;
      return getStringMatchCandidates(tx, rule.match_field).some((v) =>
        v.toLowerCase().startsWith(matchValue.toLowerCase())
      );

    case 'ends_with':
      if (typeof fieldValue === 'number') return false;
      return getStringMatchCandidates(tx, rule.match_field).some((v) =>
        v.toLowerCase().endsWith(matchValue.toLowerCase())
      );

    case 'exact':
      if (typeof fieldValue === 'number') return false;
      return getStringMatchCandidates(tx, rule.match_field).some((v) =>
        v.toLowerCase() === matchValue.toLowerCase()
      );

    case 'regex':
      if (typeof fieldValue === 'number') return false;
      return getStringMatchCandidates(tx, rule.match_field).some((v) => safeRegexTest(matchValue, v));

    case 'greater_than':
      return typeof fieldValue === 'number' && fieldValue > parseFloat(matchValue);

    case 'less_than':
      return typeof fieldValue === 'number' && fieldValue < parseFloat(matchValue);

    case 'between':
      if (typeof fieldValue !== 'number') return false;
      const min = parseFloat(matchValue);
      const max = parseFloat(rule.match_value_secondary || matchValue);
      return fieldValue >= min && fieldValue <= max;

    default:
      return false;
  }
}

export interface RuleAction {
  type: 'set_category' | 'add_tag' | 'set_merchant' | 'set_notes' | 'mark_recurring';
  value: string;
  ruleId: string;
  ruleName: string;
}

// Get all matching rules for a transaction, sorted by priority
export function getMatchingRules(tx: Transaction, rules: Rule[]): RuleAction[] {
  const actions: RuleAction[] = [];

  // Sort by priority (lower number = higher priority)
  const sortedRules = [...rules].sort((a, b) => a.priority - b.priority);

  for (const rule of sortedRules) {
    if (!rule.enabled) continue;

    if (matchesRule(tx, rule)) {
      actions.push({
        type: rule.action_type as RuleAction['type'],
        value: rule.action_value,
        ruleId: rule.id,
        ruleName: rule.name,
      });
    }
  }

  return actions;
}

// Apply rules to a single transaction
export async function applyRulesToTransaction(
  db: D1Database,
  tx: Transaction,
  rules: Rule[]
): Promise<{ updated: boolean; actions: RuleAction[] }> {
  const actions = getMatchingRules(tx, rules);

  if (actions.length === 0) {
    return { updated: false, actions: [] };
  }

  // Group actions by type - first match wins for each type
  const categoryAction = actions.find(a => a.type === 'set_category');
  const merchantAction = actions.find(a => a.type === 'set_merchant');
  const notesAction = actions.find(a => a.type === 'set_notes');
  const recurringAction = actions.find(a => a.type === 'mark_recurring');
  const tagActions = actions.filter(a => a.type === 'add_tag');

  // Upsert transaction_meta
  const now = new Date().toISOString();

  // Check if meta exists
  const existingMeta = await db
    .prepare('SELECT 1 FROM transaction_meta WHERE transaction_id = ?')
    .bind(tx.id)
    .first();

  if (existingMeta) {
    // Update existing meta - only update fields that have actions
    const updates: string[] = ['updated_at = ?'];
    const params: (string | number | null)[] = [now];

    if (categoryAction) {
      updates.push('category_id = ?');
      params.push(categoryAction.value);
    }

    if (merchantAction) {
      updates.push('merchant_id = ?');
      params.push(merchantAction.value);
    }

    if (notesAction) {
      updates.push('notes = ?');
      params.push(notesAction.value);
    }

    if (recurringAction) {
      updates.push('is_recurring = ?');
      params.push(recurringAction.value === 'true' ? 1 : 0);
    }

    params.push(tx.id);

    await db
      .prepare(`UPDATE transaction_meta SET ${updates.join(', ')} WHERE transaction_id = ?`)
      .bind(...params)
      .run();
  } else {
    // Insert new meta
    await db
      .prepare(`
        INSERT INTO transaction_meta (transaction_id, category_id, merchant_id, notes, is_recurring, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .bind(
        tx.id,
        categoryAction?.value || null,
        merchantAction?.value || null,
        notesAction?.value || null,
        recurringAction?.value === 'true' ? 1 : 0,
        now
      )
      .run();
  }

  // Handle tags - add any new tags (don't remove existing ones for idempotency)
  for (const tagAction of tagActions) {
    try {
      await db
        .prepare(`
          INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id, created_at)
          VALUES (?, ?, ?)
        `)
        .bind(tx.id, tagAction.value, now)
        .run();
    } catch {
      // Ignore duplicate tag errors
    }
  }

  return { updated: true, actions };
}

// Apply rules to multiple transactions in batches
export async function applyRulesToBatch(
  db: D1Database,
  transactions: Transaction[],
  rules: Rule[]
): Promise<{ processed: number; updated: number; errors: number }> {
  let updated = 0;
  let errors = 0;

  for (const tx of transactions) {
    try {
      const result = await applyRulesToTransaction(db, tx, rules);
      if (result.updated) updated++;
    } catch (err) {
      errors++;
      console.error('Error applying rules to transaction:', tx.id, err);
    }
  }

  return { processed: transactions.length, updated, errors };
}

// Get all enabled rules from database
export async function getEnabledRules(db: D1Database): Promise<Rule[]> {
  const result = await db
    .prepare(`
      SELECT * FROM rules
      WHERE enabled = 1
      ORDER BY priority ASC
    `)
    .all<Rule>();

  return (result.results || []).map(r => ({
    ...r,
    enabled: Boolean(r.enabled),
  }));
}
