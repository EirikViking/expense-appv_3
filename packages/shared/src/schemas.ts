import { z } from 'zod';
import {
  SOURCE_TYPES,
  TRANSACTION_STATUSES,
  RULE_MATCH_FIELDS,
  RULE_MATCH_TYPES,
  RULE_ACTION_TYPES,
  BUDGET_PERIOD_TYPES,
  RECURRING_CADENCES,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from './constants';

// ============================================
// Common schemas
// ============================================

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be hex format #RRGGBB').nullable().optional();
const idSchema = z.string().min(1);

// ============================================
// Auth schemas
// ============================================

export const loginRequestSchema = z.object({
  password: z.string().min(1),
});

// ============================================
// Ingest schemas (keep original for backward compatibility)
// ============================================

export const xlsxTransactionSchema = z.object({
  tx_date: dateSchema,
  booked_date: dateSchema.optional(),
  description: z.string().min(1),
  merchant: z.string().optional(),
  amount: z.number(),
  currency: z.string().default('NOK'),
  raw_json: z.string(),
});

export const xlsxIngestRequestSchema = z.object({
  file_hash: z.string().length(64, 'file_hash must be 64 character hex string'),
  filename: z.string().min(1),
  source: z.literal('xlsx'),
  transactions: z.array(xlsxTransactionSchema).min(1, 'No valid transactions found in XLSX file'),
});

export const pdfIngestRequestSchema = z.object({
  file_hash: z.string().length(64, 'file_hash must be 64 character hex string'),
  filename: z.string().min(1),
  source: z.literal('pdf'),
  extracted_text: z.string().min(1, 'PDF text extraction failed or returned empty content'),
});

// ============================================
// Category schemas
// ============================================

export const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  parent_id: idSchema.nullable().optional(),
  color: hexColorSchema,
  icon: z.string().max(50).nullable().optional(),
  sort_order: z.number().int().min(0).default(0),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  parent_id: idSchema.nullable().optional(),
  color: hexColorSchema,
  icon: z.string().max(50).nullable().optional(),
  sort_order: z.number().int().min(0).optional(),
});

// ============================================
// Tag schemas
// ============================================

export const createTagSchema = z.object({
  name: z.string().min(1).max(50),
  color: hexColorSchema,
});

export const updateTagSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: hexColorSchema,
});

// ============================================
// Merchant schemas
// ============================================

export const createMerchantSchema = z.object({
  canonical_name: z.string().min(1).max(200),
  patterns: z.array(z.string()).default([]),
  website: z.string().url().nullable().optional(),
});

export const updateMerchantSchema = z.object({
  canonical_name: z.string().min(1).max(200).optional(),
  patterns: z.array(z.string()).optional(),
  website: z.string().url().nullable().optional(),
});

// ============================================
// Rule schemas
// ============================================

export const createRuleSchema = z.object({
  name: z.string().min(1).max(100),
  priority: z.number().int().min(1).max(10000).default(100),
  enabled: z.boolean().default(true),
  match_field: z.enum(RULE_MATCH_FIELDS),
  match_type: z.enum(RULE_MATCH_TYPES),
  match_value: z.string().min(1).max(500),
  match_value_secondary: z.string().max(500).nullable().optional(),
  action_type: z.enum(RULE_ACTION_TYPES),
  action_value: z.string().min(1).max(500),
});

export const updateRuleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  priority: z.number().int().min(1).max(10000).optional(),
  enabled: z.boolean().optional(),
  match_field: z.enum(RULE_MATCH_FIELDS).optional(),
  match_type: z.enum(RULE_MATCH_TYPES).optional(),
  match_value: z.string().min(1).max(500).optional(),
  match_value_secondary: z.string().max(500).nullable().optional(),
  action_type: z.enum(RULE_ACTION_TYPES).optional(),
  action_value: z.string().min(1).max(500).optional(),
});

export const applyRulesSchema = z.object({
  transaction_ids: z.array(idSchema).optional(),
  all: z.boolean().optional(),
  batch_size: z.number().int().min(1).max(1000).default(100),
}).refine(
  (data) => data.transaction_ids !== undefined || data.all === true,
  { message: 'Either transaction_ids or all=true must be provided' }
);

