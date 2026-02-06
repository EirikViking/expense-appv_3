-- Add explicit flow classification so analytics do not depend on amount sign alone.
-- Allowed values: unknown, expense, income, transfer

ALTER TABLE transactions
  ADD COLUMN flow_type TEXT NOT NULL DEFAULT 'unknown';

CREATE INDEX IF NOT EXISTS idx_transactions_flow_type ON transactions(flow_type);

