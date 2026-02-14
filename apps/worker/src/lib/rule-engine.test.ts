import { describe, it, expect } from 'vitest';
import type { Rule, Transaction } from '@expense/shared';
import { applyRulesToTransaction, getMatchingRules } from './rule-engine';

// Helper to create a test transaction
function createTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    tx_hash: 'hash-1',
    tx_date: '2024-01-15',
    booked_date: '2024-01-15',
    description: 'NETFLIX PAYMENT',
    merchant: 'Netflix',
    amount: -149.00,
    currency: 'NOK',
    status: 'booked',
    source_type: 'xlsx',
    source_file_hash: 'file-hash-1',
    raw_json: '{}',
    created_at: '2024-01-15T12:00:00Z',
    flow_type: 'unknown',
    is_excluded: false,
    is_transfer: false,
    ...overrides,
  };
}

// Helper to create a test rule
function createRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: 'rule-1',
    name: 'Test Rule',
    priority: 100,
    enabled: true,
    match_field: 'description',
    match_type: 'contains',
    match_value: 'NETFLIX',
    match_value_secondary: null,
    action_type: 'set_category',
    action_value: 'cat-entertainment',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

class MockD1 {
  private meta = new Map<
    string,
    { category_id: string | null; merchant_id: string | null; notes: string | null; is_recurring: number }
  >();
  private tags = new Set<string>();

  getMeta(transactionId: string) {
    return this.meta.get(transactionId);
  }

  prepare(sql: string) {
    const normalized = sql.trim().toLowerCase();
    return {
      bind: (...params: unknown[]) => ({
        first: async () => {
          if (normalized.startsWith('select category_id')) {
            const row = this.meta.get(params[0] as string);
            return row ? { ...row } : null;
          }
          return null;
        },
        run: async () => {
          if (normalized.startsWith('insert into transaction_meta')) {
            const [transactionId, categoryId, merchantId, notes, isRecurring] = params;
            this.meta.set(transactionId as string, {
              category_id: (categoryId as string) || null,
              merchant_id: (merchantId as string) || null,
              notes: (notes as string) || null,
              is_recurring: Number(isRecurring),
            });
            return { meta: { changes: 1 } };
          } else if (normalized.startsWith('update transaction_meta')) {
            // Best-effort update for tests. The real implementation uses parameterized SQL.
            const transactionId = params[params.length - 1] as string;
            const existing = this.meta.get(transactionId) || {
              category_id: null,
              merchant_id: null,
              notes: null,
              is_recurring: 0,
            };

            // Only category_id is relevant for these tests.
            if (normalized.includes('category_id = ?')) {
              existing.category_id = (params[0] as string) || null;
            }
            this.meta.set(transactionId, existing);
            return { meta: { changes: 1 } };
          } else if (normalized.startsWith('insert or ignore into transaction_tags')) {
            const [transactionId, tagId] = params;
            const key = `${transactionId as string}:${tagId as string}`;
            const before = this.tags.has(key);
            this.tags.add(key);
            return { meta: { changes: before ? 0 : 1 } };
          }
          return { meta: { changes: 0 } };
        },
        all: async () => ({ results: [] }),
      }),
    };
  }
}