// ============================================
// Transaction meta schemas
// ============================================

export const updateTransactionMetaSchema = z.object({
  category_id: idSchema.nullable().optional(),
  merchant_id: idSchema.nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  tag_ids: z.array(idSchema).optional(),
});

export const createSplitSchema = z.object({
  splits: z.array(z.object({
    amount: z.number(),
    category_id: idSchema.nullable().optional(),
    description: z.string().max(500).nullable().optional(),
  })).min(2, 'At least 2 splits required'),
});

// ============================================
// Budget schemas
// ============================================

export const createBudgetSchema = z.object({
  name: z.string().min(1).max(100),
  amount: z.number().positive(),
  period: z.enum(BUDGET_PERIOD_TYPES),
  category_id: idSchema.optional(),
  start_date: dateSchema.optional(),
  end_date: dateSchema.optional(),
});

export const updateBudgetSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  amount: z.number().positive().optional(),
  period: z.enum(BUDGET_PERIOD_TYPES).optional(),
  category_id: idSchema.nullable().optional(),
  start_date: dateSchema.nullable().optional(),
  end_date: dateSchema.nullable().optional(),
});

// ============================================
// Recurring schemas
// ============================================

export const createRecurringSchema = z.object({
  name: z.string().min(1).max(200),
  merchant_id: idSchema.nullable().optional(),
  category_id: idSchema.nullable().optional(),
  amount_expected: z.number().nullable().optional(),
  amount_min: z.number().nullable().optional(),
  amount_max: z.number().nullable().optional(),
  cadence: z.enum(RECURRING_CADENCES),
  day_of_month: z.number().int().min(1).max(31).nullable().optional(),
  is_subscription: z.boolean().default(false),
});

export const updateRecurringSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  merchant_id: idSchema.nullable().optional(),
  category_id: idSchema.nullable().optional(),
  amount_expected: z.number().nullable().optional(),
  amount_min: z.number().nullable().optional(),
  amount_max: z.number().nullable().optional(),
  cadence: z.enum(RECURRING_CADENCES).optional(),
  day_of_month: z.number().int().min(1).max(31).nullable().optional(),
  is_active: z.boolean().optional(),
  is_subscription: z.boolean().optional(),
});

// ============================================
// Query schemas
// ============================================

export const transactionsQuerySchema = z.object({
  date_from: dateSchema.optional(),
  date_to: dateSchema.optional(),
  status: z.enum(TRANSACTION_STATUSES).optional(),
  source_type: z.enum(SOURCE_TYPES).optional(),
  category_id: idSchema.optional(),
  tag_id: idSchema.optional(),
  merchant_id: idSchema.optional(),
  merchant_name: z.string().max(200).optional(),
  min_amount: z.coerce.number().optional(),
  max_amount: z.coerce.number().optional(),
  search: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
  sort_by: z.enum(['date', 'amount', 'description']).default('date'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export const analyticsQuerySchema = z.object({
  date_from: dateSchema,
  date_to: dateSchema,
  status: z.enum(TRANSACTION_STATUSES).optional(),
  source_type: z.enum(SOURCE_TYPES).optional(),
  category_id: idSchema.optional(),
  tag_id: idSchema.optional(),
  merchant_id: idSchema.optional(),
  granularity: z.enum(['day', 'week', 'month']).default('day'),
});

export const compareQuerySchema = z.object({
  current_start: dateSchema,
  current_end: dateSchema,
  previous_start: dateSchema,
  previous_end: dateSchema,
});

// ============================================
// Response schemas
// ============================================

export const ingestResponseSchema = z.object({
  inserted: z.number(),
  skipped_duplicates: z.number(),
  skipped_invalid: z.number(),
  file_duplicate: z.boolean(),
});

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  timestamp: z.string(),
});

export const errorResponseSchema = z.object({
  error: z.string(),
  details: z.string().optional(),
});

export const applyRulesResponseSchema = z.object({
  processed: z.number(),
  updated: z.number(),
  errors: z.number(),
});
