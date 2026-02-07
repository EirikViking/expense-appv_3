-- Round 4: more high-confidence rules to shrink "Other" based on prod diagnostics.
-- Safe to run multiple times (INSERT OR IGNORE).

INSERT OR IGNORE INTO rules (
  id, name, priority, enabled, match_field, match_type, match_value, match_value_secondary,
  action_type, action_value, created_at, updated_at
) VALUES
  -- Pharmacy / health
  ('rule_more_apotek1', 'Pharmacy: APOTEK1', 95, 1, 'description', 'contains', 'APOTEK1', NULL, 'set_category', 'cat_health_pharmacy', datetime('now'), datetime('now')),
  ('rule_more_psychology47', 'Health: PSYCOLOGY47', 110, 1, 'description', 'contains', 'PSYCOLOGY47', NULL, 'set_category', 'cat_health_medical', datetime('now'), datetime('now')),

  -- Shopping / home
  ('rule_more_clas_ohlson', 'Home & Garden: CLAS OHL', 95, 1, 'description', 'contains', 'CLAS OHL', NULL, 'set_category', 'cat_shopping_home', datetime('now'), datetime('now')),
  ('rule_more_mypremiumhouse', 'Home & Garden: MYPREMIUMHOUSE.COM', 95, 1, 'description', 'contains', 'MYPREMIUMHOUSE', NULL, 'set_category', 'cat_shopping_home', datetime('now'), datetime('now')),
  ('rule_more_dhl_global_pay', 'Shopping: DHL Global Pay', 120, 1, 'description', 'contains', 'DHL Global Pay', NULL, 'set_category', 'cat_shopping', datetime('now'), datetime('now')),

  -- Food
  ('rule_more_buljonggruppen', 'Restaurants: BULJONGGRUPPEN', 95, 1, 'description', 'contains', 'BULJONGGRUPPEN', NULL, 'set_category', 'cat_food_restaurants', datetime('now'), datetime('now')),

  -- Entertainment / travel
  ('rule_more_itch_io', 'Games: ITCH IO', 95, 1, 'description', 'contains', 'ITCH IO', NULL, 'set_category', 'cat_entertainment_games', datetime('now'), datetime('now')),
  ('rule_more_play_granada', 'Events: PLAY GRANADA', 120, 1, 'description', 'contains', 'PLAY GRANADA', NULL, 'set_category', 'cat_entertainment_events', datetime('now'), datetime('now')),
  ('rule_more_wattif', 'Travel: WATTIF', 120, 1, 'description', 'contains', 'WATTIF', NULL, 'set_category', 'cat_travel', datetime('now'), datetime('now'));

