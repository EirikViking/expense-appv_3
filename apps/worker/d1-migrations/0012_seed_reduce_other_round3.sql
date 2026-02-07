-- Round 3: shrink "Other" with additional high-confidence merchants from diagnostics.
-- Safe to run multiple times (INSERT OR IGNORE).

-- Rules (match on description; backend matches against LOWER(merchant + ' ' + description) for consistency)
INSERT OR IGNORE INTO rules (
  id, name, priority, enabled, match_field, match_type, match_value, match_value_secondary,
  action_type, action_value, created_at, updated_at
) VALUES
  -- Food (restaurants / coffee)
  ('rule_more_burger_king', 'Restaurants: BURGER KING', 90, 1, 'description', 'contains', 'BURGER KING', NULL, 'set_category', 'cat_food_restaurants', datetime('now'), datetime('now')),
  ('rule_more_prindsen_hage', 'Restaurants: PRINDSEN HAGE', 95, 1, 'description', 'contains', 'PRINDSEN HAGE', NULL, 'set_category', 'cat_food_restaurants', datetime('now'), datetime('now')),
  ('rule_more_mela_cafe', 'Coffee: MELA CAFE', 95, 1, 'description', 'contains', 'MELA CAFE', NULL, 'set_category', 'cat_food_coffee', datetime('now'), datetime('now')),

  -- Entertainment (games)
  ('rule_more_steam', 'Games: STEAM', 95, 1, 'description', 'contains', 'STEAM', NULL, 'set_category', 'cat_entertainment_games', datetime('now'), datetime('now')),

  -- Travel (lodging)
  ('rule_more_hotel_posadas', 'Travel: HOTEL POSADAS', 100, 1, 'description', 'contains', 'HOTEL POSADAS', NULL, 'set_category', 'cat_travel_lodging', datetime('now'), datetime('now')),

  -- Shopping
  ('rule_more_norli', 'Shopping: NORLI', 95, 1, 'description', 'contains', 'NORLI', NULL, 'set_category', 'cat_shopping', datetime('now'), datetime('now')),
  ('rule_more_normal_oslo', 'Shopping: NORMAL', 120, 1, 'description', 'contains', 'NORMAL', NULL, 'set_category', 'cat_shopping', datetime('now'), datetime('now')),
  ('rule_more_mester_gronn', 'Shopping: MESTER GRONN', 110, 1, 'description', 'contains', 'MESTER GRONN', NULL, 'set_category', 'cat_shopping', datetime('now'), datetime('now')),

  -- Health (medical)
  ('rule_more_parsennklinik', 'Health: PARSENNKLINIKK', 95, 1, 'description', 'contains', 'PARSENNKLINIKK', NULL, 'set_category', 'cat_health_medical', datetime('now'), datetime('now')),
  ('rule_more_gettested', 'Health: GETTESTED.NO', 95, 1, 'description', 'contains', 'GETTESTED', NULL, 'set_category', 'cat_health_medical', datetime('now'), datetime('now'));

