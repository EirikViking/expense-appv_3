-- Round 2: more high-confidence rules to shrink "Other" based on prod diagnostics.
-- Safe to run multiple times (INSERT OR IGNORE).

-- Categories
INSERT OR IGNORE INTO categories (id, name, parent_id, color, icon, sort_order, is_transfer) VALUES
  ('cat_bills_memberships', 'Memberships & Fees', 'cat_bills', '#fcd34d', 'badge', 5, 0),
  ('cat_other_p2p', 'P2P / Vipps', 'cat_other', '#9ca3af', 'users', 50, 0),
  ('cat_home_services', 'Home Services', 'cat_shopping_home', '#ddd6fe', 'sparkles', 4, 0);

-- Rules (match on description; backend matches against LOWER(merchant + ' ' + description) for consistency)
INSERT OR IGNORE INTO rules (
  id, name, priority, enabled, match_field, match_type, match_value, match_value_secondary,
  action_type, action_value, created_at, updated_at
) VALUES
  -- Food (restaurants)
  ('rule_more_favrit', 'Restaurants: FAVRIT', 85, 1, 'description', 'contains', 'FAVRIT', NULL, 'set_category', 'cat_food_restaurants', datetime('now'), datetime('now')),
  ('rule_more_tiffinwala', 'Restaurants: TIFFINWALA', 85, 1, 'description', 'contains', 'TIFFINWALA', NULL, 'set_category', 'cat_food_restaurants', datetime('now'), datetime('now')),
  ('rule_more_jensens', 'Restaurants: JENSENS', 85, 1, 'description', 'contains', 'JENSENS', NULL, 'set_category', 'cat_food_restaurants', datetime('now'), datetime('now')),
  ('rule_more_seaport_restaurant', 'Restaurants: SEAPORT RESTAURANT', 85, 1, 'description', 'contains', 'SEAPORT RESTAURANT', NULL, 'set_category', 'cat_food_restaurants', datetime('now'), datetime('now')),
  ('rule_more_restaurante', 'Restaurants: RESTAURANTE', 95, 1, 'description', 'contains', 'RESTAURANTE', NULL, 'set_category', 'cat_food_restaurants', datetime('now'), datetime('now')),
  ('rule_more_maskomo', 'Restaurants: MASKOMO', 90, 1, 'description', 'contains', 'MASKOMO', NULL, 'set_category', 'cat_food_restaurants', datetime('now'), datetime('now')),

  -- Health (medical)
  ('rule_more_dr_dropin', 'Health: DR DROPIN', 80, 1, 'description', 'contains', 'DR DROPIN', NULL, 'set_category', 'cat_health_medical', datetime('now'), datetime('now')),

  -- Home services
  ('rule_more_vaskehjelp', 'Home Services: VASKEHJELP', 90, 1, 'description', 'contains', 'VASKEHJELP', NULL, 'set_category', 'cat_home_services', datetime('now'), datetime('now')),

  -- Klarna merchants (specific, not generic Klarna)
  ('rule_more_klarna_lenson', 'Shopping: LENSON (Klarna)', 95, 1, 'description', 'contains', 'LENSON', NULL, 'set_category', 'cat_shopping_clothing', datetime('now'), datetime('now')),
  ('rule_more_klarna_ikventilasjon', 'Home & Garden: IKVENTILASJON (Klarna)', 95, 1, 'description', 'contains', 'IKVENTILASJON', NULL, 'set_category', 'cat_shopping_home', datetime('now'), datetime('now')),

  -- Memberships/fees
  ('rule_more_arskontingent', 'Memberships: ÅRSKONTINGENT', 90, 1, 'description', 'contains', 'ÅRSKONTINGENT', NULL, 'set_category', 'cat_bills_memberships', datetime('now'), datetime('now')),
  ('rule_more_kontingent', 'Memberships: KONTINGENT', 95, 1, 'description', 'contains', 'KONTINGENT', NULL, 'set_category', 'cat_bills_memberships', datetime('now'), datetime('now')),

  -- P2P / Vipps generic (low priority so merchant-specific rules win, e.g. Los Tacos via Vipps)
  ('rule_more_vipps_generic', 'P2P: VIPPS (generic)', 240, 1, 'description', 'contains', 'Vipps*', NULL, 'set_category', 'cat_other_p2p', datetime('now'), datetime('now'));

