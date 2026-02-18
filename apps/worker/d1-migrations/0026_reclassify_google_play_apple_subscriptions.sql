-- Google Play/Apple app-store charges should be treated as subscriptions, not games.

UPDATE rules
SET
  name = 'Subscriptions: GOOGLE PLAY',
  priority = 45,
  enabled = 1,
  action_value = 'cat_bills_memberships',
  updated_at = datetime('now')
WHERE id = 'rule_google_play'
  AND action_type = 'set_category';

UPDATE rules
SET
  name = 'Subscriptions: APPLE BILL',
  priority = 45,
  enabled = 1,
  action_value = 'cat_bills_memberships',
  updated_at = datetime('now')
WHERE id = 'rule_apple'
  AND action_type = 'set_category';

INSERT OR IGNORE INTO rules (
  id, name, priority, enabled, match_field, match_type, match_value, match_value_secondary,
  action_type, action_value, created_at, updated_at
) VALUES
  (
    'rule_google_play_apps_memberships',
    'Subscriptions: GOOGLE PLAY APPS',
    40,
    1,
    'description',
    'contains',
    'GOOGLE PLAY APPS',
    NULL,
    'set_category',
    'cat_bills_memberships',
    datetime('now'),
    datetime('now')
  ),
  (
    'rule_apple_com_bill_memberships',
    'Subscriptions: APPLE.COM/BILL',
    40,
    1,
    'description',
    'contains',
    'APPLE.COM/BILL',
    NULL,
    'set_category',
    'cat_bills_memberships',
    datetime('now'),
    datetime('now')
  );

WITH matched AS (
  SELECT t.id
  FROM transactions t
  WHERE COALESCE(t.amount, 0) < 0
    AND (
      LOWER(COALESCE(t.description, '') || ' ' || COALESCE(t.merchant, '')) LIKE '%google play%'
      OR LOWER(COALESCE(t.description, '') || ' ' || COALESCE(t.merchant, '')) LIKE '%apple.com/bill%'
    )
)
INSERT OR IGNORE INTO transaction_meta (transaction_id, category_id, updated_at)
SELECT id, 'cat_bills_memberships', datetime('now')
FROM matched;

WITH matched AS (
  SELECT t.id
  FROM transactions t
  WHERE COALESCE(t.amount, 0) < 0
    AND (
      LOWER(COALESCE(t.description, '') || ' ' || COALESCE(t.merchant, '')) LIKE '%google play%'
      OR LOWER(COALESCE(t.description, '') || ' ' || COALESCE(t.merchant, '')) LIKE '%apple.com/bill%'
    )
)
UPDATE transaction_meta
SET
  category_id = 'cat_bills_memberships',
  updated_at = datetime('now')
WHERE transaction_id IN (SELECT id FROM matched);
