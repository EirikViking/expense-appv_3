import { describe, it, expect } from 'vitest';
import { applyRulesToBatch } from './rule-engine';
import type { Rule, Transaction } from '@expense/shared';

function makeTx(id: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id,
    tx_hash: 'hash_' + id,
    tx_date: '2026-01-05',
    booked_date: null,
    description: 'KORTKJOP',
    merchant: null,
    amount: -100,
    currency: 'NOK',
    status: 'booked',
    source_type: 'pdf',
    source_file_hash: 'filehash',
    raw_json: '{}',
    created_at: new Date().toISOString(),
    flow_type: 'expense',
    is_excluded: false,
    is_transfer: false,
    ...overrides,
  };
}

function makeRuleContainsRemaSetGroceries(): Rule {
  return {
    id: 'r1',
    name: 'Groceries: REMA',
    priority: 10,
    enabled: true,
    match_field: 'description',
    match_type: 'contains',
    match_value: 'REMA',
    match_value_secondary: null,
    action_type: 'set_category',
    action_value: 'cat_food_groceries',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// Minimal D1 mock: enough for applyRulesToTransaction upsert logic.
function makeMockDb(metaByTxId: Record<string, { category_id: string | null } | null>) {
  const state = {
    metaByTxId: { ...metaByTxId },
  };

  return {
    prepare(sql: string) {
      return {
        bind: (...params: any[]) => {
          const txId = params[0];
          return {
            async first() {
              if (sql.includes('FROM transaction_meta') && sql.includes('WHERE transaction_id')) {
                const row = state.metaByTxId[String(txId)];
                if (!row) return null;
                return { category_id: row.category_id, merchant_id: null, notes: null, is_recurring: 0 };
              }
              return null;
            },
            async run() {
              // Update / insert into transaction_meta changes in-memory state and reports meta.changes.
              if (sql.includes('UPDATE transaction_meta')) {
                const categoryIdx = sql.includes('category_id = ?') ? 0 : -1;
                if (categoryIdx >= 0) {
                  const desiredCat = params[0];
                  const existing = state.metaByTxId[String(txId)] || { category_id: null };
                  const changed = existing.category_id !== desiredCat;
                  state.metaByTxId[String(txId)] = { category_id: desiredCat };
                  return { meta: { changes: changed ? 1 : 0 } };
                }
                return { meta: { changes: 0 } };
              }
              if (sql.includes('INSERT INTO transaction_meta')) {
                const desiredCat = params[1];
                const existed = Boolean(state.metaByTxId[String(txId)]);
                state.metaByTxId[String(txId)] = { category_id: desiredCat ?? null };
                return { meta: { changes: existed ? 0 : 1 } };
              }
              if (sql.includes('INSERT OR IGNORE INTO transaction_tags')) {
                return { meta: { changes: 0 } };
              }
              return { meta: { changes: 0 } };
            },
          };
        },
      };
    },
  } as any;
}

describe('rules/apply counts', () => {
  it('counts updated_real based on actual category writes (meta.changes + old/new category)', async () => {
    const tx1 = makeTx('t1', { merchant: 'REMA 1000 SORENGA', description: 'KORTKJOP' });
    const tx2 = makeTx('t2', { merchant: 'REMA 1000 SORENGA', description: 'KORTKJOP' });

    // tx1: category is null (candidate -> should update)
    // tx2: already has groceries category (not a candidate -> should not count as updated_real)
    const db = makeMockDb({
      t1: { category_id: null },
      t2: { category_id: 'cat_food_groceries' },
    });

    const rules: Rule[] = [makeRuleContainsRemaSetGroceries()];
    const res = await applyRulesToBatch(db, [tx1, tx2], rules);

    expect(res.processed).toBe(2);
    expect(res.matched).toBe(2);
    expect(res.category_candidates).toBe(1);
    expect(res.updated_real).toBe(1);
  });
});

