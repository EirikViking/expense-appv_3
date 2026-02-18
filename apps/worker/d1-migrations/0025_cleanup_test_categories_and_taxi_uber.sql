-- Clean up test categories, add Taxi/Bolt/Uber category, and backfill matching transactions.

-- 1) Ensure transport root does not contain test text in name.
UPDATE categories
SET name = 'Transportation'
WHERE id = 'cat_transport'
  AND LOWER(COALESCE(name, '')) LIKE '%test%';

-- 2) Add dedicated category for taxi-like rides.
INSERT OR IGNORE INTO categories (
  id, name, parent_id, color, icon, sort_order, is_transfer
) VALUES (
  'cat_transport_taxi_uber',
  'Taxi/Bolt/Uber',
  'cat_transport',
  '#7dd3fc',
  'car',
  4,
  0
);

-- 3) Remove test category trees (except transport root above, which is renamed).
WITH RECURSIVE test_roots(id) AS (
  SELECT id
  FROM categories
  WHERE LOWER(COALESCE(name, '')) LIKE '%test%'
    AND id <> 'cat_transport'
),
test_tree(id) AS (
  SELECT id FROM test_roots
  UNION ALL
  SELECT c.id
  FROM categories c
  INNER JOIN test_tree t ON c.parent_id = t.id
)
DELETE FROM rules
WHERE action_type = 'set_category'
  AND action_value IN (SELECT id FROM test_tree);

WITH RECURSIVE test_roots(id) AS (
  SELECT id
  FROM categories
  WHERE LOWER(COALESCE(name, '')) LIKE '%test%'
    AND id <> 'cat_transport'
),
test_tree(id) AS (
  SELECT id FROM test_roots
  UNION ALL
  SELECT c.id
  FROM categories c
  INNER JOIN test_tree t ON c.parent_id = t.id
)
DELETE FROM categories
WHERE id IN (SELECT id FROM test_tree);

-- 4) Ensure rules for Taxi/Uber/Bolt point to the dedicated category.
INSERT OR IGNORE INTO rules (
  id, name, priority, enabled, match_field, match_type, match_value, match_value_secondary,
  action_type, action_value, created_at, updated_at
) VALUES
  ('rule_taxi', 'Transport: TAXI', 50, 1, 'description', 'contains', 'TAXI', NULL, 'set_category', 'cat_transport_taxi_uber', datetime('now'), datetime('now')),
  ('rule_uber', 'Transport: UBER', 50, 1, 'description', 'contains', 'UBER', NULL, 'set_category', 'cat_transport_taxi_uber', datetime('now'), datetime('now')),
  ('rule_bolt', 'Transport: BOLT', 50, 1, 'description', 'contains', 'BOLT', NULL, 'set_category', 'cat_transport_taxi_uber', datetime('now'), datetime('now'));

UPDATE rules
SET action_value = 'cat_transport_taxi_uber',
    enabled = 1,
    updated_at = datetime('now')
WHERE id IN ('rule_taxi', 'rule_uber', 'rule_bolt')
  AND action_type = 'set_category';

-- 5) Backfill existing rideshare/taxi transactions into Taxi/Bolt/Uber category.
WITH matched AS (
  SELECT t.id
  FROM transactions t
  WHERE COALESCE(t.amount, 0) < 0
    AND (
      LOWER(COALESCE(t.description, '') || ' ' || COALESCE(t.merchant, '')) LIKE '%bolt%'
      OR LOWER(COALESCE(t.description, '') || ' ' || COALESCE(t.merchant, '')) LIKE '%uber%'
      OR LOWER(COALESCE(t.description, '') || ' ' || COALESCE(t.merchant, '')) LIKE '%taxi%'
    )
)
INSERT OR IGNORE INTO transaction_meta (transaction_id, category_id, updated_at)
SELECT id, 'cat_transport_taxi_uber', datetime('now')
FROM matched;

WITH matched AS (
  SELECT t.id
  FROM transactions t
  WHERE COALESCE(t.amount, 0) < 0
    AND (
      LOWER(COALESCE(t.description, '') || ' ' || COALESCE(t.merchant, '')) LIKE '%bolt%'
      OR LOWER(COALESCE(t.description, '') || ' ' || COALESCE(t.merchant, '')) LIKE '%uber%'
      OR LOWER(COALESCE(t.description, '') || ' ' || COALESCE(t.merchant, '')) LIKE '%taxi%'
    )
)
UPDATE transaction_meta
SET category_id = 'cat_transport_taxi_uber',
    updated_at = datetime('now')
WHERE transaction_id IN (SELECT id FROM matched);

-- 6) Trim category list by removing leaf categories with zero transactions and no rule/budget usage.
DELETE FROM categories
WHERE id IN (
  WITH tx_usage AS (
    SELECT category_id, COUNT(*) AS cnt
    FROM (
      SELECT tm.category_id AS category_id
      FROM transaction_meta tm
      WHERE tm.category_id IS NOT NULL
      UNION ALL
      SELECT ts.category_id AS category_id
      FROM transaction_splits ts
      WHERE ts.category_id IS NOT NULL
    ) u
    GROUP BY category_id
  ),
  child_counts AS (
    SELECT parent_id AS category_id, COUNT(*) AS cnt
    FROM categories
    WHERE parent_id IS NOT NULL
    GROUP BY parent_id
  ),
  rule_refs AS (
    SELECT action_value AS category_id, COUNT(*) AS cnt
    FROM rules
    WHERE action_type = 'set_category'
    GROUP BY action_value
  ),
  budget_refs AS (
    SELECT category_id, COUNT(*) AS cnt
    FROM budget_items
    GROUP BY category_id
  )
  SELECT c.id
  FROM categories c
  LEFT JOIN tx_usage tu ON tu.category_id = c.id
  LEFT JOIN child_counts ch ON ch.category_id = c.id
  LEFT JOIN rule_refs rr ON rr.category_id = c.id
  LEFT JOIN budget_refs br ON br.category_id = c.id
  WHERE COALESCE(tu.cnt, 0) = 0
    AND COALESCE(ch.cnt, 0) = 0
    AND COALESCE(rr.cnt, 0) = 0
    AND COALESCE(br.cnt, 0) = 0
    AND c.id NOT IN ('cat_other', 'cat_transfer', 'cat_transport_taxi_uber')
);
