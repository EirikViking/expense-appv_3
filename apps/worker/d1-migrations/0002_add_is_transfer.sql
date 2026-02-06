-- Add transfer flag to transactions (used to remove transfer pollution from analytics)
ALTER TABLE transactions ADD COLUMN is_transfer INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_transactions_transfer ON transactions(is_transfer);

