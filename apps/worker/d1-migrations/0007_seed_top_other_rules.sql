-- Seed targeted rules for large, recurring "Other" merchants discovered via prod diagnostics.
-- Safe to run multiple times (INSERT OR IGNORE).
--
-- Principle: only add high-confidence mappings. Everything still remains user-editable.

INSERT OR IGNORE INTO rules (
  id, name, priority, enabled, match_field, match_type, match_value, match_value_secondary,
  action_type, action_value, created_at, updated_at
) VALUES
  -- Travel (packages / booking / tours)
  ('rule_other_booking', 'Travel: BOOKING', 65, 1, 'description', 'contains', 'BOOKING', NULL, 'set_category', 'cat_travel_lodging', datetime('now'), datetime('now')),
  ('rule_other_tui', 'Travel: TUI', 65, 1, 'description', 'contains', 'TUI', NULL, 'set_category', 'cat_travel', datetime('now'), datetime('now')),
  ('rule_other_ving', 'Travel: VING', 65, 1, 'description', 'contains', 'VING', NULL, 'set_category', 'cat_travel', datetime('now'), datetime('now')),
  ('rule_other_flamingo_tours', 'Travel: FLAMINGO TOURS', 65, 1, 'description', 'contains', 'FLAMINGO TOURS', NULL, 'set_category', 'cat_travel', datetime('now'), datetime('now')),
  ('rule_other_forex', 'Travel: FOREX', 75, 1, 'description', 'contains', 'FOREX', NULL, 'set_category', 'cat_travel', datetime('now'), datetime('now')),

  -- Events & activities
  ('rule_other_ticketmaster', 'Events: TICKETMASTER', 70, 1, 'description', 'contains', 'TICKETMASTER', NULL, 'set_category', 'cat_entertainment_events', datetime('now'), datetime('now')),

  -- Restaurants
  ('rule_other_kok', 'Restaurant: KOK OSLO', 60, 1, 'description', 'contains', 'KOK OSLO', NULL, 'set_category', 'cat_food_restaurants', datetime('now'), datetime('now')),
  ('rule_other_brasilia', 'Restaurant: BRASILIA', 60, 1, 'description', 'contains', 'BRASILIA', NULL, 'set_category', 'cat_food_restaurants', datetime('now'), datetime('now')),

  -- Health (medical)
  ('rule_other_dental', 'Health: DENTAL', 70, 1, 'description', 'contains', 'DENTAL', NULL, 'set_category', 'cat_health_medical', datetime('now'), datetime('now')),
  ('rule_other_derma', 'Health: DERMA', 75, 1, 'description', 'contains', 'DERMA', NULL, 'set_category', 'cat_health_medical', datetime('now'), datetime('now')),

  -- Shopping
  ('rule_other_unisport', 'Shopping: UNISPORT', 70, 1, 'description', 'contains', 'UNISPORT', NULL, 'set_category', 'cat_shopping_clothing', datetime('now'), datetime('now'));

