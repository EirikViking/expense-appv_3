-- Merge Restaurants into Food & Dining to reduce category fragmentation.
-- Source: cat_food_restaurants
-- Target: cat_food
--
-- Also updates rules/budgets/recurring/splits/meta to avoid dangling references.

PRAGMA foreign_keys = ON;

-- 1) Transaction metadata
UPDATE transaction_meta
SET category_id = 'cat_food'
WHERE category_id = 'cat_food_restaurants';

-- 2) Splits
UPDATE transaction_splits
SET category_id = 'cat_food'
WHERE category_id = 'cat_food_restaurants';

-- 3) Recurring and budgets
UPDATE recurring
SET category_id = 'cat_food'
WHERE category_id = 'cat_food_restaurants';

UPDATE budget_items
SET category_id = 'cat_food'
WHERE category_id = 'cat_food_restaurants';

-- 4) Rules that previously targeted Restaurants
UPDATE rules
SET action_value = 'cat_food', updated_at = datetime('now')
WHERE action_type = 'set_category'
  AND action_value = 'cat_food_restaurants';

-- 5) Remove the redundant category
DELETE FROM categories
WHERE id = 'cat_food_restaurants';

