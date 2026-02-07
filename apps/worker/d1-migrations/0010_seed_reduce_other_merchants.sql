-- Seed additional high-confidence rules to shrink "Other".
-- Safe to run multiple times (INSERT OR IGNORE).

-- New categories (optional)
INSERT OR IGNORE INTO categories (id, name, parent_id, color, icon, sort_order, is_transfer) VALUES
  ('cat_food_alcohol', 'Alcohol', 'cat_food', '#fb7185', 'wine', 4, 0),
  ('cat_finance', 'Finance', NULL, '#a855f7', 'bank', 11, 0),
  ('cat_finance_investments', 'Investments', 'cat_finance', '#c084fc', 'trending-up', 1, 0);

-- Rules (match on description; backend matches against LOWER(merchant + ' ' + description) for consistency)
INSERT OR IGNORE INTO rules (
  id, name, priority, enabled, match_field, match_type, match_value, match_value_secondary,
  action_type, action_value, created_at, updated_at
) VALUES
  -- Alcohol
  ('rule_more_vinmonopolet', 'Alcohol: VINMONOPOLET', 70, 1, 'description', 'contains', 'VINMONOPOLET', NULL, 'set_category', 'cat_food_alcohol', datetime('now'), datetime('now')),

  -- Restaurants / coffee
  ('rule_more_peppes', 'Restaurants: PEPPES', 75, 1, 'description', 'contains', 'PEPPES', NULL, 'set_category', 'cat_food_restaurants', datetime('now'), datetime('now')),
  ('rule_more_egon', 'Restaurants: EGON', 75, 1, 'description', 'contains', 'EGON', NULL, 'set_category', 'cat_food_restaurants', datetime('now'), datetime('now')),
  ('rule_more_bighorn', 'Restaurants: BIG HORN', 75, 1, 'description', 'contains', 'BIG HORN', NULL, 'set_category', 'cat_food_restaurants', datetime('now'), datetime('now')),
  ('rule_more_gastropub', 'Restaurants: GASTROPUB', 80, 1, 'description', 'contains', 'GASTROPUB', NULL, 'set_category', 'cat_food_restaurants', datetime('now'), datetime('now')),
  ('rule_more_buns', 'Restaurants: BUNS', 85, 1, 'description', 'contains', 'BUNS', NULL, 'set_category', 'cat_food_restaurants', datetime('now'), datetime('now')),
  ('rule_more_wrightcorner', 'Coffee: WRIGHT CORNER', 80, 1, 'description', 'contains', 'WRIGHT CORNER', NULL, 'set_category', 'cat_food_coffee', datetime('now'), datetime('now')),
  ('rule_more_espos', 'Coffee: ESPOS', 85, 1, 'description', 'contains', 'ESPOS', NULL, 'set_category', 'cat_food_coffee', datetime('now'), datetime('now')),

  -- Health
  ('rule_more_vitusapotek', 'Pharmacy: VITUSAPOTEK', 80, 1, 'description', 'contains', 'VITUSAPOTEK', NULL, 'set_category', 'cat_health_pharmacy', datetime('now'), datetime('now')),
  ('rule_more_farmasiet', 'Pharmacy: FARMASIET', 80, 1, 'description', 'contains', 'FARMASIET', NULL, 'set_category', 'cat_health_pharmacy', datetime('now'), datetime('now')),

  -- Shopping
  ('rule_more_dutyfree', 'Shopping: DUTY-FREE', 85, 1, 'description', 'contains', 'DUTY-FREE', NULL, 'set_category', 'cat_shopping', datetime('now'), datetime('now')),
  ('rule_more_power', 'Electronics: POWER.NO', 85, 1, 'description', 'contains', 'POWER.NO', NULL, 'set_category', 'cat_shopping_electronics', datetime('now'), datetime('now')),
  ('rule_more_shoeday', 'Clothing: SHOEDAY', 85, 1, 'description', 'contains', 'SHOEDAY', NULL, 'set_category', 'cat_shopping_clothing', datetime('now'), datetime('now')),
  ('rule_more_morris', 'Clothing: MORRIS', 85, 1, 'description', 'contains', 'MORRIS', NULL, 'set_category', 'cat_shopping_clothing', datetime('now'), datetime('now')),
  ('rule_more_hm', 'Clothing: H&M', 90, 1, 'description', 'contains', 'H&M', NULL, 'set_category', 'cat_shopping_clothing', datetime('now'), datetime('now')),
  ('rule_more_hm_no', 'Clothing: HM NO', 95, 1, 'description', 'contains', 'HM NO', NULL, 'set_category', 'cat_shopping_clothing', datetime('now'), datetime('now')),

  -- Events (festivals)
  ('rule_more_bukta', 'Events: BUKTA', 85, 1, 'description', 'contains', 'BUKTA', NULL, 'set_category', 'cat_entertainment_events', datetime('now'), datetime('now')),

  -- Investments / finance outflows (keep as explicit category, not "Other")
  ('rule_more_robinhood', 'Investments: ROBINHOOD', 80, 1, 'description', 'contains', 'ROBINHOOD', NULL, 'set_category', 'cat_finance_investments', datetime('now'), datetime('now')),
  ('rule_more_hfinance', 'Investments: HFINANCE', 80, 1, 'description', 'contains', 'HFINANCE', NULL, 'set_category', 'cat_finance_investments', datetime('now'), datetime('now')),

  -- Generic autopay (low priority; allows more specific "Avtalegiro til TELIA" etc. to win)
  ('rule_more_avtalegiro_generic', 'Bills: AVTALEGIRO (generic)', 220, 1, 'description', 'contains', 'Avtalegiro til', NULL, 'set_category', 'cat_bills', datetime('now'), datetime('now'));

