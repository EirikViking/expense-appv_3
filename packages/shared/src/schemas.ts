import { z } from 'zod';
import { SOURCE_TYPES, TRANSACTION_STATUSES } from './constants';

// Login
export const loginRequestSchema = z.object({
  password: z.string().min(1),
});

// XLSX ingest
export const xlsxTransactionSchema = z.object({
  tx_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  booked_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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

// PDF ingest
export const pdfIngestRequestSchema = z.object({
  file_hash: z.string().length(64, 'file_hash must be 64 character hex string'),
  filename: z.string().min(1),
  source: z.literal('pdf'),
  extracted_text: z.string().min(1, 'PDF text extraction failed or returned empty content'),
});

// Transactions query
export const transactionsQuerySchema = z.object({
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(TRANSACTION_STATUSES).optional(),
  source_type: z.enum(SOURCE_TYPES).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

// Response schemas
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
