-- Persisted budget settings per user (feature toggle + optional period targets).

CREATE TABLE IF NOT EXISTS budget_settings (
  user_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  weekly_amount REAL,
  monthly_amount REAL,
  yearly_amount REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_budget_settings_enabled ON budget_settings(enabled);
