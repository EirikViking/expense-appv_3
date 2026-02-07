-- Migration 005: Seed categorization rules for automatic categorization
-- These rules will automatically categorize transactions based on description patterns

-- Dagligvarer (Groceries)
INSERT OR IGNORE INTO rules (id, name, priority, enabled, match_field, match_type, match_value, action_type, action_value) VALUES
  ('rule_kiwi', 'KIWI → Dagligvarer', 10, 1, 'description', 'contains', 'KIWI', 'set_category', 'cat_food_groceries'),
  ('rule_rema', 'REMA → Dagligvarer', 10, 1, 'description', 'contains', 'REMA', 'set_category', 'cat_food_groceries'),
  ('rule_meny', 'MENY → Dagligvarer', 10, 1, 'description', 'contains', 'MENY', 'set_category', 'cat_food_groceries'),
  ('rule_coop', 'COOP → Dagligvarer', 10, 1, 'description', 'contains', 'COOP', 'set_category', 'cat_food_groceries'),
  ('rule_extra', 'EXTRA → Dagligvarer', 10, 1, 'description', 'contains', 'EXTRA', 'set_category', 'cat_food_groceries'),
  ('rule_obs', 'OBS → Dagligvarer', 10, 1, 'description', 'contains', 'OBS!', 'set_category', 'cat_food_groceries'),
  ('rule_spar', 'SPAR → Dagligvarer', 10, 1, 'description', 'contains', 'SPAR', 'set_category', 'cat_food_groceries'),
  ('rule_joker', 'JOKER → Dagligvarer', 10, 1, 'description', 'contains', 'JOKER', 'set_category', 'cat_food_groceries'),
  ('rule_bunnpris', 'BUNNPRIS → Dagligvarer', 10, 1, 'description', 'contains', 'BUNNPRIS', 'set_category', 'cat_food_groceries'),
  ('rule_europris', 'EUROPRIS → Dagligvarer', 10, 1, 'description', 'contains', 'EUROPRIS', 'set_category', 'cat_food_groceries'),
  ('rule_norgesgruppen', 'Norgesgruppen → Dagligvarer', 10, 1, 'description', 'contains', 'NORGESGRUPPEN', 'set_category', 'cat_food_groceries'),
  ('rule_varekjop', 'Varekjøp → Dagligvarer', 15, 1, 'description', 'contains', 'Varekjøp', 'set_category', 'cat_food_groceries'),

-- Restauranter (Restaurants)
  ('rule_lostacos', 'LOS TACOS → Restauranter', 10, 1, 'description', 'contains', 'LOS TACOS', 'set_category', 'cat_food_restaurants'),
  ('rule_mcdonalds', 'MCDONALDS → Restauranter', 10, 1, 'description', 'contains', 'MCDONALDS', 'set_category', 'cat_food_restaurants'),
  ('rule_burgerking', 'BURGER KING → Restauranter', 10, 1, 'description', 'contains', 'BURGER KING', 'set_category', 'cat_food_restaurants'),
  ('rule_peppes', 'PEPPES → Restauranter', 10, 1, 'description', 'contains', 'PEPPES', 'set_category', 'cat_food_restaurants'),
  ('rule_foodora', 'FOODORA → Restauranter', 10, 1, 'description', 'contains', 'FOODORA', 'set_category', 'cat_food_restaurants'),
  ('rule_wolt', 'WOLT → Restauranter', 10, 1, 'description', 'contains', 'WOLT', 'set_category', 'cat_food_restaurants'),
  ('rule_just_eat', 'JUST EAT → Restauranter', 10, 1, 'description', 'contains', 'JUST EAT', 'set_category', 'cat_food_restaurants'),
  ('rule_munchies', 'MUNCHIES → Restauranter', 10, 1, 'description', 'contains', 'MUNCHIES', 'set_category', 'cat_food_restaurants'),

-- Kaffe & Snacks
  ('rule_starbucks', 'STARBUCKS → Kaffe', 10, 1, 'description', 'contains', 'STARBUCKS', 'set_category', 'cat_food_coffee'),
  ('rule_espressohouse', 'ESPRESSO HOUSE → Kaffe', 10, 1, 'description', 'contains', 'ESPRESSO HOUSE', 'set_category', 'cat_food_coffee'),
  ('rule_waynes', 'WAYNES → Kaffe', 10, 1, 'description', 'contains', 'WAYNES', 'set_category', 'cat_food_coffee'),

