-- Extended categorization rules for Norwegian transactions
-- Covers groceries, restaurants, transport, streaming, fitness, bills, tech, shopping, travel

INSERT OR IGNORE INTO rules (
  id, name, priority, enabled, match_field, match_type, match_value, match_value_secondary,
  action_type, action_value, created_at, updated_at
) VALUES
  -- Dagligvarer (Groceries)
  ('rule_seed_groceries_kiwi', 'Groceries: KIWI', 50, 1, 'description', 'contains', 'KIWI', NULL, 'set_category', 'cat_food_groceries', datetime('now'), datetime('now')),
  ('rule_seed_groceries_rema1000', 'Groceries: REMA 1000', 50, 1, 'description', 'contains', 'REMA', NULL, 'set_category', 'cat_food_groceries', datetime('now'), datetime('now')),
  ('rule_seed_groceries_meny', 'Groceries: MENY', 50, 1, 'description', 'contains', 'MENY', NULL, 'set_category', 'cat_food_groceries', datetime('now'), datetime('now')),
  ('rule_seed_groceries_coop', 'Groceries: COOP', 55, 1, 'description', 'contains', 'COOP', NULL, 'set_category', 'cat_food_groceries', datetime('now'), datetime('now')),
  ('rule_seed_groceries_extra', 'Groceries: EXTRA', 55, 1, 'description', 'contains', 'EXTRA', NULL, 'set_category', 'cat_food_groceries', datetime('now'), datetime('now')),
  ('rule_seed_groceries_obs', 'Groceries: OBS', 60, 1, 'description', 'contains', 'OBS', NULL, 'set_category', 'cat_food_groceries', datetime('now'), datetime('now')),
  ('rule_seed_groceries_spar', 'Groceries: SPAR', 60, 1, 'description', 'contains', 'SPAR', NULL, 'set_category', 'cat_food_groceries', datetime('now'), datetime('now')),
  ('rule_seed_groceries_joker', 'Groceries: JOKER', 60, 1, 'description', 'contains', 'JOKER', NULL, 'set_category', 'cat_food_groceries', datetime('now'), datetime('now')),
  ('rule_varekjop', 'Groceries: Varekjøp', 70, 1, 'description', 'contains', 'Varekjøp', NULL, 'set_category', 'cat_food_groceries', datetime('now'), datetime('now')),
  ('rule_bunnpris', 'Groceries: BUNNPRIS', 55, 1, 'description', 'contains', 'BUNNPRIS', NULL, 'set_category', 'cat_food_groceries', datetime('now'), datetime('now')),
  
  -- Restauranter (Restaurants)
  ('rule_lostacos', 'Restaurant: LOS TACOS', 50, 1, 'description', 'contains', 'LOS TACOS', NULL, 'set_category', 'cat_food_restaurants', datetime('now'), datetime('now')),
  ('rule_munchies', 'Restaurant: MUNCHIES', 50, 1, 'description', 'contains', 'MUNCHIES', NULL, 'set_category', 'cat_food_restaurants', datetime('now'), datetime('now')),
  ('rule_foodora', 'Restaurant: FOODORA', 50, 1, 'description', 'contains', 'FOODORA', NULL, 'set_category', 'cat_food_restaurants', datetime('now'), datetime('now')),
  ('rule_wolt', 'Restaurant: WOLT', 50, 1, 'description', 'contains', 'WOLT', NULL, 'set_category', 'cat_food_restaurants', datetime('now'), datetime('now')),

  -- Transport
  ('rule_flytoget', 'Transport: FLYTOGET', 50, 1, 'description', 'contains', 'FLYTOGET', NULL, 'set_category', 'cat_transport_public', datetime('now'), datetime('now')),
  ('rule_ruter', 'Transport: RUTER', 50, 1, 'description', 'contains', 'RUTER', NULL, 'set_category', 'cat_transport_public', datetime('now'), datetime('now')),
  ('rule_taxi', 'Transport: TAXI', 50, 1, 'description', 'contains', 'TAXI', NULL, 'set_category', 'cat_transport_public', datetime('now'), datetime('now')),
  ('rule_uber', 'Transport: UBER', 50, 1, 'description', 'contains', 'UBER', NULL, 'set_category', 'cat_transport_public', datetime('now'), datetime('now')),

  -- Streaming & Entertainment
  ('rule_netflix', 'Streaming: NETFLIX', 50, 1, 'description', 'contains', 'NETFLIX', NULL, 'set_category', 'cat_entertainment_streaming', datetime('now'), datetime('now')),
  ('rule_hbomax', 'Streaming: HBO MAX', 50, 1, 'description', 'contains', 'HBOMAX', NULL, 'set_category', 'cat_entertainment_streaming', datetime('now'), datetime('now')),
  ('rule_hbo', 'Streaming: HBO', 55, 1, 'description', 'contains', 'HBO', NULL, 'set_category', 'cat_entertainment_streaming', datetime('now'), datetime('now')),
  ('rule_spotify', 'Streaming: SPOTIFY', 50, 1, 'description', 'contains', 'SPOTIFY', NULL, 'set_category', 'cat_entertainment_streaming', datetime('now'), datetime('now')),
  ('rule_tv2', 'Streaming: TV 2', 50, 1, 'description', 'contains', 'TV 2', NULL, 'set_category', 'cat_entertainment_streaming', datetime('now'), datetime('now')),
  ('rule_viaplay', 'Streaming: VIAPLAY', 50, 1, 'description', 'contains', 'VIAPLAY', NULL, 'set_category', 'cat_entertainment_streaming', datetime('now'), datetime('now')),

  -- Apps & Games
  ('rule_google_play', 'Apps: GOOGLE PLAY', 50, 1, 'description', 'contains', 'Google Play', NULL, 'set_category', 'cat_entertainment_games', datetime('now'), datetime('now')),
  ('rule_apple', 'Apps: APPLE', 50, 1, 'description', 'contains', 'APPLE.COM', NULL, 'set_category', 'cat_entertainment_games', datetime('now'), datetime('now')),

  -- Fitness & Health  
  ('rule_sats', 'Fitness: SATS', 50, 1, 'description', 'contains', 'SATS', NULL, 'set_category', 'cat_health_fitness', datetime('now'), datetime('now')),
  ('rule_elixia', 'Fitness: ELIXIA', 50, 1, 'description', 'contains', 'ELIXIA', NULL, 'set_category', 'cat_health_fitness', datetime('now'), datetime('now')),

  -- Regninger & Abonnement
  ('rule_telia', 'Bills: TELIA', 50, 1, 'description', 'contains', 'TELIA', NULL, 'set_category', 'cat_bills_internet', datetime('now'), datetime('now')),
  ('rule_telenor', 'Bills: TELENOR', 50, 1, 'description', 'contains', 'TELENOR', NULL, 'set_category', 'cat_bills_internet', datetime('now'), datetime('now')),
  ('rule_storebrand_forsikring', 'Insurance: STOREBRAND', 50, 1, 'description', 'contains', 'STOREBRAND LIVSFORSIKRING', NULL, 'set_category', 'cat_bills_insurance', datetime('now'), datetime('now')),
  ('rule_rode_kors', 'Charity: RØDE KORS', 50, 1, 'description', 'contains', 'Røde Kors', NULL, 'set_category', 'cat_other', datetime('now'), datetime('now')),

  -- Tech & SaaS
  ('rule_anthropic', 'Tech: ANTHROPIC', 50, 1, 'description', 'contains', 'ANTHROPIC', NULL, 'set_category', 'cat_shopping_electronics', datetime('now'), datetime('now')),
  ('rule_claude', 'Tech: CLAUDE.AI', 50, 1, 'description', 'contains', 'CLAUDE.AI', NULL, 'set_category', 'cat_shopping_electronics', datetime('now'), datetime('now')),
  ('rule_openrouter', 'Tech: OPENROUTER', 50, 1, 'description', 'contains', 'OPENROUTER', NULL, 'set_category', 'cat_shopping_electronics', datetime('now'), datetime('now')),
  ('rule_replit', 'Tech: REPLIT', 50, 1, 'description', 'contains', 'REPLIT', NULL, 'set_category', 'cat_shopping_electronics', datetime('now'), datetime('now')),
  ('rule_lovable', 'Tech: LOVABLE', 50, 1, 'description', 'contains', 'LOVABLE', NULL, 'set_category', 'cat_shopping_electronics', datetime('now'), datetime('now')),
  ('rule_cloudflare', 'Tech: CLOUDFLARE', 50, 1, 'description', 'contains', 'CLOUDFLARE', NULL, 'set_category', 'cat_shopping_electronics', datetime('now'), datetime('now')),
  ('rule_paypal', 'Payment: PAYPAL', 80, 1, 'description', 'contains', 'PAYPAL', NULL, 'set_category', 'cat_other', datetime('now'), datetime('now')),

  -- Travel
  ('rule_sas', 'Travel: SAS', 50, 1, 'description', 'contains', 'SCANDINAVIAN AIRLINES', NULL, 'set_category', 'cat_travel_flights', datetime('now'), datetime('now')),
  ('rule_quality', 'Hotel: QUALITY', 50, 1, 'description', 'contains', 'QUALITY', NULL, 'set_category', 'cat_travel_lodging', datetime('now'), datetime('now')),

  -- Investments (typically should be excluded/transfer)
  ('rule_kron', 'Investment: KRON', 50, 1, 'description', 'contains', 'Kjøp Kron', NULL, 'set_category', 'cat_transfer', datetime('now'), datetime('now'));


