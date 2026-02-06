-- Baseline schema (idempotent) for Expense API.
-- This is designed to be safe to run on an existing DB (CREATE IF NOT EXISTS, INSERT OR IGNORE).
-- Do not add ALTER TABLE statements here; use subsequent migrations.

-- Ingested files table
CREATE TABLE IF NOT EXISTS ingested_files (
  id TEXT PRIMARY KEY,
  file_hash TEXT UNIQUE NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('xlsx', 'pdf', 'manual')),
  original_filename TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_ingested_files_hash ON ingested_files(file_hash);

-- Transactions table (normalized)
-- Note: `is_transfer` is intentionally NOT included here; it is added in a later migration.
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  tx_hash TEXT UNIQUE NOT NULL,
  tx_date TEXT NOT NULL,
  booked_date TEXT,
  description TEXT NOT NULL,
  merchant TEXT,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NOK',
  status TEXT NOT NULL CHECK (status IN ('pending', 'booked')),
  source_type TEXT NOT NULL,
  source_file_hash TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  is_excluded INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (source_file_hash) REFERENCES ingested_files(file_hash)
);

CREATE INDEX IF NOT EXISTS idx_transactions_hash ON transactions(tx_hash);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(tx_date);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_source ON transactions(source_file_hash);
CREATE INDEX IF NOT EXISTS idx_transactions_date_status ON transactions(tx_date, status);
CREATE INDEX IF NOT EXISTS idx_transactions_source_status ON transactions(source_type, status);
CREATE INDEX IF NOT EXISTS idx_transactions_amount ON transactions(amount);
CREATE INDEX IF NOT EXISTS idx_transactions_excluded ON transactions(is_excluded);

-- Legacy category rules table (kept for compatibility with existing DBs)
CREATE TABLE IF NOT EXISTS category_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  match_type TEXT NOT NULL CHECK (match_type IN ('exact', 'contains', 'regex')),
  pattern TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Categories table (hierarchical)
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT,
  color TEXT,
  icon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_transfer INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_sort ON categories(sort_order);
CREATE INDEX IF NOT EXISTS idx_categories_transfer ON categories(is_transfer);

-- Merchants table (canonical merchant names with pattern matching)
CREATE TABLE IF NOT EXISTS merchants (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL UNIQUE,
  patterns TEXT NOT NULL DEFAULT '[]', -- JSON array of patterns
  website TEXT,
  logo_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_merchants_name ON merchants(canonical_name);

-- Tags table
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);

