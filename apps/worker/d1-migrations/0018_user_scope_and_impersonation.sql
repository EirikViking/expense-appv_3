-- Per-user data scope and admin impersonation support.
-- Safe additive migration.

ALTER TABLE sessions ADD COLUMN impersonated_user_id TEXT;

ALTER TABLE ingested_files ADD COLUMN user_id TEXT;
ALTER TABLE transactions ADD COLUMN user_id TEXT;
ALTER TABLE rules ADD COLUMN user_id TEXT;

-- Backfill existing data to first created user to preserve legacy visibility.
UPDATE ingested_files
SET user_id = (
  SELECT id FROM users ORDER BY created_at ASC LIMIT 1
)
WHERE user_id IS NULL;

UPDATE transactions
SET user_id = (
  SELECT id FROM users ORDER BY created_at ASC LIMIT 1
)
WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_impersonated_user ON sessions(impersonated_user_id);
CREATE INDEX IF NOT EXISTS idx_ingested_files_user ON ingested_files(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, tx_date);
CREATE INDEX IF NOT EXISTS idx_rules_user ON rules(user_id);
