-- Follow-up: classify "Omkostninger utlandsbetaling" rows as bills instead of Other.

INSERT OR IGNORE INTO rules (
  id, name, priority, enabled, match_field, match_type, match_value, match_value_secondary,
  action_type, action_value, created_at, updated_at
) VALUES
  (
    'rule_more_r6_omkostning_utlandsbetaling',
    'Bills: foreign transfer fee (utlandsbetaling)',
    90, 1,
    'description', 'contains', 'UTLANDSBETALING', NULL,
    'set_category', 'cat_bills',
    datetime('now'), datetime('now')
  );

INSERT OR IGNORE INTO transaction_meta (transaction_id, category_id, updated_at)
SELECT t.id, 'cat_bills', datetime('now')
FROM transactions t
LEFT JOIN transaction_meta tm ON tm.transaction_id = t.id
WHERE tm.transaction_id IS NULL
  AND UPPER(COALESCE(t.description, '') || ' ' || COALESCE(t.merchant, '')) LIKE '%OMKOSTNINGER UTLANDSBETALING%';

UPDATE transaction_meta
SET category_id = 'cat_bills',
    updated_at = datetime('now')
WHERE transaction_id IN (
  SELECT t.id
  FROM transactions t
  WHERE UPPER(COALESCE(t.description, '') || ' ' || COALESCE(t.merchant, '')) LIKE '%OMKOSTNINGER UTLANDSBETALING%'
)
AND (category_id IS NULL OR category_id = '' OR category_id = 'cat_other');

