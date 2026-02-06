// Source types
export const SOURCE_TYPES = ['xlsx', 'pdf', 'manual'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

// Transaction status
export const TRANSACTION_STATUSES = ['pending', 'booked'] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

// Explicit flow classification (source of truth; do not infer from amount sign alone)
export const FLOW_TYPES = ['unknown', 'expense', 'income', 'transfer'] as const;
export type FlowType = (typeof FLOW_TYPES)[number];

// Category rule match types (legacy - for old category_rules table)
export const MATCH_TYPES = ['exact', 'contains', 'regex'] as const;
export type MatchType = (typeof MATCH_TYPES)[number];

// Rule match fields
export const RULE_MATCH_FIELDS = ['description', 'merchant', 'amount', 'source_type', 'status'] as const;
export type RuleMatchField = (typeof RULE_MATCH_FIELDS)[number];

// Rule match types (new comprehensive)
export const RULE_MATCH_TYPES = [
  'contains',
  'starts_with',
  'ends_with',
  'exact',
  'regex',
  'greater_than',
  'less_than',
  'between',
] as const;
export type RuleMatchType = (typeof RULE_MATCH_TYPES)[number];

// Rule action types
export const RULE_ACTION_TYPES = [
  'set_category',
  'add_tag',
  'set_merchant',
  'set_notes',
  'mark_recurring',
] as const;
export type RuleActionType = (typeof RULE_ACTION_TYPES)[number];

// Budget period types
export const BUDGET_PERIOD_TYPES = ['monthly', 'weekly', 'yearly', 'custom'] as const;
export type BudgetPeriodType = (typeof BUDGET_PERIOD_TYPES)[number];

// Recurring cadence types
export const RECURRING_CADENCES = ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'] as const;
export type RecurringCadence = (typeof RECURRING_CADENCES)[number];

// PDF section markers (Norwegian bank statements)
export const PDF_SECTION_PENDING = 'Reservasjoner';
export const PDF_SECTION_BOOKED = 'Kontobevegelser';

// XLSX column names (Norwegian credit card exports)
export const XLSX_COLUMNS = {
  DATE: 'Dato',
  BOOKED_DATE: 'Bokført',
  DESCRIPTION: 'Spesifikasjon',
  LOCATION: 'Sted',
  CURRENCY: 'Valuta',
  FOREIGN_AMOUNT: 'Utl. beløp',
  AMOUNT: 'Beløp',
} as const;

// Default pagination
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 500;

// Canonical IDs for seeded categories (keeps frontend/backend from hardcoding magic strings)
export const CATEGORY_IDS = {
  groceries: 'cat_food_groceries',
  transfers: 'cat_transfer',
  income: 'cat_income',
} as const;
