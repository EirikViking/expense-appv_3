-- Felleskonto rows should be treated as real shared expenses (not transfers).

INSERT OR IGNORE INTO categories (
  id, name, parent_id, color, icon, sort_order, is_transfer
) VALUES (
  'cat_bills_housing_shared',
  'Rent / Shared costs',
  'cat_bills',
  '#fbbf24',
  'building',
  4,
  0
);

INSERT OR IGNORE INTO rules (
  id, name, priority, enabled, match_field, match_type, match_value, match_value_secondary,
  action_type, action_value, created_at, updated_at
) VALUES (
  'rule_more_felleskonto_housing',
  'Housing: FELLESKONTO',
  60,
  1,
  'description',
  'contains',
  'FELLESKONTO',
  NULL,
  'set_category',
  'cat_bills_housing_shared',
  datetime('now'),
  datetime('now')
);

-- Backfill existing rows: never transfer, always expense sign for Felleskonto rows.
UPDATE transactions
SET
  flow_type = 'expense',
  amount = -ABS(COALESCE(amount, 0)),
  is_transfer = 0,
  is_excluded = 0
WHERE LOWER(COALESCE(description, '') || ' ' || COALESCE(merchant, '')) LIKE '%felleskonto%';

INSERT OR IGNORE INTO transaction_meta (transaction_id, category_id, updated_at)
SELECT t.id, 'cat_bills_housing_shared', datetime('now')
FROM transactions t
LEFT JOIN transaction_meta tm ON tm.transaction_id = t.id
WHERE tm.transaction_id IS NULL
  AND LOWER(COALESCE(t.description, '') || ' ' || COALESCE(t.merchant, '')) LIKE '%felleskonto%';

UPDATE transaction_meta
SET category_id = 'cat_bills_housing_shared',
    updated_at = datetime('now')
WHERE transaction_id IN (
  SELECT t.id
  FROM transactions t
  WHERE LOWER(COALESCE(t.description, '') || ' ' || COALESCE(t.merchant, '')) LIKE '%felleskonto%'
);
