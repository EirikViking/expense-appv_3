/**
 * Seed Data Script
 *
 * Generates demo data for local testing.
 * Run with: pnpm tsx scripts/seed-data.ts
 *
 * This script generates:
 * - Categories with hierarchy
 * - Tags
 * - Rules for auto-categorization
 * - Demo transactions
 */

import { generateId } from '../packages/shared/src/index';

// Generate a random date within the last N months
function randomDate(monthsBack: number): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  const end = now;
  const date = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  return date.toISOString().split('T')[0];
}

// Generate a random amount within range
function randomAmount(min: number, max: number): number {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

// Use existing category IDs from migration 002_analytics.sql
const categoryIds: Record<string, string> = {
  'Groceries': 'cat_food_groceries',
  'Dining Out': 'cat_food_restaurants',
  'Entertainment': 'cat_entertainment',
  'Transportation': 'cat_transport',
  'Shopping': 'cat_shopping',
  'Bills & Utilities': 'cat_bills',
  'Health': 'cat_health',
  'Income': 'cat_income',
};

// Demo tags
const tags = [
  { id: generateId(), name: 'Subscription', color: '#6366f1' },
  { id: generateId(), name: 'Recurring', color: '#f59e0b' },
  { id: generateId(), name: 'One-time', color: '#64748b' },
  { id: generateId(), name: 'Business', color: '#0ea5e9' },
  { id: generateId(), name: 'Personal', color: '#d946ef' },
];

// Find category by name
const getCategoryId = (name: string) => categoryIds[name] || null;
const getTagId = (name: string) => tags.find(t => t.name === name)?.id;

// Demo rules for auto-categorization
const rules = [
  {
    id: generateId(),
    name: 'Netflix Subscription',
    priority: 10,
    enabled: true,
    match_field: 'description',
    match_type: 'contains',
    match_value: 'NETFLIX',
    match_value_secondary: null,
    action_type: 'set_category',
    action_value: getCategoryId('Entertainment'),
  },
  {
    id: generateId(),
    name: 'Spotify Subscription',
    priority: 10,
    enabled: true,
    match_field: 'description',
    match_type: 'contains',
    match_value: 'SPOTIFY',
    match_value_secondary: null,
    action_type: 'set_category',
    action_value: getCategoryId('Entertainment'),
  },
  {
    id: generateId(),
    name: 'REMA 1000 Grocery',
    priority: 20,
    enabled: true,
    match_field: 'description',
    match_type: 'contains',
    match_value: 'REMA 1000',
    match_value_secondary: null,
    action_type: 'set_category',
    action_value: getCategoryId('Groceries'),
  },
  {
    id: generateId(),
    name: 'KIWI Grocery',
    priority: 20,
    enabled: true,
    match_field: 'description',
    match_type: 'contains',
    match_value: 'KIWI',
    match_value_secondary: null,
    action_type: 'set_category',
    action_value: getCategoryId('Groceries'),
  },
  {
    id: generateId(),
    name: 'Public Transport',
    priority: 30,
    enabled: true,
    match_field: 'description',
    match_type: 'contains',
    match_value: 'RUTER',
    match_value_secondary: null,
    action_type: 'set_category',
    action_value: getCategoryId('Transportation'),
  },
];

// Demo transactions based on Norwegian merchants
const transactionTemplates = [
  // Groceries
  { description: 'REMA 1000 OSLO', merchant: 'Rema 1000', category: 'Groceries', minAmount: -200, maxAmount: -1500 },
  { description: 'KIWI GRØNLAND', merchant: 'Kiwi', category: 'Groceries', minAmount: -100, maxAmount: -800 },
  { description: 'MENY SENTRUM', merchant: 'Meny', category: 'Groceries', minAmount: -300, maxAmount: -2000 },
  { description: 'COOP EXTRA', merchant: 'Coop Extra', category: 'Groceries', minAmount: -150, maxAmount: -1200 },

  // Entertainment
  { description: 'NETFLIX.COM', merchant: 'Netflix', category: 'Entertainment', minAmount: -129, maxAmount: -179, recurring: true },
  { description: 'SPOTIFY AB', merchant: 'Spotify', category: 'Entertainment', minAmount: -79, maxAmount: -129, recurring: true },
  { description: 'HBO MAX', merchant: 'HBO Max', category: 'Entertainment', minAmount: -89, maxAmount: -149, recurring: true },
  { description: 'KINO SAGA', merchant: 'Kino Saga', category: 'Entertainment', minAmount: -150, maxAmount: -400 },

  // Dining Out
  { description: 'STARBUCKS OSLO', merchant: 'Starbucks', category: 'Dining Out', minAmount: -60, maxAmount: -150 },
  { description: 'ESPRESSO HOUSE', merchant: 'Espresso House', category: 'Dining Out', minAmount: -50, maxAmount: -120 },
  { description: 'PEPPES PIZZA', merchant: 'Peppes Pizza', category: 'Dining Out', minAmount: -200, maxAmount: -600 },
  { description: 'MCDONALDS', merchant: 'McDonalds', category: 'Dining Out', minAmount: -80, maxAmount: -200 },

  // Transportation
  { description: 'RUTER BILLETT', merchant: 'Ruter', category: 'Transportation', minAmount: -39, maxAmount: -850, recurring: true },
  { description: 'CIRCLE K', merchant: 'Circle K', category: 'Transportation', minAmount: -300, maxAmount: -1200 },
  { description: 'VOI SCOOTER', merchant: 'Voi', category: 'Transportation', minAmount: -30, maxAmount: -80 },

  // Shopping
  { description: 'H&M OSLO', merchant: 'H&M', category: 'Shopping', minAmount: -200, maxAmount: -1500 },
  { description: 'IKEA SLEPENDEN', merchant: 'IKEA', category: 'Shopping', minAmount: -500, maxAmount: -5000 },
  { description: 'AMAZON', merchant: 'Amazon', category: 'Shopping', minAmount: -100, maxAmount: -2000 },
  { description: 'XXL SPORT', merchant: 'XXL', category: 'Shopping', minAmount: -300, maxAmount: -2500 },

  // Bills & Utilities
  { description: 'TELENOR MOBIL', merchant: 'Telenor', category: 'Bills & Utilities', minAmount: -399, maxAmount: -699, recurring: true },
  { description: 'HAFSLUND STROM', merchant: 'Hafslund', category: 'Bills & Utilities', minAmount: -500, maxAmount: -2500, recurring: true },
  { description: 'TELIA NORGE', merchant: 'Telia', category: 'Bills & Utilities', minAmount: -299, maxAmount: -599, recurring: true },

  // Health
  { description: 'APOTEK 1', merchant: 'Apotek 1', category: 'Health', minAmount: -50, maxAmount: -500 },
  { description: 'SATS TRENINGSSENTER', merchant: 'SATS', category: 'Health', minAmount: -399, maxAmount: -599, recurring: true },
  { description: 'COLOSSEUM KLINIKK', merchant: 'Colosseum', category: 'Health', minAmount: -500, maxAmount: -2000 },
];

// Generate demo transactions
function generateTransactions(count: number, monthsBack: number = 6): { transactions: any[], fileHash: string } {
  const transactions = [];
  const fileHash = `demo-file-${Date.now()}`;

  for (let i = 0; i < count; i++) {
    const template = transactionTemplates[Math.floor(Math.random() * transactionTemplates.length)];
    const txDate = randomDate(monthsBack);
    const amount = randomAmount(template.minAmount, template.maxAmount);
    const txHash = `tx-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`;

    transactions.push({
      id: generateId(),
      tx_hash: txHash,
      tx_date: txDate,
      booked_date: txDate,
      description: template.description,
      merchant: template.merchant,
      amount: amount,
      currency: 'NOK',
      status: 'booked',
      source_type: Math.random() > 0.3 ? 'xlsx' : 'pdf',
      source_file_hash: fileHash,
      raw_json: JSON.stringify({ original: template.description, amount }),
      category_id: getCategoryId(template.category),
      is_recurring: template.recurring || false,
    });
  }

  // Add some income transactions
  for (let i = 0; i < Math.floor(monthsBack * 1.5); i++) {
    const txDate = randomDate(monthsBack);
    const txHash = `tx-income-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`;

    transactions.push({
      id: generateId(),
      tx_hash: txHash,
      tx_date: txDate,
      booked_date: txDate,
      description: 'LØNN FRA ARBEIDSGIVER',
      merchant: 'Employer',
      amount: randomAmount(35000, 55000),
      currency: 'NOK',
      status: 'booked',
      source_type: 'pdf',
      source_file_hash: fileHash,
      raw_json: JSON.stringify({ original: 'LØNN', type: 'salary' }),
      category_id: getCategoryId('Income'),
      is_recurring: true,
    });
  }

  return { transactions, fileHash };
}

// Generate SQL statements for seeding
function generateSQL(): string {
  const { transactions, fileHash } = generateTransactions(200, 6);
  const now = new Date().toISOString();
  const lines: string[] = [];

  lines.push('-- Seed Data for Expense Analytics');
  lines.push('-- Generated: ' + now);
  lines.push('');

  // Clear existing data
  lines.push('-- Clear existing demo data');
  lines.push('DELETE FROM transaction_tags;');
  lines.push('DELETE FROM transaction_meta;');
  lines.push('DELETE FROM budget_items;');
  lines.push('DELETE FROM budgets;');
  lines.push('DELETE FROM transaction_splits;');
  lines.push('DELETE FROM rules;');
  lines.push('DELETE FROM tags;');
  lines.push('DELETE FROM merchants;');
  lines.push('-- Keep default categories, just clear demo data');
  lines.push("DELETE FROM transactions WHERE source_file_hash LIKE 'demo-file-%';");
  lines.push("DELETE FROM ingested_files WHERE file_hash LIKE 'demo-file-%';");
  lines.push('');

  // Categories are already seeded by migration 002_analytics.sql
  lines.push('-- Using existing categories from migration');
  lines.push('');

  // Insert demo ingested file (required for transaction foreign key)
  lines.push('-- Demo ingested file');
  lines.push(`INSERT INTO ingested_files (id, file_hash, source_type, original_filename, uploaded_at, metadata_json) VALUES ('${generateId()}', '${fileHash}', 'xlsx', 'demo-seed-data.xlsx', '${now}', '{"demo": true}');`);
  lines.push('');

  // Tags
  lines.push('-- Tags');
  for (const tag of tags) {
    lines.push(`INSERT INTO tags (id, name, color, created_at) VALUES ('${tag.id}', '${tag.name}', '${tag.color}', '${now}');`);
  }
  lines.push('');

  // Rules
  lines.push('-- Rules');
  for (const rule of rules) {
    lines.push(`INSERT INTO rules (id, name, priority, enabled, match_field, match_type, match_value, match_value_secondary, action_type, action_value, created_at, updated_at) VALUES ('${rule.id}', '${rule.name}', ${rule.priority}, 1, '${rule.match_field}', '${rule.match_type}', '${rule.match_value}', ${rule.match_value_secondary ? `'${rule.match_value_secondary}'` : 'NULL'}, '${rule.action_type}', '${rule.action_value}', '${now}', '${now}');`);
  }
  lines.push('');

  // Transactions and meta
  lines.push('-- Transactions');
  for (const tx of transactions) {
    const rawJson = tx.raw_json.replace(/'/g, "''");
    lines.push(`INSERT INTO transactions (id, tx_hash, tx_date, booked_date, description, merchant, amount, currency, status, source_type, source_file_hash, raw_json, created_at) VALUES ('${tx.id}', '${tx.tx_hash}', '${tx.tx_date}', '${tx.booked_date}', '${tx.description}', '${tx.merchant}', ${tx.amount}, '${tx.currency}', '${tx.status}', '${tx.source_type}', '${tx.source_file_hash}', '${rawJson}', '${now}');`);

    // Transaction meta
    if (tx.category_id || tx.is_recurring) {
      lines.push(`INSERT INTO transaction_meta (transaction_id, category_id, merchant_id, notes, is_recurring, updated_at) VALUES ('${tx.id}', ${tx.category_id ? `'${tx.category_id}'` : 'NULL'}, NULL, NULL, ${tx.is_recurring ? 1 : 0}, '${now}');`);
    }
  }
  lines.push('');

  // Demo budget
  const budgetId = generateId();
  const budgetStart = new Date().toISOString().slice(0, 7) + '-01'; // First of current month
  lines.push('-- Demo Budget');
  lines.push(`INSERT INTO budgets (id, name, period_type, start_date, end_date, is_active, created_at, updated_at) VALUES ('${budgetId}', 'Monthly Budget', 'monthly', '${budgetStart}', NULL, 1, '${now}', '${now}');`);

  // Budget items
  const groceryCatId = getCategoryId('Groceries');
  const diningCatId = getCategoryId('Dining Out');
  const entertainmentCatId = getCategoryId('Entertainment');

  if (groceryCatId) {
    lines.push(`INSERT INTO budget_items (id, budget_id, category_id, amount, created_at) VALUES ('${generateId()}', '${budgetId}', '${groceryCatId}', 5000, '${now}');`);
  }
  if (diningCatId) {
    lines.push(`INSERT INTO budget_items (id, budget_id, category_id, amount, created_at) VALUES ('${generateId()}', '${budgetId}', '${diningCatId}', 2000, '${now}');`);
  }
  if (entertainmentCatId) {
    lines.push(`INSERT INTO budget_items (id, budget_id, category_id, amount, created_at) VALUES ('${generateId()}', '${budgetId}', '${entertainmentCatId}', 1500, '${now}');`);
  }
  lines.push('');

  lines.push('-- Seed complete!');

  return lines.join('\n');
}

// Output SQL
console.log(generateSQL());
