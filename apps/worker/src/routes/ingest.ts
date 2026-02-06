import { Hono } from 'hono';
import type { Context } from 'hono';
import {
  xlsxIngestRequestSchema,
  pdfIngestRequestSchema,
  computeTxHash,
  generateId,
  type IngestResponse,
  type Transaction,
} from '@expense/shared';
import { extractMerchantFromPdfLine, parsePdfText, parsePdfTransactionLine, type SkippedLine } from '../lib/pdf-parser';
import { applyRulesToBatch, getEnabledRules } from '../lib/rule-engine';
import { detectIsTransfer } from '../lib/transfer-detect';
import { normalizeXlsxAmountForIngest } from '../lib/xlsx-normalize';
import { classifyFlowType, normalizeAmountAndFlags } from '../lib/flow-classify';
import type { Env } from '../types';

const ingest = new Hono<{ Bindings: Env }>();

async function parseJsonBody<T>(c: Context): Promise<
  { ok: true; data: T } | { ok: false; error: string; details?: string }
> {
  try {
    const data = await c.req.json<T>();
    return { ok: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON body';
    return { ok: false, error: 'Invalid JSON', details: message };
  }
}

// Helper to store file in R2 if available
async function storeFileInR2(
  bucket: R2Bucket | undefined,
  sourceType: string,
  fileHash: string,
  filename: string,
  content: string
): Promise<void> {
  if (!bucket) return;

  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const path = `${sourceType}/${yearMonth}/${fileHash}/${filename}`;

  await bucket.put(path, content);
}

// Check if file already exists
async function checkFileDuplicate(db: D1Database, fileHash: string): Promise<boolean> {
  const result = await db
    .prepare('SELECT 1 FROM ingested_files WHERE file_hash = ?')
    .bind(fileHash)
    .first();
  return result !== null;
}

// Insert file record
async function insertFileRecord(
  db: D1Database,
  fileHash: string,
  sourceType: string,
  filename: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const id = generateId();
  const now = new Date().toISOString();

  await db
    .prepare(
      'INSERT INTO ingested_files (id, file_hash, source_type, original_filename, uploaded_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .bind(id, fileHash, sourceType, filename, now, metadata ? JSON.stringify(metadata) : null)
    .run();
}

// Check if transaction exists
async function checkTxDuplicate(db: D1Database, txHash: string): Promise<boolean> {
  const result = await db
    .prepare('SELECT 1 FROM transactions WHERE tx_hash = ?')
    .bind(txHash)
    .first();
  return result !== null;
}

function summarizeSkippedLines(skippedLines?: SkippedLine[]): IngestResponse['skipped_lines_summary'] | undefined {
  if (!skippedLines || skippedLines.length === 0) return undefined;

  const summary = {
    header: 0,
    section_marker: 0,
    page_number: 0,
    no_date: 0,
    no_amount: 0,
    parse_failed: 0,
    excluded_pattern: 0,
  };

  for (const line of skippedLines) {
    if (line.reason in summary) {
      summary[line.reason as keyof typeof summary] += 1;
    }
  }

  return summary;
}

async function applyRulesForFile(
  db: D1Database,
  fileHash: string
): Promise<{ processed: number; updated: number; errors: number }> {
  const enabledRules = await getEnabledRules(db);
  if (enabledRules.length === 0) {
    return { processed: 0, updated: 0, errors: 0 };
  }

  const txResult = await db
    .prepare('SELECT * FROM transactions WHERE source_file_hash = ?')
    .bind(fileHash)
    .all<Transaction>();

  const transactions = txResult.results || [];
  if (transactions.length === 0) {
    return { processed: 0, updated: 0, errors: 0 };
  }

  return applyRulesToBatch(db, transactions, enabledRules);
}

// Insert transaction
async function insertTransaction(
  db: D1Database,
  txHash: string,
  txDate: string,
  bookedDate: string | null,
  description: string,
  merchant: string | null,
  amount: number,
  currency: string,
  status: string,
  sourceType: string,
  sourceFileHash: string,
  rawJson: string,
  flowType: string,
  flags?: { is_excluded?: number; is_transfer?: number }
): Promise<void> {
  const id = generateId();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO transactions
       (id, tx_hash, tx_date, booked_date, description, merchant, amount, currency, status, source_type, source_file_hash, raw_json, created_at, flow_type, is_excluded, is_transfer)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      txHash,
      txDate,
      bookedDate,
      description,
      merchant,
      amount,
      currency,
      status,
      sourceType,
      sourceFileHash,
      rawJson,
      now,
      flowType,
      flags?.is_excluded ?? 0,
      flags?.is_transfer ?? 0
    )
    .run();
}

// XLSX ingestion endpoint
ingest.post('/xlsx', async (c) => {
  try {
    const bodyResult = await parseJsonBody<Record<string, unknown>>(c);
    if (!bodyResult.ok) {
      return c.json({ error: bodyResult.error, code: 'invalid_json', details: bodyResult.details }, 400);
    }

    const parsed = xlsxIngestRequestSchema.safeParse(bodyResult.data);

    if (!parsed.success) {
      const errorMessage = parsed.error.errors[0]?.message || 'Invalid request';
      return c.json({ error: errorMessage, code: 'invalid_request', details: parsed.error.message }, 400);
    }

    const { file_hash, filename, transactions } = parsed.data;

    // Check file-level duplicate
    const isFileDuplicate = await checkFileDuplicate(c.env.DB, file_hash);
    if (isFileDuplicate) {
      const response: IngestResponse = {
        inserted: 0,
        skipped_duplicates: 0,
        skipped_invalid: 0,
        file_duplicate: true,
      };
      return c.json(response);
    }

    // Insert file record
    await insertFileRecord(c.env.DB, file_hash, 'xlsx', filename, {
      transaction_count: transactions.length,
    });

    // Process transactions
    let inserted = 0;
    let skipped_duplicates = 0;
    let skipped_invalid = 0;

      for (const tx of transactions) {
      try {
        // Classify flow + normalize sign so purchases never land in income.
        const flow = classifyFlowType({
          source_type: 'xlsx',
          description: tx.description,
          amount: tx.amount,
          raw_json: tx.raw_json,
        });

        // Keep XLSX-specific safety guards (section-based purchase normalization + refunds).
        const xlsxNormalized = normalizeXlsxAmountForIngest({
          amount: tx.amount,
          description: tx.description,
          raw_json: tx.raw_json,
        });

        const normalized = normalizeAmountAndFlags({ flow_type: flow.flow_type, amount: xlsxNormalized.amount });
        const amount = normalized.amount;

        const isTransfer =
          normalized.flags?.is_transfer === 1 ||
          xlsxNormalized.flags?.is_transfer === 1 ||
          detectIsTransfer(tx.description);
        const flags = isTransfer ? { is_transfer: 1, is_excluded: 1 } : undefined;

        const flowType = isTransfer ? 'transfer' : flow.flow_type;

        // Preserve original context for deterministic rebuilds/debugging.
        const rawJson = (() => {
          try {
            const obj = JSON.parse(tx.raw_json);
            if (obj && typeof obj === 'object') {
              (obj as any).source_type = 'xlsx';
              (obj as any).source_file = filename;
              (obj as any).source_filename = filename;
              (obj as any).source_file_hash = file_hash;
              (obj as any).source_fingerprint = file_hash;
              (obj as any).original_amount = tx.amount;
              (obj as any).pre_normalized_amount = xlsxNormalized.amount;
              (obj as any).normalized_amount = amount;
              (obj as any).original_flow_type = flow.flow_type;
              (obj as any).normalized_flow_type = flowType;
              (obj as any).normalized_is_transfer = Boolean(flags?.is_transfer);
              (obj as any).normalized_is_excluded = Boolean(flags?.is_excluded);
              (obj as any).normalized_reason = flow.reason;
              return JSON.stringify(obj);
            }
          } catch {
            // fall through
          }
          return JSON.stringify({
            source_type: 'xlsx',
            source_file: filename,
            source_filename: filename,
            source_file_hash: file_hash,
            source_fingerprint: file_hash,
            raw_json_original: tx.raw_json,
            original_amount: tx.amount,
            pre_normalized_amount: xlsxNormalized.amount,
            normalized_amount: amount,
            original_flow_type: flow.flow_type,
            normalized_flow_type: flowType,
            normalized_is_transfer: Boolean(flags?.is_transfer),
            normalized_is_excluded: Boolean(flags?.is_excluded),
            normalized_reason: flow.reason,
          });
        })();

        const txHash = await computeTxHash(tx.tx_date, tx.description, amount, 'xlsx');
        // Check transaction-level duplicate
        const isTxDuplicate = await checkTxDuplicate(c.env.DB, txHash);
        if (isTxDuplicate) {
          skipped_duplicates++;
          continue;
        }

        // Insert transaction (XLSX transactions are always "booked")
        await insertTransaction(
          c.env.DB,
          txHash,
          tx.tx_date,
          tx.booked_date || null,
          tx.description,
          tx.merchant || null,
          amount,
          tx.currency,
          'booked',
          'xlsx',
          file_hash,
          rawJson,
          flowType,
          flags
        );

        inserted++;
      } catch {
        skipped_invalid++;
      }
    }

    if (inserted > 0) {
      try {
        await applyRulesForFile(c.env.DB, file_hash);
      } catch (error) {
        console.error('Apply rules error (xlsx):', error);
      }
    }

    // Store in R2 if available
    await storeFileInR2(c.env.BUCKET, 'xlsx', file_hash, filename, JSON.stringify(bodyResult.data));

    const response: IngestResponse = {
      inserted,
      skipped_duplicates,
      skipped_invalid,
      file_duplicate: false,
    };

    return c.json(response);
  } catch (error) {
    console.error('XLSX ingest error:', error);
    return c.json({ error: 'Internal server error', code: 'internal_error' }, 500);
  }
});

// PDF ingestion endpoint
ingest.post('/pdf', async (c) => {
  try {
    const bodyResult = await parseJsonBody<Record<string, unknown>>(c);
    if (!bodyResult.ok) {
      return c.json({ error: bodyResult.error, code: 'invalid_json', details: bodyResult.details }, 400);
    }

    const parsed = pdfIngestRequestSchema.safeParse(bodyResult.data);

    if (!parsed.success) {
      const errorMessage = parsed.error.errors[0]?.message || 'Invalid request';
      return c.json({ error: errorMessage, code: 'invalid_request', details: parsed.error.message }, 400);
    }

    const { file_hash, filename, extracted_text } = parsed.data;

    // Check file-level duplicate
    const isFileDuplicate = await checkFileDuplicate(c.env.DB, file_hash);
    if (isFileDuplicate) {
      const response: IngestResponse = {
        inserted: 0,
        skipped_duplicates: 0,
        skipped_invalid: 0,
        file_duplicate: true,
      };
      return c.json(response);
    }

    // Parse PDF text into transactions
    const { transactions: parsedTxs, error: parseError, stats, skipped_lines } = parsePdfText(extracted_text);

    // Log parsing stats for debugging
    console.log(`[PDF Ingest] File: ${filename}, Stats:`, JSON.stringify(stats));

    if (parseError) {
      return c.json({ error: parseError }, 400);
    }

    if (parsedTxs.length === 0) {
      return c.json(
        {
          error: 'No valid transactions found in PDF',
          code: 'PDF_NO_TRANSACTIONS',
          message:
            'No transactions were detected in this PDF. If this is a Storebrand "Detaljer" PDF, the parser may not recognize its block layout.',
          debug: {
            stats: stats || null,
            skipped_lines_summary: summarizeSkippedLines(skipped_lines),
          },
        },
        422
      );
    }

    // Insert file record
    await insertFileRecord(c.env.DB, file_hash, 'pdf', filename, {
      extracted_text_length: extracted_text.length,
      parsed_count: parsedTxs.length,
      ...stats,
    });

    // Process transactions
    let inserted = 0;
    let skipped_duplicates = 0;
    let skipped_invalid = 0;

      for (const tx of parsedTxs) {
      try {
        // Best-effort re-parse to improve description/amount (helps rule matching and prevents legacy pollution).
        // For "Detaljer" block PDFs we already have tx.description/tx.amount; re-parsing raw_line may not work.
        const reparsed = parsePdfTransactionLine(tx.raw_line);
        const description = reparsed?.description && reparsed.date === tx.tx_date ? reparsed.description : tx.description;
        const parsedAmount = reparsed?.amount !== undefined && reparsed.date === tx.tx_date ? reparsed.amount : tx.amount;
        const merchantHint = tx.merchant_hint || extractMerchantFromPdfLine(tx.raw_line);

        const rawJson = JSON.stringify({
          source_type: 'pdf',
          source_file: filename,
          source_filename: filename,
          source_file_hash: file_hash,
          source_fingerprint: file_hash,
          raw_line: tx.raw_line,
          ...(tx.raw_block ? { raw_block: tx.raw_block } : {}),
          ...(tx.detaljer ? { detaljer: tx.detaljer } : {}),
          parsed_description: description,
          parsed_amount: parsedAmount,
          merchant_hint: merchantHint,
        });

        const flow = classifyFlowType({
          source_type: 'pdf',
          description,
          amount: parsedAmount,
          raw_json: rawJson,
        });

        const normalized = normalizeAmountAndFlags({ flow_type: flow.flow_type, amount: parsedAmount });
        const amount = normalized.amount;

        const isTransfer = normalized.flags?.is_transfer === 1 || detectIsTransfer(description);
        const flags = isTransfer ? { is_transfer: 1, is_excluded: 1 } : undefined;
        const flowType = isTransfer ? 'transfer' : flow.flow_type;

        const enrichedRawJson = (() => {
          try {
            const obj = JSON.parse(rawJson);
            if (obj && typeof obj === 'object') {
              (obj as any).original_amount = parsedAmount;
              (obj as any).normalized_amount = amount;
              (obj as any).original_flow_type = flow.flow_type;
              (obj as any).normalized_flow_type = flowType;
              (obj as any).normalized_is_transfer = Boolean(flags?.is_transfer);
              (obj as any).normalized_is_excluded = Boolean(flags?.is_excluded);
              (obj as any).normalized_reason = flow.reason;
              return JSON.stringify(obj);
            }
          } catch {
            // fall through
          }
          return rawJson;
        })();

        const txHash = await computeTxHash(tx.tx_date, description, amount, 'pdf');

        // Check transaction-level duplicate
        const isTxDuplicate = await checkTxDuplicate(c.env.DB, txHash);
        if (isTxDuplicate) {
          skipped_duplicates++;
          continue;
        }

        // Insert transaction with correct status from PDF section
        await insertTransaction(
          c.env.DB,
          txHash,
          tx.tx_date,
          null, // PDF doesn't have separate booked date
          description,
          merchantHint,
          amount,
          'NOK',
          tx.status,
          'pdf',
          file_hash,
          enrichedRawJson,
          flowType,
          flags
        );

        inserted++;
      } catch {
        skipped_invalid++;
      }
    }

    if (inserted > 0) {
      try {
        await applyRulesForFile(c.env.DB, file_hash);
      } catch (error) {
        console.error('Apply rules error (pdf):', error);
      }
    }

    // Store in R2 if available
    await storeFileInR2(c.env.BUCKET, 'pdf', file_hash, filename, extracted_text);

    const response: IngestResponse = {
      inserted,
      skipped_duplicates,
      skipped_invalid,
      file_duplicate: false,
    };

    return c.json(response);
  } catch (error) {
    console.error('PDF ingest error:', error);
    return c.json({ error: 'Internal server error', code: 'internal_error' }, 500);
  }
});

export default ingest;