-- Transport
  ('rule_flytoget', 'FLYTOGET → Transport', 10, 1, 'description', 'contains', 'FLYTOGET', 'set_category', 'cat_transport_public'),
  ('rule_ruter', 'RUTER → Transport', 10, 1, 'description', 'contains', 'RUTER', 'set_category', 'cat_transport_public'),
  ('rule_vy', 'VY → Transport', 10, 1, 'description', 'contains', 'VY ', 'set_category', 'cat_transport_public'),
  ('rule_nsb', 'NSB → Transport', 10, 1, 'description', 'contains', 'NSB', 'set_category', 'cat_transport_public'),
  ('rule_atb', 'ATB → Transport', 10, 1, 'description', 'contains', 'ATB', 'set_category', 'cat_transport_public'),
  ('rule_kolumbus', 'KOLUMBUS → Transport', 10, 1, 'description', 'contains', 'KOLUMBUS', 'set_category', 'cat_transport_public'),
  ('rule_uber', 'UBER → Transport', 10, 1, 'description', 'contains', 'UBER', 'set_category', 'cat_transport_public'),
  ('rule_bolt', 'BOLT → Transport', 10, 1, 'description', 'contains', 'BOLT', 'set_category', 'cat_transport_public'),
  ('rule_taxi', 'TAXI → Transport', 10, 1, 'description', 'contains', 'TAXI', 'set_category', 'cat_transport_public'),
  ('rule_circle_k', 'CIRCLE K → Drivstoff', 10, 1, 'description', 'contains', 'CIRCLE K', 'set_category', 'cat_transport_fuel'),
  ('rule_shell', 'SHELL → Drivstoff', 10, 1, 'description', 'contains', 'SHELL', 'set_category', 'cat_transport_fuel'),
  ('rule_esso', 'ESSO → Drivstoff', 10, 1, 'description', 'contains', 'ESSO', 'set_category', 'cat_transport_fuel'),
  ('rule_uno_x', 'UNO-X → Drivstoff', 10, 1, 'description', 'contains', 'UNO-X', 'set_category', 'cat_transport_fuel'),
  ('rule_best', 'BEST → Drivstoff', 10, 1, 'description', 'contains', 'BEST ', 'set_category', 'cat_transport_fuel'),

-- Streaming & Entertainment
  ('rule_netflix', 'NETFLIX → Streaming', 10, 1, 'description', 'contains', 'NETFLIX', 'set_category', 'cat_entertainment_streaming'),
  ('rule_hbomax', 'HBO MAX → Streaming', 10, 1, 'description', 'contains', 'HBOMAX', 'set_category', 'cat_entertainment_streaming'),
  ('rule_hbo', 'HBO → Streaming', 10, 1, 'description', 'contains', 'HBO', 'set_category', 'cat_entertainment_streaming'),
  ('rule_disney', 'DISNEY+ → Streaming', 10, 1, 'description', 'contains', 'DISNEY', 'set_category', 'cat_entertainment_streaming'),
  ('rule_viaplay', 'VIAPLAY → Streaming', 10, 1, 'description', 'contains', 'VIAPLAY', 'set_category', 'cat_entertainment_streaming'),
  ('rule_spotify', 'SPOTIFY → Streaming', 10, 1, 'description', 'contains', 'SPOTIFY', 'set_category', 'cat_entertainment_streaming'),
  ('rule_youtube', 'YOUTUBE → Streaming', 10, 1, 'description', 'contains', 'YOUTUBE', 'set_category', 'cat_entertainment_streaming'),
  ('rule_tv2', 'TV 2 → Streaming', 10, 1, 'description', 'contains', 'TV 2', 'set_category', 'cat_entertainment_streaming'),
  ('rule_nrk', 'NRK → Streaming', 10, 1, 'description', 'contains', 'NRK', 'set_category', 'cat_entertainment_streaming'),

-- Apps & Games
  ('rule_google_play', 'GOOGLE PLAY → Apps', 10, 1, 'description', 'contains', 'Google Play', 'set_category', 'cat_entertainment_games'),
  ('rule_apple', 'APPLE → Apps', 10, 1, 'description', 'contains', 'APPLE.COM', 'set_category', 'cat_entertainment_games'),
  ('rule_app_store', 'APP STORE → Apps', 10, 1, 'description', 'contains', 'APP STORE', 'set_category', 'cat_entertainment_games'),
  ('rule_steam', 'STEAM → Spill', 10, 1, 'description', 'contains', 'STEAM', 'set_category', 'cat_entertainment_games'),
  ('rule_playstation', 'PLAYSTATION → Spill', 10, 1, 'description', 'contains', 'PLAYSTATION', 'set_category', 'cat_entertainment_games'),
  ('rule_xbox', 'XBOX → Spill', 10, 1, 'description', 'contains', 'XBOX', 'set_category', 'cat_entertainment_games'),

