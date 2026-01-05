-- Initial schema for Personal Expense Analytics

-- Ingested files table
CREATE TABLE IF NOT EXISTS ingested_files (
  id TEXT PRIMARY KEY,
  file_hash TEXT UNIQUE NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('xlsx', 'pdf')),
  original_filename TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_ingested_files_hash ON ingested_files(file_hash);

-- Transactions table
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
  FOREIGN KEY (source_file_hash) REFERENCES ingested_files(file_hash)
);

CREATE INDEX IF NOT EXISTS idx_transactions_hash ON transactions(tx_hash);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(tx_date);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_source ON transactions(source_file_hash);

-- Category rules table
CREATE TABLE IF NOT EXISTS category_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  match_type TEXT NOT NULL CHECK (match_type IN ('exact', 'contains', 'regex')),
  pattern TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TEXT NOT NULL
);
