-- Seed Data for Expense Analytics
-- Generated: 2026-01-06T09:58:55.335Z

-- Clear existing demo data
DELETE FROM transaction_tags;
DELETE FROM transaction_meta;
DELETE FROM budget_items;
DELETE FROM budgets;
DELETE FROM transaction_splits;
DELETE FROM rules;
DELETE FROM tags;
DELETE FROM merchants;
-- Keep default categories, just clear transactions
DELETE FROM transactions WHERE source_file_hash LIKE 'demo-file-%';

-- Using existing categories from migration
-- Tags
INSERT INTO tags (id, name, color, created_at) VALUES ('d96b7044-116a-44b4-9ff3-071dc38a3121', 'Subscription', '#6366f1', '2026-01-06T09:58:55.335Z');
INSERT INTO tags (id, name, color, created_at) VALUES ('84f51b22-6496-41f7-b416-6860e850fa29', 'Recurring', '#f59e0b', '2026-01-06T09:58:55.335Z');
INSERT INTO tags (id, name, color, created_at) VALUES ('25f2596f-c4e3-4d8e-843a-07e5509bd611', 'One-time', '#64748b', '2026-01-06T09:58:55.335Z');
INSERT INTO tags (id, name, color, created_at) VALUES ('506d2ce0-28f7-41a6-9fa8-dc6912f2017e', 'Business', '#0ea5e9', '2026-01-06T09:58:55.335Z');
INSERT INTO tags (id, name, color, created_at) VALUES ('922a6ca7-d5f2-471f-99b8-b90c14ae748f', 'Personal', '#d946ef', '2026-01-06T09:58:55.335Z');

-- Rules
INSERT INTO rules (id, name, priority, enabled, match_field, match_type, match_value, match_value_secondary, action_type, action_value, created_at, updated_at) VALUES ('13a657ec-0c93-46fa-bb6c-26a1f994bc61', 'Netflix Subscription', 10, 1, 'description', 'contains', 'NETFLIX', NULL, 'set_category', 'cat_entertainment', '2026-01-06T09:58:55.335Z', '2026-01-06T09:58:55.335Z');
INSERT INTO rules (id, name, priority, enabled, match_field, match_type, match_value, match_value_secondary, action_type, action_value, created_at, updated_at) VALUES ('b5fb7140-a091-43b9-8ed9-2d468c53ab02', 'Spotify Subscription', 10, 1, 'description', 'contains', 'SPOTIFY', NULL, 'set_category', 'cat_entertainment', '2026-01-06T09:58:55.335Z', '2026-01-06T09:58:55.335Z');
INSERT INTO rules (id, name, priority, enabled, match_field, match_type, match_value, match_value_secondary, action_type, action_value, created_at, updated_at) VALUES ('79f94a29-bb2c-4b04-bb5b-4a03c99533dd', 'REMA 1000 Grocery', 20, 1, 'description', 'contains', 'REMA 1000', NULL, 'set_category', 'cat_food_groceries', '2026-01-06T09:58:55.335Z', '2026-01-06T09:58:55.335Z');
INSERT INTO rules (id, name, priority, enabled, match_field, match_type, match_value, match_value_secondary, action_type, action_value, created_at, updated_at) VALUES ('80c61968-3b72-4c14-9cbd-ae9cbec1566f', 'KIWI Grocery', 20, 1, 'description', 'contains', 'KIWI', NULL, 'set_category', 'cat_food_groceries', '2026-01-06T09:58:55.335Z', '2026-01-06T09:58:55.335Z');
INSERT INTO rules (id, name, priority, enabled, match_field, match_type, match_value, match_value_secondary, action_type, action_value, created_at, updated_at) VALUES ('72cf5d74-d89d-4379-9878-33035f5ad1be', 'Public Transport', 30, 1, 'description', 'contains', 'RUTER', NULL, 'set_category', 'cat_transport', '2026-01-06T09:58:55.335Z', '2026-01-06T09:58:55.335Z');

