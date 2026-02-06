-- Seed starter grocery categorization rules (safe to run multiple times).
-- These map common Norwegian grocery merchants to the default Groceries category.

INSERT OR IGNORE INTO rules (
  id, name, priority, enabled, match_field, match_type, match_value, match_value_secondary,
  action_type, action_value, created_at, updated_at
) VALUES
  ('rule_seed_groceries_kiwi', 'Groceries: KIWI', 50, 1, 'description', 'contains', 'KIWI', NULL, 'set_category', 'cat_food_groceries', datetime('now'), datetime('now')),
  ('rule_seed_groceries_rema1000', 'Groceries: REMA 1000', 50, 1, 'description', 'contains', 'REMA', NULL, 'set_category', 'cat_food_groceries', datetime('now'), datetime('now')),
  ('rule_seed_groceries_meny', 'Groceries: MENY', 50, 1, 'description', 'contains', 'MENY', NULL, 'set_category', 'cat_food_groceries', datetime('now'), datetime('now')),
  ('rule_seed_groceries_coop', 'Groceries: COOP', 55, 1, 'description', 'contains', 'COOP', NULL, 'set_category', 'cat_food_groceries', datetime('now'), datetime('now')),
  ('rule_seed_groceries_extra', 'Groceries: EXTRA', 55, 1, 'description', 'contains', 'EXTRA', NULL, 'set_category', 'cat_food_groceries', datetime('now'), datetime('now')),
  ('rule_seed_groceries_obs', 'Groceries: OBS', 60, 1, 'description', 'contains', 'OBS', NULL, 'set_category', 'cat_food_groceries', datetime('now'), datetime('now')),
  ('rule_seed_groceries_spar', 'Groceries: SPAR', 60, 1, 'description', 'contains', 'SPAR', NULL, 'set_category', 'cat_food_groceries', datetime('now'), datetime('now')),
  ('rule_seed_groceries_joker', 'Groceries: JOKER', 60, 1, 'description', 'contains', 'JOKER', NULL, 'set_category', 'cat_food_groceries', datetime('now'), datetime('now'));

