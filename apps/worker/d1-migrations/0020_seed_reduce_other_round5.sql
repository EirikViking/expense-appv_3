-- Round 5: reduce "Other" for common Norwegian export merchants seen in production.
-- Safe to run multiple times (INSERT OR IGNORE + guarded UPDATE).

INSERT OR IGNORE INTO rules (
  id, name, priority, enabled, match_field, match_type, match_value, match_value_secondary,
  action_type, action_value, created_at, updated_at
) VALUES
  ('rule_more_r5_klarna', 'Shopping: KLARNA', 75, 1, 'description', 'contains', 'KLARNA', NULL, 'set_category', 'cat_shopping', datetime('now'), datetime('now')),
  ('rule_more_r5_talkmore', 'Bills: TALKMORE', 75, 1, 'description', 'contains', 'TALKMORE', NULL, 'set_category', 'cat_bills_internet', datetime('now'), datetime('now')),
  ('rule_more_r5_trumf', 'Groceries: TRUMF', 105, 1, 'description', 'contains', 'TRUMF', NULL, 'set_category', 'cat_food_groceries', datetime('now'), datetime('now')),
  ('rule_more_r5_clasohlson', 'Home: CLAS OHLSON', 80, 1, 'description', 'contains', 'CLASOHLSON', NULL, 'set_category', 'cat_shopping_home', datetime('now'), datetime('now')),
  ('rule_more_r5_clas_ohl', 'Home: CLAS OHL', 85, 1, 'description', 'contains', 'CLAS OHL', NULL, 'set_category', 'cat_shopping_home', datetime('now'), datetime('now')),
  ('rule_more_r5_eivind_heggedal', 'P2P: EIVIND HEGGEDAL', 70, 1, 'description', 'contains', 'EIVIND HEGGEDAL', NULL, 'set_category', 'cat_other_p2p', datetime('now'), datetime('now')),
  ('rule_more_r5_vita', 'Personal care: VITA', 95, 1, 'description', 'contains', 'VITA', NULL, 'set_category', 'cat_health_personal_care', datetime('now'), datetime('now')),
  ('rule_more_r5_arnika', 'Personal care: ARNIKA', 95, 1, 'description', 'contains', 'ARNIKA', NULL, 'set_category', 'cat_health_personal_care', datetime('now'), datetime('now')),
  ('rule_more_r5_nav_pensjon', 'Income: NAV pensjon', 70, 1, 'description', 'contains', 'PENSJON ELLER TRYGD', NULL, 'set_category', 'cat_income_salary', datetime('now'), datetime('now')),
  ('rule_more_r5_paypal_tidal', 'Streaming: PAYPAL TIDAL', 70, 1, 'description', 'contains', 'PAYPAL :TIDAL', NULL, 'set_category', 'cat_entertainment_streaming', datetime('now'), datetime('now')),
  ('rule_more_r5_visa_fee', 'Bills: VISA annual fee', 85, 1, 'description', 'contains', 'VISA-KOSTNAD', NULL, 'set_category', 'cat_bills', datetime('now'), datetime('now')),
  ('rule_more_r5_flamingotours', 'Travel: FLAMINGOTOURS', 85, 1, 'description', 'contains', 'FLAMINGOTOURS', NULL, 'set_category', 'cat_travel', datetime('now'), datetime('now')),
  ('rule_more_r5_flamingo_tours', 'Travel: FLAMINGO TOURS', 85, 1, 'description', 'contains', 'FLAMINGO TOURS', NULL, 'set_category', 'cat_travel', datetime('now'), datetime('now')),
  ('rule_more_r5_omkostninger_utland', 'Bills: foreign payment fee', 95, 1, 'description', 'contains', 'OMKOSTNINGER', NULL, 'set_category', 'cat_bills', datetime('now'), datetime('now')),
  ('rule_more_r5_paypal_generic', 'Shopping: PAYPAL generic', 200, 1, 'description', 'contains', 'PAYPAL :', NULL, 'set_category', 'cat_shopping', datetime('now'), datetime('now'));