describe('Rule Engine', () => {
  describe('getMatchingRules', () => {
    it('should match rules with contains pattern', () => {
      const tx = createTransaction({ description: 'NETFLIX SUBSCRIPTION PAYMENT' });
      const rules = [createRule({ match_type: 'contains', match_value: 'NETFLIX' })];

      const actions = getMatchingRules(tx, rules);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('set_category');
      expect(actions[0].value).toBe('cat-entertainment');
    });

    it('should match rules case-insensitively', () => {
      const tx = createTransaction({ description: 'netflix subscription payment' });
      const rules = [createRule({ match_type: 'contains', match_value: 'NETFLIX' })];

      const actions = getMatchingRules(tx, rules);

      expect(actions).toHaveLength(1);
    });

    it('should match rules with starts_with pattern', () => {
      const tx = createTransaction({ description: 'SPOTIFY PREMIUM' });
      const rules = [createRule({ match_type: 'starts_with', match_value: 'SPOTIFY' })];

      const actions = getMatchingRules(tx, rules);

      expect(actions).toHaveLength(1);
    });

    it('should NOT match starts_with when pattern is in middle', () => {
      const tx = createTransaction({ description: 'PAY SPOTIFY PREMIUM' });
      const rules = [createRule({ match_type: 'starts_with', match_value: 'SPOTIFY' })];

      const actions = getMatchingRules(tx, rules);

      expect(actions).toHaveLength(0);
    });

    it('should match rules with ends_with pattern', () => {
      const tx = createTransaction({ description: 'PAYMENT TO GROCERIES' });
      const rules = [createRule({ match_type: 'ends_with', match_value: 'GROCERIES' })];

      const actions = getMatchingRules(tx, rules);

      expect(actions).toHaveLength(1);
    });

    it('should match rules with exact pattern', () => {
      const tx = createTransaction({ description: 'REMA 1000' });
      const rules = [createRule({ match_type: 'exact', match_value: 'REMA 1000' })];

      const actions = getMatchingRules(tx, rules);

      expect(actions).toHaveLength(1);
    });

    it('should NOT match exact when not identical', () => {
      const tx = createTransaction({ description: 'REMA 1000 OSLO' });
      const rules = [createRule({ match_type: 'exact', match_value: 'REMA 1000' })];

      const actions = getMatchingRules(tx, rules);

      expect(actions).toHaveLength(0);
    });

    it('should match rules with regex pattern', () => {
      const tx = createTransaction({ description: 'REMA 1000 STORE #12345' });
      const rules = [createRule({ match_type: 'regex', match_value: 'REMA \\d+ STORE' })];

      const actions = getMatchingRules(tx, rules);

      expect(actions).toHaveLength(1);
    });

    it('should match amount greater_than rule', () => {
      const tx = createTransaction({ amount: -500 });
      const rules = [createRule({
        match_field: 'amount',
        match_type: 'greater_than',
        match_value: '-600',
      })];

      const actions = getMatchingRules(tx, rules);

      expect(actions).toHaveLength(1);
    });

    it('should match amount less_than rule', () => {
      const tx = createTransaction({ amount: -500 });
      const rules = [createRule({
        match_field: 'amount',
        match_type: 'less_than',
        match_value: '-400',
      })];

      const actions = getMatchingRules(tx, rules);

      expect(actions).toHaveLength(1);
    });

    it('should match amount between rule', () => {
      const tx = createTransaction({ amount: -500 });
      const rules = [createRule({
        match_field: 'amount',
        match_type: 'between',
        match_value: '-600',
        match_value_secondary: '-400',
      })];

      const actions = getMatchingRules(tx, rules);

      expect(actions).toHaveLength(1);
    });

    it('should match on merchant field', () => {
      const tx = createTransaction({ merchant: 'Netflix Inc' });
      const rules = [createRule({
        match_field: 'merchant',
        match_type: 'contains',
        match_value: 'Netflix',
      })];

      const actions = getMatchingRules(tx, rules);

      expect(actions).toHaveLength(1);
    });

    it('should skip disabled rules', () => {
      const tx = createTransaction({ description: 'NETFLIX PAYMENT' });
      const rules = [createRule({ enabled: false })];

      const actions = getMatchingRules(tx, rules);

      expect(actions).toHaveLength(0);
    });

    it('should return rules sorted by priority', () => {
      const tx = createTransaction({ description: 'NETFLIX PREMIUM SUBSCRIPTION' });
      const rules = [
        createRule({ id: 'rule-low', name: 'Low Priority', priority: 200, action_value: 'cat-low' }),
        createRule({ id: 'rule-high', name: 'High Priority', priority: 50, action_value: 'cat-high' }),
        createRule({ id: 'rule-mid', name: 'Mid Priority', priority: 100, action_value: 'cat-mid' }),
      ];

      const actions = getMatchingRules(tx, rules);

      expect(actions).toHaveLength(3);
      expect(actions[0].value).toBe('cat-high');
      expect(actions[1].value).toBe('cat-mid');
      expect(actions[2].value).toBe('cat-low');
    });

    it('should return multiple matching rules', () => {
      const tx = createTransaction({ description: 'NETFLIX SUBSCRIPTION', merchant: 'Netflix' });
      const rules = [
        createRule({ id: 'rule-1', match_type: 'contains', match_value: 'NETFLIX', action_type: 'set_category' }),
        createRule({ id: 'rule-2', match_field: 'merchant', match_type: 'contains', match_value: 'Netflix', action_type: 'add_tag', action_value: 'tag-subscription' }),
      ];

      const actions = getMatchingRules(tx, rules);

      expect(actions).toHaveLength(2);
      expect(actions.some(a => a.type === 'set_category')).toBe(true);
      expect(actions.some(a => a.type === 'add_tag')).toBe(true);
    });

    it('should not match non-matching rules', () => {
      const tx = createTransaction({ description: 'GROCERY STORE', merchant: 'Grocery Store' });
      const rules = [createRule({ match_type: 'contains', match_value: 'NETFLIX' })];

      const actions = getMatchingRules(tx, rules);

      expect(actions).toHaveLength(0);
    });

    it('matches on combined merchant+description even when the rule targets description', () => {
      // Simulates Storebrand PDF ingest where merchant gets populated from "Butikk",
      // while description might be generic.
      const tx = createTransaction({
        description: 'KORTKJØP',
        merchant: 'REMA 1000 SORENGA',
      });

      const rules = [
        createRule({
          id: 'rule-groceries',
          name: 'Groceries',
          match_field: 'description',
          match_type: 'contains',
          match_value: 'REMA',
          action_type: 'set_category',
          action_value: 'cat_food_groceries',
        }),
      ];

      const actions = getMatchingRules(tx, rules);
      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('set_category');
      expect(actions[0].value).toBe('cat_food_groceries');
    });

    it('still matches non-grocery rules via merchant text', () => {
      const tx = createTransaction({
        description: 'KORTKJØP',
        merchant: 'FLYTOGET AS',
      });

      const rules = [
        createRule({
          id: 'rule-flytoget',
          name: 'Flytoget',
          match_field: 'description',
          match_type: 'contains',
          match_value: 'FLYTOGET',
          action_type: 'set_category',
          action_value: 'cat_transport_public',
        }),
      ];

      const actions = getMatchingRules(tx, rules);
      expect(actions).toHaveLength(1);
      expect(actions[0].value).toBe('cat_transport_public');
    });
  });

  describe('Safe Regex', () => {
    it('should reject overly long patterns', () => {
      const tx = createTransaction({ description: 'TEST' });
      const longPattern = 'a'.repeat(250);
      const rules = [createRule({ match_type: 'regex', match_value: longPattern })];

      const actions = getMatchingRules(tx, rules);

      expect(actions).toHaveLength(0);
    });

    it('should reject lookbehind patterns', () => {
      const tx = createTransaction({ description: 'TEST CONTENT' });
      const rules = [createRule({ match_type: 'regex', match_value: '(?<=TEST).*' })];

      const actions = getMatchingRules(tx, rules);

      expect(actions).toHaveLength(0);
    });

    it('should reject lookahead patterns', () => {
      const tx = createTransaction({ description: 'TEST CONTENT' });
      const rules = [createRule({ match_type: 'regex', match_value: 'TEST(?=.*)' })];

      const actions = getMatchingRules(tx, rules);

      expect(actions).toHaveLength(0);
    });

    it('should reject patterns with huge quantifiers', () => {
      const tx = createTransaction({ description: 'TEST' });
      const rules = [createRule({ match_type: 'regex', match_value: 'a{10000}' })];

      const actions = getMatchingRules(tx, rules);

      expect(actions).toHaveLength(0);
    });

    it('should handle invalid regex gracefully', () => {
      const tx = createTransaction({ description: 'TEST' });
      const rules = [createRule({ match_type: 'regex', match_value: '[invalid(' })];

      const actions = getMatchingRules(tx, rules);

      expect(actions).toHaveLength(0);
    });

    it('should match valid regex patterns', () => {
      const tx = createTransaction({ description: 'INVOICE-12345-PAID' });
      const rules = [createRule({ match_type: 'regex', match_value: 'INVOICE-\\d+-PAID' })];

      const actions = getMatchingRules(tx, rules);

      expect(actions).toHaveLength(1);
    });
  });

  describe('applyRulesToTransaction', () => {
    it('stores category metadata when rule matches', async () => {
      const db = new MockD1();
      const tx = createTransaction({ description: 'KIWI 505 BARCODE/OSLO/NO' });
      const rules = [
        createRule({
          match_value: 'KIWI',
          action_value: 'cat_food_groceries',
        }),
      ];

      const result = await applyRulesToTransaction(db as unknown as D1Database, tx, rules);

      expect(result.updated).toBe(true);
      const meta = db.getMeta(tx.id);
      expect(meta?.category_id).toBe('cat_food_groceries');
    });

    it('categorizes based on description text even when merchant is empty (Storebrand style)', async () => {
      const db = new MockD1();
      const tx = createTransaction({ merchant: null, description: 'VISA VARE REMA 1000 SORENGA OSLO' });
      const rules = [
        createRule({
          match_value: 'REMA',
          action_value: 'cat_food_groceries',
        }),
      ];

      const result = await applyRulesToTransaction(db as unknown as D1Database, tx, rules);

      expect(result.updated).toBe(true);
      const meta = db.getMeta(tx.id);
      expect(meta?.category_id).toBe('cat_food_groceries');
    });

    it('always categorizes Straksbetaling as P2P/Vipps', async () => {
      const db = new MockD1();
      const tx = createTransaction({
        description: 'Straksbetaling',
        amount: -640,
        flow_type: 'expense',
      });
      const rules = [
        createRule({
          match_value: 'STRAKSBETALING',
          action_value: 'cat_other',
        }),
      ];

      const result = await applyRulesToTransaction(db as unknown as D1Database, tx, rules);

      expect(result.updated).toBe(true);
      const meta = db.getMeta(tx.id);
      expect(meta?.category_id).toBe('cat_other_p2p');
    });
  });
});
