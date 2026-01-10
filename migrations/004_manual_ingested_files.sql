-- Migration 004: allow manual source type in ingested_files
PRAGMA foreign_keys=off;

CREATE TABLE IF NOT EXISTS ingested_files_new (
  id TEXT PRIMARY KEY,
  file_hash TEXT UNIQUE NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('xlsx', 'pdf', 'manual')),
  original_filename TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  metadata_json TEXT
);

INSERT INTO ingested_files_new (id, file_hash, source_type, original_filename, uploaded_at, metadata_json)
SELECT id, file_hash, source_type, original_filename, uploaded_at, metadata_json
FROM ingested_files;

DROP TABLE ingested_files;

ALTER TABLE ingested_files_new RENAME TO ingested_files;

CREATE INDEX IF NOT EXISTS idx_ingested_files_hash ON ingested_files(file_hash);

PRAGMA foreign_keys=on;
