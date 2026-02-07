-- Add a tax payment category and rule for Skatteetaten.
-- Safe to run multiple times (INSERT OR IGNORE).

INSERT OR IGNORE INTO categories (id, name, parent_id, color, icon, sort_order, is_transfer) VALUES
  ('cat_bills_tax', 'Betaling av skatt', 'cat_bills', '#fbbf24', 'T', 4, 0);

INSERT OR IGNORE INTO rules (
  id, name, priority, enabled, match_field, match_type, match_value, match_value_secondary,
  action_type, action_value, created_at, updated_at
) VALUES
  ('rule_tax_skatteetaten', 'Tax: SKATTEETATEN', 45, 1, 'description', 'contains', 'SKATTEETATEN', NULL, 'set_category', 'cat_bills_tax', datetime('now'), datetime('now'));