-- Fitness & Health
  ('rule_sats', 'SATS → Fitness', 10, 1, 'description', 'contains', 'SATS', 'set_category', 'cat_health_fitness'),
  ('rule_elixia', 'ELIXIA → Fitness', 10, 1, 'description', 'contains', 'ELIXIA', 'set_category', 'cat_health_fitness'),
  ('rule_evo', 'EVO FITNESS → Fitness', 10, 1, 'description', 'contains', 'EVO FITNESS', 'set_category', 'cat_health_fitness'),
  ('rule_apotek', 'APOTEK → Apotek', 10, 1, 'description', 'contains', 'APOTEK', 'set_category', 'cat_health_pharmacy'),
  ('rule_vitusapotek', 'VITUSAPOTEK → Apotek', 10, 1, 'description', 'contains', 'VITUSAPOTEK', 'set_category', 'cat_health_pharmacy'),
  ('rule_boots', 'BOOTS → Apotek', 10, 1, 'description', 'contains', 'BOOTS', 'set_category', 'cat_health_pharmacy'),

-- Regninger & Abonnement
  ('rule_telia', 'TELIA → Internett/Telefon', 10, 1, 'description', 'contains', 'TELIA', 'set_category', 'cat_bills_internet'),
  ('rule_telenor', 'TELENOR → Internett/Telefon', 10, 1, 'description', 'contains', 'TELENOR', 'set_category', 'cat_bills_internet'),
  ('rule_ice', 'ICE → Internett/Telefon', 10, 1, 'description', 'contains', 'ICE.NO', 'set_category', 'cat_bills_internet'),
  ('rule_altibox', 'ALTIBOX → Internett', 10, 1, 'description', 'contains', 'ALTIBOX', 'set_category', 'cat_bills_internet'),
  ('rule_get', 'GET → Internett', 10, 1, 'description', 'contains', 'GET ', 'set_category', 'cat_bills_internet'),
  ('rule_tibber', 'TIBBER → Strøm', 10, 1, 'description', 'contains', 'TIBBER', 'set_category', 'cat_bills_electricity'),
  ('rule_fjordkraft', 'FJORDKRAFT → Strøm', 10, 1, 'description', 'contains', 'FJORDKRAFT', 'set_category', 'cat_bills_electricity'),
  ('rule_hafslund', 'HAFSLUND → Strøm', 10, 1, 'description', 'contains', 'HAFSLUND', 'set_category', 'cat_bills_electricity'),
  ('rule_storebrand', 'STOREBRAND → Forsikring', 10, 1, 'description', 'contains', 'STOREBRAND', 'set_category', 'cat_bills_insurance'),
  ('rule_gjensidige', 'GJENSIDIGE → Forsikring', 10, 1, 'description', 'contains', 'GJENSIDIGE', 'set_category', 'cat_bills_insurance'),
  ('rule_if', 'IF FORSIKRING → Forsikring', 10, 1, 'description', 'contains', 'IF FORSIKRING', 'set_category', 'cat_bills_insurance'),
  ('rule_tryg', 'TRYG → Forsikring', 10, 1, 'description', 'contains', 'TRYG', 'set_category', 'cat_bills_insurance'),
  ('rule_frende', 'FRENDE → Forsikring', 10, 1, 'description', 'contains', 'FRENDE', 'set_category', 'cat_bills_insurance'),
  ('rule_rod_kors', 'RØDE KORS → Veldedighet', 10, 1, 'description', 'contains', 'RØDE KORS', 'set_category', 'cat_other'),
  ('rule_norges_rode_kors', 'NORGES RØDE KORS → Veldedighet', 10, 1, 'description', 'contains', 'Norges Røde Kors', 'set_category', 'cat_other'),