-- Recurring transactions detection
CREATE TABLE IF NOT EXISTS recurring (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  merchant_id TEXT,
  category_id TEXT,
  amount_expected REAL,
  amount_min REAL,
  amount_max REAL,
  cadence TEXT NOT NULL CHECK (cadence IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
  day_of_month INTEGER,
  pattern TEXT NOT NULL DEFAULT '{}', -- JSON with detection pattern info
  is_active INTEGER NOT NULL DEFAULT 1,
  is_subscription INTEGER NOT NULL DEFAULT 0,
  last_occurrence TEXT,
  next_expected TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE SET NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_recurring_merchant ON recurring(merchant_id);
CREATE INDEX IF NOT EXISTS idx_recurring_category ON recurring(category_id);
CREATE INDEX IF NOT EXISTS idx_recurring_active ON recurring(is_active);
CREATE INDEX IF NOT EXISTS idx_recurring_subscription ON recurring(is_subscription);

-- Transaction metadata (enrichment data separate from raw transaction)
CREATE TABLE IF NOT EXISTS transaction_meta (
  transaction_id TEXT PRIMARY KEY,
  category_id TEXT,
  merchant_id TEXT,
  notes TEXT,
  is_recurring INTEGER NOT NULL DEFAULT 0,
  recurring_id TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE SET NULL,
  FOREIGN KEY (recurring_id) REFERENCES recurring(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_transaction_meta_category ON transaction_meta(category_id);
CREATE INDEX IF NOT EXISTS idx_transaction_meta_merchant ON transaction_meta(merchant_id);
CREATE INDEX IF NOT EXISTS idx_transaction_meta_recurring ON transaction_meta(recurring_id);

-- Transaction-tag junction table
CREATE TABLE IF NOT EXISTS transaction_tags (
  transaction_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (transaction_id, tag_id),
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_transaction_tags_tag ON transaction_tags(tag_id);

-- Rules table (categorization and enrichment rules)
CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  enabled INTEGER NOT NULL DEFAULT 1,
  match_field TEXT NOT NULL CHECK (match_field IN ('description', 'merchant', 'amount', 'source_type', 'status')),
  match_type TEXT NOT NULL CHECK (match_type IN ('contains', 'starts_with', 'ends_with', 'exact', 'regex', 'greater_than', 'less_than', 'between')),
  match_value TEXT NOT NULL,
  match_value_secondary TEXT, -- For 'between' match type
  action_type TEXT NOT NULL CHECK (action_type IN ('set_category', 'add_tag', 'set_merchant', 'set_notes', 'mark_recurring')),
  action_value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rules_enabled_priority ON rules(enabled, priority);
CREATE INDEX IF NOT EXISTS idx_rules_match_field ON rules(match_field);

-- Budgets table
CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  period_type TEXT NOT NULL CHECK (period_type IN ('monthly', 'weekly', 'yearly', 'custom')),
  start_date TEXT NOT NULL,
  end_date TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_budgets_active ON budgets(is_active);
CREATE INDEX IF NOT EXISTS idx_budgets_period ON budgets(period_type, start_date);

-- Budget items (per-category budget amounts)
CREATE TABLE IF NOT EXISTS budget_items (
  id TEXT PRIMARY KEY,
  budget_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  amount REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
  UNIQUE (budget_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_budget_items_budget ON budget_items(budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_items_category ON budget_items(category_id);

-- Transaction splits (for splitting one transaction into multiple categories)
CREATE TABLE IF NOT EXISTS transaction_splits (
  id TEXT PRIMARY KEY,
  parent_transaction_id TEXT NOT NULL,
  amount REAL NOT NULL,
  category_id TEXT,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (parent_transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_transaction_splits_parent ON transaction_splits(parent_transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_splits_category ON transaction_splits(category_id);

-- Seed default categories (safe to run multiple times)
INSERT OR IGNORE INTO categories (id, name, parent_id, color, icon, sort_order, is_transfer) VALUES
  ('cat_food', 'Food & Dining', NULL, '#ef4444', 'utensils', 1, 0),
  ('cat_food_groceries', 'Groceries', 'cat_food', '#f87171', 'shopping-cart', 1, 0),
  ('cat_food_restaurants', 'Restaurants', 'cat_food', '#fca5a5', 'store', 2, 0),
  ('cat_food_coffee', 'Coffee & Snacks', 'cat_food', '#fecaca', 'coffee', 3, 0),
  ('cat_transport', 'Transportation', NULL, '#3b82f6', 'car', 2, 0),
  ('cat_transport_fuel', 'Fuel', 'cat_transport', '#60a5fa', 'fuel', 1, 0),
  ('cat_transport_public', 'Public Transit', 'cat_transport', '#93c5fd', 'train', 2, 0),
  ('cat_transport_parking', 'Parking', 'cat_transport', '#bfdbfe', 'parking', 3, 0),
  ('cat_shopping', 'Shopping', NULL, '#8b5cf6', 'shopping-bag', 3, 0),
  ('cat_shopping_clothing', 'Clothing', 'cat_shopping', '#a78bfa', 'shirt', 1, 0),
  ('cat_shopping_electronics', 'Electronics', 'cat_shopping', '#c4b5fd', 'laptop', 2, 0),
  ('cat_shopping_home', 'Home & Garden', 'cat_shopping', '#ddd6fe', 'home', 3, 0),
  ('cat_entertainment', 'Entertainment', NULL, '#ec4899', 'film', 4, 0),
  ('cat_entertainment_streaming', 'Streaming Services', 'cat_entertainment', '#f472b6', 'tv', 1, 0),
  ('cat_entertainment_games', 'Games', 'cat_entertainment', '#f9a8d4', 'gamepad', 2, 0),
  ('cat_entertainment_events', 'Events & Activities', 'cat_entertainment', '#fbcfe8', 'ticket', 3, 0),
  ('cat_bills', 'Bills & Utilities', NULL, '#f59e0b', 'file-text', 5, 0),
  ('cat_bills_electricity', 'Electricity', 'cat_bills', '#fbbf24', 'zap', 1, 0),
  ('cat_bills_internet', 'Internet & Phone', 'cat_bills', '#fcd34d', 'wifi', 2, 0),
  ('cat_bills_insurance', 'Insurance', 'cat_bills', '#fde68a', 'shield', 3, 0),
  ('cat_health', 'Health & Wellness', NULL, '#10b981', 'heart', 6, 0),
  ('cat_health_pharmacy', 'Pharmacy', 'cat_health', '#34d399', 'pill', 1, 0),
  ('cat_health_fitness', 'Fitness', 'cat_health', '#6ee7b7', 'dumbbell', 2, 0),
  ('cat_health_medical', 'Medical', 'cat_health', '#a7f3d0', 'stethoscope', 3, 0),
  ('cat_travel', 'Travel', NULL, '#06b6d4', 'plane', 7, 0),
  ('cat_travel_lodging', 'Lodging', 'cat_travel', '#22d3ee', 'bed', 1, 0),
  ('cat_travel_flights', 'Flights', 'cat_travel', '#67e8f9', 'plane-takeoff', 2, 0),
  ('cat_income', 'Income', NULL, '#22c55e', 'wallet', 8, 0),
  ('cat_income_salary', 'Salary', 'cat_income', '#4ade80', 'banknote', 1, 0),
  ('cat_income_refund', 'Refunds', 'cat_income', '#86efac', 'rotate-ccw', 2, 0),
  ('cat_transfer', 'Transfers', NULL, '#6b7280', 'repeat', 9, 1),
  ('cat_other', 'Other', NULL, '#9ca3af', 'more-horizontal', 10, 0);

