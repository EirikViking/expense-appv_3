-- Ensure all matching gift/charity transactions are assigned to cat_gifts_charity.

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
);

