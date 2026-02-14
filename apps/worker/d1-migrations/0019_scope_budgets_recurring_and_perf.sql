-- Scope budgets/recurring per user and add targeted indexes for scoped analytics.

ALTER TABLE budgets ADD COLUMN user_id TEXT;
ALTER TABLE recurring ADD COLUMN user_id TEXT;

-- Backfill legacy rows to first user to preserve existing visibility for migrated installs.
UPDATE budgets
SET user_id = (
  SELECT id FROM users ORDER BY created_at ASC LIMIT 1
)
WHERE user_id IS NULL;

UPDATE recurring
SET user_id = (
  SELECT id FROM users ORDER BY created_at ASC LIMIT 1
)
WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id);
CREATE INDEX IF NOT EXISTS idx_budgets_user_active_start ON budgets(user_id, is_active, start_date);
CREATE INDEX IF NOT EXISTS idx_recurring_user ON recurring(user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_user_active ON recurring(user_id, is_active, is_subscription);

-- Faster scoped transaction filtering for dashboard/insights/transactions.
CREATE INDEX IF NOT EXISTS idx_transactions_user_status_date ON transactions(user_id, status, tx_date);
CREATE INDEX IF NOT EXISTS idx_transactions_user_flow_date ON transactions(user_id, flow_type, tx_date);
CREATE INDEX IF NOT EXISTS idx_transactions_user_excluded_date ON transactions(user_id, is_excluded, tx_date);
CREATE INDEX IF NOT EXISTS idx_transactions_user_transfer_date ON transactions(user_id, is_transfer, tx_date);
CREATE INDEX IF NOT EXISTS idx_transactions_user_source_file ON transactions(user_id, source_file_hash);
CREATE INDEX IF NOT EXISTS idx_transactions_user_amount ON transactions(user_id, amount);

CREATE INDEX IF NOT EXISTS idx_transaction_meta_category_tx ON transaction_meta(category_id, transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_meta_merchant_tx ON transaction_meta(merchant_id, transaction_id);
CREATE INDEX IF NOT EXISTS idx_rules_user_enabled_priority ON rules(user_id, enabled, priority);
