-- Migration 003: Transaction exclusions and transfer category marking
-- Adds is_excluded to transactions and is_transfer to categories

-- Add is_excluded column to transactions
-- This allows users to exclude large or atypical transactions from analytics
ALTER TABLE transactions ADD COLUMN is_excluded INTEGER NOT NULL DEFAULT 0;

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_transactions_excluded ON transactions(is_excluded);

-- Add is_transfer column to categories
-- This marks categories that represent internal transfers (not real income/expense)
ALTER TABLE categories ADD COLUMN is_transfer INTEGER NOT NULL DEFAULT 0;

-- Mark the default "Transfers" category as a transfer category
UPDATE categories SET is_transfer = 1 WHERE id = 'cat_transfer';

-- Create index for transfer lookups
CREATE INDEX IF NOT EXISTS idx_categories_transfer ON categories(is_transfer);
