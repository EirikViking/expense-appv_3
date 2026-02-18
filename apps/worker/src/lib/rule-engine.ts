import type { Rule, Transaction, RuleMatchField, RuleMatchType } from '@expense/shared';
import { generateId } from '@expense/shared';
import { isStraksbetalingDescription } from './transfer-detect';

const STRAKSBETALING_CATEGORY_ID = 'cat_other_p2p';

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
): Promise<{
  matched: boolean;
  updated: boolean;
  category_candidate: boolean;
  category_updated: boolean;
  actions: RuleAction[];
}> {
  if (tx.is_excluded) {
    return {
      matched: false,
      updated: false,
      category_candidate: false,
      category_updated: false,
      actions: [],
    };
  }

  const actions = getMatchingRules(tx, rules);

  if (actions.length === 0) {
    return {
      matched: false,
      updated: false,
      category_candidate: false,
      category_updated: false,
      actions: [],
    };
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
    .prepare('SELECT category_id, merchant_id, notes, is_recurring FROM transaction_meta WHERE transaction_id = ?')
    .bind(tx.id)
    .first<{ category_id: string | null; merchant_id: string | null; notes: string | null; is_recurring: number | null }>();

  const desiredCategoryId = isStraksbetalingDescription(tx.description)
    ? STRAKSBETALING_CATEGORY_ID
    : (categoryAction?.value ?? null);
  const prevCategoryId = existingMeta ? (existingMeta.category_id ?? null) : null;
  const categoryCandidate = Boolean(desiredCategoryId && desiredCategoryId !== prevCategoryId);

  let anyDbChanges = false;
  let categoryUpdated = false;

  if (existingMeta) {
    // Update existing meta - only update fields that actually change (avoid "updated_at only" writes).
    const updates: string[] = [];
    const params: (string | number | null)[] = [];

    if (categoryCandidate) {
      updates.push('category_id = ?');
      params.push(desiredCategoryId);
    }

    if (merchantAction && merchantAction.value !== existingMeta.merchant_id) {
      updates.push('merchant_id = ?');
      params.push(merchantAction.value);
    }

    if (notesAction && notesAction.value !== existingMeta.notes) {
      updates.push('notes = ?');
      params.push(notesAction.value);
    }

    if (recurringAction) {
      const desiredRecurring = recurringAction.value === 'true' ? 1 : 0;
      const prevRecurring = existingMeta.is_recurring ? 1 : 0;
      if (desiredRecurring !== prevRecurring) {
        updates.push('is_recurring = ?');
        params.push(desiredRecurring);
      }
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      params.push(now);
      params.push(tx.id);

      const res = await db
        .prepare(`UPDATE transaction_meta SET ${updates.join(', ')} WHERE transaction_id = ?`)
        .bind(...params)
        .run();

      const changes = Number((res as any)?.meta?.changes || 0);
      if (changes > 0) anyDbChanges = true;
      if (categoryCandidate && changes > 0) categoryUpdated = true;
    }
  } else {
    // Insert new meta only when we have a meta field action (tags don't require meta).
    const shouldInsertMeta = Boolean(desiredCategoryId || merchantAction || notesAction || recurringAction);
    if (shouldInsertMeta) {
      const res = await db
        .prepare(`
          INSERT INTO transaction_meta (transaction_id, category_id, merchant_id, notes, is_recurring, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        .bind(
          tx.id,
          desiredCategoryId,
          merchantAction?.value || null,
          notesAction?.value || null,
          recurringAction?.value === 'true' ? 1 : 0,
          now
        )
        .run();

      const changes = Number((res as any)?.meta?.changes || 0);
      if (changes > 0) anyDbChanges = true;
      if (desiredCategoryId && changes > 0) categoryUpdated = true;
    }
  }

  // Handle tags - add any new tags (don't remove existing ones for idempotency)
  for (const tagAction of tagActions) {
    try {
      const res = await db
        .prepare(`
          INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id, created_at)
          VALUES (?, ?, ?)
        `)
        .bind(tx.id, tagAction.value, now)
        .run();
      const changes = Number((res as any)?.meta?.changes || 0);
      if (changes > 0) anyDbChanges = true;
    } catch {
      // Ignore duplicate tag errors
    }
  }

  return {
    matched: true,
    updated: anyDbChanges,
    category_candidate: categoryCandidate,
    category_updated: categoryUpdated,
    actions,
  };
}

// Apply rules to multiple transactions in batches
export async function applyRulesToBatch(
  db: D1Database,
  transactions: Transaction[],
  rules: Rule[]
): Promise<{ processed: number; matched: number; updated: number; updated_real: number; category_candidates: number; errors: number }> {
  let matched = 0;
  let updated = 0;
  let updatedReal = 0;
  let categoryCandidates = 0;
  let errors = 0;

  for (const tx of transactions) {
    try {
      const result = await applyRulesToTransaction(db, tx, rules);
      if (result.matched) matched++;
      if (result.updated) updated++;
      if (result.category_candidate) categoryCandidates++;
      if (result.category_updated) updatedReal++;
    } catch (err) {
      errors++;
      console.error('Error applying rules to transaction:', tx.id, err);
    }
  }

  return {
    processed: transactions.length,
    matched,
    updated,
    updated_real: updatedReal,
    category_candidates: categoryCandidates,
    errors,
  };
}

// Get all enabled rules from database
export async function getEnabledRules(db: D1Database, userId?: string | null): Promise<Rule[]> {
  const result = userId
    ? await db
        .prepare(`
          SELECT * FROM rules
          WHERE enabled = 1
            AND (user_id IS NULL OR user_id = ?)
          ORDER BY priority ASC
        `)
        .bind(userId)
        .all<Rule>()
    : await db
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
