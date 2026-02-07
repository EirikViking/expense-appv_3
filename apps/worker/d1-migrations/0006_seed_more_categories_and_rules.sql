-- Seed additional categories and rules to reduce "Other" and make the app useful out of the box.
-- Safe to run multiple times (INSERT OR IGNORE).

-- Extra categories (optional)
INSERT OR IGNORE INTO categories (id, name, parent_id, color, icon, sort_order, is_transfer) VALUES
  ('cat_health_personal_care', 'Personal Care', 'cat_health', '#a7f3d0', 'scissors', 4, 0);

-- Rules (match on description; backend matches against LOWER(merchant + ' ' + description) for consistency)
INSERT OR IGNORE INTO rules (
  id, name, priority, enabled, match_field, match_type, match_value, match_value_secondary,
  action_type, action_value, created_at, updated_at
) VALUES
  -- Personal care
  ('rule_more_cutters', 'Personal Care: CUTTERS', 55, 1, 'description', 'contains', 'CUTTERS', NULL, 'set_category', 'cat_health_personal_care', datetime('now'), datetime('now')),

  -- Coffee/snacks
  ('rule_more_narvesen', 'Coffee & Snacks: NARVESEN', 55, 1, 'description', 'contains', 'NARVESEN', NULL, 'set_category', 'cat_food_coffee', datetime('now'), datetime('now')),
  ('rule_more_7eleven', 'Coffee & Snacks: 7-ELEVEN', 55, 1, 'description', 'contains', '7-ELEVEN', NULL, 'set_category', 'cat_food_coffee', datetime('now'), datetime('now')),

  -- Shopping
  ('rule_more_xxl', 'Shopping: XXL', 60, 1, 'description', 'contains', 'XXL', NULL, 'set_category', 'cat_shopping', datetime('now'), datetime('now')),
  ('rule_more_elkjop', 'Electronics: ELKJØP', 60, 1, 'description', 'contains', 'ELKJØP', NULL, 'set_category', 'cat_shopping_electronics', datetime('now'), datetime('now')),
  ('rule_more_elkjop_ascii', 'Electronics: ELKJOP', 60, 1, 'description', 'contains', 'ELKJOP', NULL, 'set_category', 'cat_shopping_electronics', datetime('now'), datetime('now')),
  ('rule_more_temu', 'Shopping: TEMU', 60, 1, 'description', 'contains', 'TEMU', NULL, 'set_category', 'cat_shopping', datetime('now'), datetime('now')),
  ('rule_more_amazon', 'Shopping: AMAZON', 65, 1, 'description', 'contains', 'AMAZON', NULL, 'set_category', 'cat_shopping', datetime('now'), datetime('now')),

  -- Travel
  ('rule_more_scandic', 'Travel: SCANDIC', 60, 1, 'description', 'contains', 'SCANDIC', NULL, 'set_category', 'cat_travel_lodging', datetime('now'), datetime('now')),
  ('rule_more_thon', 'Travel: THON', 65, 1, 'description', 'contains', 'THON', NULL, 'set_category', 'cat_travel_lodging', datetime('now'), datetime('now')),
  ('rule_more_radisson', 'Travel: RADISSON', 65, 1, 'description', 'contains', 'RADISSON', NULL, 'set_category', 'cat_travel_lodging', datetime('now'), datetime('now')),
  ('rule_more_norwegian', 'Travel: NORWEGIAN', 60, 1, 'description', 'contains', 'NORWEGIAN', NULL, 'set_category', 'cat_travel_flights', datetime('now'), datetime('now')),
  ('rule_more_wideroe', 'Travel: WIDEROE', 60, 1, 'description', 'contains', 'WIDEROE', NULL, 'set_category', 'cat_travel_flights', datetime('now'), datetime('now')),

  -- Public transport
  ('rule_more_vy', 'Transport: VY', 60, 1, 'description', 'contains', ' VY', NULL, 'set_category', 'cat_transport_public', datetime('now'), datetime('now')),
  ('rule_more_nsb', 'Transport: NSB', 60, 1, 'description', 'contains', 'NSB', NULL, 'set_category', 'cat_transport_public', datetime('now'), datetime('now')),

  -- Events/activities
  ('rule_more_viator', 'Events: VIATOR', 70, 1, 'description', 'contains', 'VIATOR', NULL, 'set_category', 'cat_entertainment_events', datetime('now'), datetime('now')),
  ('rule_more_musement', 'Events: MUSEMENT', 70, 1, 'description', 'contains', 'MUSEMENT', NULL, 'set_category', 'cat_entertainment_events', datetime('now'), datetime('now'));

