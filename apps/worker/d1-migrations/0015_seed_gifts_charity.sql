-- Add dedicated category for gifts/charity and move matching transactions from Other.

INSERT OR IGNORE INTO categories (
  id, name, parent_id, color, icon, sort_order, is_transfer
) VALUES (
  'cat_gifts_charity',
  'Gaver og veldedighet',
  NULL,
  '#ec4899',
  'gift',
  12,
  0
);

-- Keep existing seeded Rode Kors rule, but redirect it to the new category.
UPDATE rules
SET action_value = 'cat_gifts_charity', updated_at = datetime('now')
WHERE id = 'rule_rode_kors';

INSERT OR IGNORE INTO rules (
  id, name, priority, enabled, match_field, match_type, match_value, match_value_secondary, action_type, action_value, created_at, updated_at
) VALUES
  ('rule_charity_rode_kors_nb', 'Charity: RODE KORS', 85, 1, 'description', 'contains', 'RODE KORS', NULL, 'set_category', 'cat_gifts_charity', datetime('now'), datetime('now')),
  ('rule_charity_unicef', 'Charity: UNICEF', 85, 1, 'description', 'contains', 'UNICEF', NULL, 'set_category', 'cat_gifts_charity', datetime('now'), datetime('now')),
  ('rule_charity_legen_uten_grenser', 'Charity: LEGER UTEN GRENSER', 85, 1, 'description', 'contains', 'LEGER UTEN GRENSER', NULL, 'set_category', 'cat_gifts_charity', datetime('now'), datetime('now')),
  ('rule_charity_kreftforeningen', 'Charity: KREFTFORENINGEN', 85, 1, 'description', 'contains', 'KREFTFORENINGEN', NULL, 'set_category', 'cat_gifts_charity', datetime('now'), datetime('now')),
  ('rule_charity_norsk_folkehjelp', 'Charity: NORSK FOLKEHJELP', 85, 1, 'description', 'contains', 'NORSK FOLKEHJELP', NULL, 'set_category', 'cat_gifts_charity', datetime('now'), datetime('now')),
  ('rule_charity_generic_donation', 'Charity: DONASJON', 110, 1, 'description', 'contains', 'DONASJON', NULL, 'set_category', 'cat_gifts_charity', datetime('now'), datetime('now')),
  ('rule_charity_generic_charity', 'Charity: VELDEDIGHET', 110, 1, 'description', 'contains', 'VELDEDIGHET', NULL, 'set_category', 'cat_gifts_charity', datetime('now'), datetime('now'));

-- Backfill matching existing rows but keep specific categories intact.
INSERT OR IGNORE INTO transaction_meta (transaction_id, category_id, updated_at)
SELECT t.id, 'cat_gifts_charity', datetime('now')
FROM transactions t
LEFT JOIN transaction_meta tm ON tm.transaction_id = t.id
WHERE tm.transaction_id IS NULL
  AND (
    UPPER(COALESCE(t.description, '') || ' ' || COALESCE(t.merchant, '')) LIKE '%RODE KORS%'
    OR (COALESCE(t.description, '') || ' ' || COALESCE(t.merchant, '')) LIKE '%Røde Kors%'
    OR UPPER(COALESCE(t.description, '') || ' ' || COALESCE(t.merchant, '')) LIKE '%UNICEF%'
    OR UPPER(COALESCE(t.description, '') || ' ' || COALESCE(t.merchant, '')) LIKE '%LEGER UTEN GRENSER%'
    OR UPPER(COALESCE(t.description, '') || ' ' || COALESCE(t.merchant, '')) LIKE '%KREFTFORENINGEN%'
    OR UPPER(COALESCE(t.description, '') || ' ' || COALESCE(t.merchant, '')) LIKE '%NORSK FOLKEHJELP%'
    OR UPPER(COALESCE(t.description, '') || ' ' || COALESCE(t.merchant, '')) LIKE '%DONASJON%'
    OR UPPER(COALESCE(t.description, '') || ' ' || COALESCE(t.merchant, '')) LIKE '%VELDEDIGHET%'
  );

UPDATE transaction_meta
SET category_id = 'cat_gifts_charity',
    updated_at = datetime('now')
WHERE transaction_id IN (
  SELECT t.id
  FROM transactions t
  WHERE
    UPPER(COALESCE(t.description, '') || ' ' || COALESCE(t.merchant, '')) LIKE '%RODE KORS%'
    OR (COALESCE(t.description, '') || ' ' || COALESCE(t.merchant, '')) LIKE '%Røde Kors%'
    OR UPPER(COALESCE(t.description, '') || ' ' || COALESCE(t.merchant, '')) LIKE '%UNICEF%'
    OR UPPER(COALESCE(t.description, '') || ' ' || COALESCE(t.merchant, '')) LIKE '%LEGER UTEN GRENSER%'
    OR UPPER(COALESCE(t.description, '') || ' ' || COALESCE(t.merchant, '')) LIKE '%KREFTFORENINGEN%'
    OR UPPER(COALESCE(t.description, '') || ' ' || COALESCE(t.merchant, '')) LIKE '%NORSK FOLKEHJELP%'
    OR UPPER(COALESCE(t.description, '') || ' ' || COALESCE(t.merchant, '')) LIKE '%DONASJON%'
    OR UPPER(COALESCE(t.description, '') || ' ' || COALESCE(t.merchant, '')) LIKE '%VELDEDIGHET%'
)
AND (category_id IS NULL OR category_id = '' OR category_id = 'cat_other');