-- Tech & SaaS
  ('rule_anthropic', 'ANTHROPIC → Tech/SaaS', 10, 1, 'description', 'contains', 'ANTHROPIC', 'set_category', 'cat_shopping_electronics'),
  ('rule_claude', 'CLAUDE.AI → Tech/SaaS', 10, 1, 'description', 'contains', 'CLAUDE.AI', 'set_category', 'cat_shopping_electronics'),
  ('rule_openrouter', 'OPENROUTER → Tech/SaaS', 10, 1, 'description', 'contains', 'OPENROUTER', 'set_category', 'cat_shopping_electronics'),
  ('rule_replit', 'REPLIT → Tech/SaaS', 10, 1, 'description', 'contains', 'REPLIT', 'set_category', 'cat_shopping_electronics'),
  ('rule_lovable', 'LOVABLE → Tech/SaaS', 10, 1, 'description', 'contains', 'LOVABLE', 'set_category', 'cat_shopping_electronics'),
  ('rule_cloudflare', 'CLOUDFLARE → Tech/SaaS', 10, 1, 'description', 'contains', 'CLOUDFLARE', 'set_category', 'cat_shopping_electronics'),
  ('rule_github', 'GITHUB → Tech/SaaS', 10, 1, 'description', 'contains', 'GITHUB', 'set_category', 'cat_shopping_electronics'),
  ('rule_paypal', 'PAYPAL → Digital betaling', 15, 1, 'description', 'contains', 'PAYPAL', 'set_category', 'cat_other'),

-- Shopping
  ('rule_hm', 'H&M → Klær', 10, 1, 'description', 'contains', 'H&M', 'set_category', 'cat_shopping_clothing'),
  ('rule_zara', 'ZARA → Klær', 10, 1, 'description', 'contains', 'ZARA', 'set_category', 'cat_shopping_clothing'),
  ('rule_cubus', 'CUBUS → Klær', 10, 1, 'description', 'contains', 'CUBUS', 'set_category', 'cat_shopping_clothing'),
  ('rule_dressmann', 'DRESSMANN → Klær', 10, 1, 'description', 'contains', 'DRESSMANN', 'set_category', 'cat_shopping_clothing'),
  ('rule_ikea', 'IKEA → Hjem', 10, 1, 'description', 'contains', 'IKEA', 'set_category', 'cat_shopping_home'),
  ('rule_jysk', 'JYSK → Hjem', 10, 1, 'description', 'contains', 'JYSK', 'set_category', 'cat_shopping_home'),
  ('rule_elkjop', 'ELKJØP → Elektronikk', 10, 1, 'description', 'contains', 'ELKJØP', 'set_category', 'cat_shopping_electronics'),
  ('rule_power', 'POWER → Elektronikk', 10, 1, 'description', 'contains', 'POWER', 'set_category', 'cat_shopping_electronics'),
  ('rule_komplett', 'KOMPLETT → Elektronikk', 10, 1, 'description', 'contains', 'KOMPLETT', 'set_category', 'cat_shopping_electronics'),

-- Travel
  ('rule_sas', 'SAS → Fly', 10, 1, 'description', 'contains', 'SCANDINAVIAN AIRLINES', 'set_category', 'cat_travel_flights'),
  ('rule_norwegian', 'NORWEGIAN → Fly', 10, 1, 'description', 'contains', 'NORWEGIAN', 'set_category', 'cat_travel_flights'),
  ('rule_wideroe', 'WIDERØE → Fly', 10, 1, 'description', 'contains', 'WIDERØE', 'set_category', 'cat_travel_flights'),
  ('rule_airbnb', 'AIRBNB → Overnatting', 10, 1, 'description', 'contains', 'AIRBNB', 'set_category', 'cat_travel_lodging'),
  ('rule_booking', 'BOOKING.COM → Overnatting', 10, 1, 'description', 'contains', 'BOOKING.COM', 'set_category', 'cat_travel_lodging'),
  ('rule_hotels', 'HOTELS.COM → Overnatting', 10, 1, 'description', 'contains', 'HOTELS.COM', 'set_category', 'cat_travel_lodging'),
  ('rule_quality_hotel', 'QUALITY HOTEL → Overnatting', 10, 1, 'description', 'contains', 'QUALITY', 'set_category', 'cat_travel_lodging'),
  ('rule_scandic', 'SCANDIC → Overnatting', 10, 1, 'description', 'contains', 'SCANDIC', 'set_category', 'cat_travel_lodging'),
  ('rule_thon', 'THON HOTEL → Overnatting', 10, 1, 'description', 'contains', 'THON HOTEL', 'set_category', 'cat_travel_lodging'),

-- Investments & Transfers (typically excluded)
  ('rule_kron', 'Kron → Investering', 10, 1, 'description', 'contains', 'Kjøp Kron', 'set_category', 'cat_transfer'),
  ('rule_nordnet', 'NORDNET → Investering', 10, 1, 'description', 'contains', 'NORDNET', 'set_category', 'cat_transfer'),
  ('rule_dnb_invest', 'DNB INVEST → Investering', 10, 1, 'description', 'contains', 'DNB INVEST', 'set_category', 'cat_transfer');