-- Transactions
INSERT INTO transactions (id, tx_hash, tx_date, booked_date, description, merchant, amount, currency, status, source_type, source_file_hash, raw_json, created_at) VALUES ('aae2c075-6647-4f4e-93e2-ed4c11dea35e', 'tx-1767693535334-0-qn4ccsfe2', '2025-07-24', '2025-07-24', 'KIWI GRØNLAND', 'Kiwi', -420.29, 'NOK', 'booked', 'pdf', 'demo-file-1767693535333', '{"original":"KIWI GRØNLAND","amount":-420.29}', '2026-01-06T09:58:55.335Z');
INSERT INTO transaction_meta (transaction_id, category_id, merchant_id, notes, is_recurring, updated_at) VALUES ('aae2c075-6647-4f4e-93e2-ed4c11dea35e', 'cat_food_groceries', NULL, NULL, 0, '2026-01-06T09:58:55.335Z');
INSERT INTO transactions (id, tx_hash, tx_date, booked_date, description, merchant, amount, currency, status, source_type, source_file_hash, raw_json, created_at) VALUES ('7e2a32d1-914e-43a3-8941-ee106a7af0cd', 'tx-1767693535334-1-k31jg59lf', '2025-07-22', '2025-07-22', 'MCDONALDS', 'McDonalds', -123.01, 'NOK', 'booked', 'xlsx', 'demo-file-1767693535333', '{"original":"MCDONALDS","amount":-123.01}', '2026-01-06T09:58:55.335Z');
INSERT INTO transaction_meta (transaction_id, category_id, merchant_id, notes, is_recurring, updated_at) VALUES ('7e2a32d1-914e-43a3-8941-ee106a7af0cd', 'cat_food_restaurants', NULL, NULL, 0, '2026-01-06T09:58:55.335Z');
INSERT INTO transactions (id, tx_hash, tx_date, booked_date, description, merchant, amount, currency, status, source_type, source_file_hash, raw_json, created_at) VALUES ('39a63d8e-97c4-4b1b-8af2-35691a7f78f1', 'tx-1767693535334-2-133nnv72f', '2025-11-13', '2025-11-13', 'NETFLIX.COM', 'Netflix', -140, 'NOK', 'booked', 'xlsx', 'demo-file-1767693535333', '{"original":"NETFLIX.COM","amount":-140}', '2026-01-06T09:58:55.335Z');
INSERT INTO transaction_meta (transaction_id, category_id, merchant_id, notes, is_recurring, updated_at) VALUES ('39a63d8e-97c4-4b1b-8af2-35691a7f78f1', 'cat_entertainment', NULL, NULL, 1, '2026-01-06T09:58:55.335Z');
INSERT INTO transactions (id, tx_hash, tx_date, booked_date, description, merchant, amount, currency, status, source_type, source_file_hash, raw_json, created_at) VALUES ('913ef943-0e1f-4a05-89f6-560bfcec5dc7', 'tx-1767693535334-3-cawyipv2c', '2025-11-21', '2025-11-21', 'MCDONALDS', 'McDonalds', -188.95, 'NOK', 'booked', 'pdf', 'demo-file-1767693535333', '{"original":"MCDONALDS","amount":-188.95}', '2026-01-06T09:58:55.335Z');
INSERT INTO transaction_meta (transaction_id, category_id, merchant_id, notes, is_recurring, updated_at) VALUES ('913ef943-0e1f-4a05-89f6-560bfcec5dc7', 'cat_food_restaurants', NULL, NULL, 0, '2026-01-06T09:58:55.335Z');
INSERT INTO transactions (id, tx_hash, tx_date, booked_date, description, merchant, amount, currency, status, source_type, source_file_hash, raw_json, created_at) VALUES ('864b9a66-c8cf-4b19-ba32-c9f9714da181', 'tx-1767693535334-4-1rgmwfuna', '2025-12-17', '2025-12-17', 'MENY SENTRUM', 'Meny', -770.82, 'NOK', 'booked', 'xlsx', 'demo-file-1767693535333', '{"original":"MENY SENTRUM","amount":-770.82}', '2026-01-06T09:58:55.335Z');