-- Backfill existing uncategorized/Other rows using deterministic text mapping.
WITH candidates AS (
  SELECT
    t.id AS transaction_id,
    UPPER(COALESCE(t.description, '') || ' ' || COALESCE(t.merchant, '')) AS txt,
    COALESCE(t.amount, 0) AS amount,
    COALESCE(t.flow_type, 'unknown') AS flow_type
  FROM transactions t
  LEFT JOIN transaction_meta tm ON tm.transaction_id = t.id
  WHERE COALESCE(t.is_excluded, 0) = 0
    AND COALESCE(t.is_transfer, 0) = 0
    AND COALESCE(t.flow_type, 'unknown') != 'transfer'
    AND (tm.transaction_id IS NULL OR tm.category_id IS NULL OR tm.category_id = '' OR tm.category_id = 'cat_other')
),
mapped AS (
  SELECT
    transaction_id,
    CASE
      WHEN txt LIKE '%PAYPAL :TIDAL%' OR txt LIKE '%TIDALMUSICA%' OR txt LIKE '% TIDAL%' THEN 'cat_entertainment_streaming'
      WHEN txt LIKE '%TALKMORE%' THEN 'cat_bills_internet'
      WHEN txt LIKE '%CLASOHLSON%' OR txt LIKE '%CLAS OHLSON%' OR txt LIKE '%CLAS OHL%' THEN 'cat_shopping_home'
      WHEN txt LIKE '%EIVIND HEGGEDAL%' THEN 'cat_other_p2p'
      WHEN txt LIKE '%FLAMINGOTOURS%' OR txt LIKE '%FLAMINGO TOURS%' THEN 'cat_travel'
      WHEN txt LIKE '%OMKOSTNINGER%' AND txt LIKE '%INNBET UTLAND%' THEN 'cat_bills'
      WHEN txt LIKE '%VISA-KOSTNAD%' OR txt LIKE '%ARSPRIS KORT MED VISA%' THEN 'cat_bills'
      WHEN txt LIKE '%VITA%' OR txt LIKE '%ARNIKA%' THEN 'cat_health_personal_care'
      WHEN txt LIKE '%PENSJON ELLER TRYGD%' AND amount > 0 THEN 'cat_income_salary'
      WHEN txt LIKE '%TRUMF%' AND amount > 0 THEN 'cat_income_refund'
      WHEN txt LIKE '%TRUMF%' THEN 'cat_food_groceries'
      WHEN txt LIKE '%KLARNA%' THEN 'cat_shopping'
      WHEN txt LIKE '%PAYPAL :%' THEN 'cat_shopping'
      ELSE NULL
    END AS category_id
  FROM candidates
)
INSERT OR IGNORE INTO transaction_meta (transaction_id, category_id, updated_at)
SELECT transaction_id, category_id, datetime('now')
FROM mapped
WHERE category_id IS NOT NULL;

WITH candidates AS (
  SELECT
    t.id AS transaction_id,
    UPPER(COALESCE(t.description, '') || ' ' || COALESCE(t.merchant, '')) AS txt,
    COALESCE(t.amount, 0) AS amount,
    COALESCE(t.flow_type, 'unknown') AS flow_type
  FROM transactions t
  LEFT JOIN transaction_meta tm ON tm.transaction_id = t.id
  WHERE COALESCE(t.is_excluded, 0) = 0
    AND COALESCE(t.is_transfer, 0) = 0
    AND COALESCE(t.flow_type, 'unknown') != 'transfer'
    AND (tm.transaction_id IS NULL OR tm.category_id IS NULL OR tm.category_id = '' OR tm.category_id = 'cat_other')
),
mapped AS (
  SELECT
    transaction_id,
    CASE
      WHEN txt LIKE '%PAYPAL :TIDAL%' OR txt LIKE '%TIDALMUSICA%' OR txt LIKE '% TIDAL%' THEN 'cat_entertainment_streaming'
      WHEN txt LIKE '%TALKMORE%' THEN 'cat_bills_internet'
      WHEN txt LIKE '%CLASOHLSON%' OR txt LIKE '%CLAS OHLSON%' OR txt LIKE '%CLAS OHL%' THEN 'cat_shopping_home'
      WHEN txt LIKE '%EIVIND HEGGEDAL%' THEN 'cat_other_p2p'
      WHEN txt LIKE '%FLAMINGOTOURS%' OR txt LIKE '%FLAMINGO TOURS%' THEN 'cat_travel'
      WHEN txt LIKE '%OMKOSTNINGER%' AND txt LIKE '%INNBET UTLAND%' THEN 'cat_bills'
      WHEN txt LIKE '%VISA-KOSTNAD%' OR txt LIKE '%ARSPRIS KORT MED VISA%' THEN 'cat_bills'
      WHEN txt LIKE '%VITA%' OR txt LIKE '%ARNIKA%' THEN 'cat_health_personal_care'
      WHEN txt LIKE '%PENSJON ELLER TRYGD%' AND amount > 0 THEN 'cat_income_salary'
      WHEN txt LIKE '%TRUMF%' AND amount > 0 THEN 'cat_income_refund'
      WHEN txt LIKE '%TRUMF%' THEN 'cat_food_groceries'
      WHEN txt LIKE '%KLARNA%' THEN 'cat_shopping'
      WHEN txt LIKE '%PAYPAL :%' THEN 'cat_shopping'
      ELSE NULL
    END AS category_id
  FROM candidates
)
UPDATE transaction_meta
SET
  category_id = (
    SELECT m.category_id
    FROM mapped m
    WHERE m.transaction_id = transaction_meta.transaction_id
  ),
  updated_at = datetime('now')
WHERE transaction_id IN (
    SELECT transaction_id
    FROM mapped
    WHERE category_id IS NOT NULL
  )
  AND (category_id IS NULL OR category_id = '' OR category_id = 'cat_other');

