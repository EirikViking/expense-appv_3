-- Store both normalized merchant and original merchant text for traceability.

ALTER TABLE transactions ADD COLUMN merchant_raw TEXT;

-- Backfill legacy rows so original merchant text is preserved.
UPDATE transactions
SET merchant_raw = merchant
WHERE merchant_raw IS NULL
  AND merchant IS NOT NULL;

