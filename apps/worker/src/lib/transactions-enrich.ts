import type { Transaction, TransactionWithMeta } from '@expense/shared';
import { normalizeMerchant } from './merchant-normalize';

type DbBool = 0 | 1;
export type DbTransactionRow = Omit<Transaction, 'is_excluded' | 'is_transfer'> & {
  is_excluded: DbBool;
  is_transfer: DbBool;
};

// Helper to enrich transactions with metadata
export async function enrichTransactions(
  db: D1Database,
  txs: DbTransactionRow[],
  scopeUserId?: string | null
): Promise<TransactionWithMeta[]> {
  if (txs.length === 0) return [];

  // D1/SQLite variable limits can be lower than local SQLite defaults.
  // Chunk IN(...) queries to avoid "too many SQL variables" 500s when limit is large (e.g. 200+).
  const CHUNK_SIZE = 80;
  const chunk = <T,>(arr: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  const txIds = txs.map(t => t.id);
  const metaMap = new Map<
    string,
    {
      transaction_id: string;
      category_id: string | null;
      merchant_id: string | null;
      notes: string | null;
      is_recurring: number;
      category_name: string | null;
      category_color: string | null;
      merchant_name: string | null;
    }
  >();

  for (const ids of chunk(txIds, CHUNK_SIZE)) {
    const placeholders = ids.map(() => '?').join(',');
    const metaQuery = `
      SELECT
        tm.transaction_id,
        tm.category_id,
        tm.merchant_id,
        tm.notes,
        tm.is_recurring,
        c.name as category_name,
        c.color as category_color,
        m.canonical_name as merchant_name
      FROM transaction_meta tm
      LEFT JOIN categories c ON tm.category_id = c.id
      LEFT JOIN merchants m ON tm.merchant_id = m.id
      WHERE tm.transaction_id IN (${placeholders})
    `;

    const metaResults = await db.prepare(metaQuery).bind(...ids).all<{
      transaction_id: string;
      category_id: string | null;
      merchant_id: string | null;
      notes: string | null;
      is_recurring: number;
      category_name: string | null;
      category_color: string | null;
      merchant_name: string | null;
    }>();

    for (const m of metaResults.results || []) {
      metaMap.set(m.transaction_id, m);
    }
  }

  // Get tags for all transactions
  const tagsMap = new Map<string, Array<{ id: string; name: string; color: string | null }>>();
  for (const ids of chunk(txIds, CHUNK_SIZE)) {
    const placeholders = ids.map(() => '?').join(',');
    const tagsQuery = `
      SELECT tt.transaction_id, t.id, t.name, t.color
      FROM transaction_tags tt
      JOIN tags t ON tt.tag_id = t.id
      WHERE tt.transaction_id IN (${placeholders})
    `;
    const tagsResults = await db.prepare(tagsQuery).bind(...ids).all<{
      transaction_id: string;
      id: string;
      name: string;
      color: string | null;
    }>();

    for (const tag of tagsResults.results || []) {
      const existing = tagsMap.get(tag.transaction_id) || [];
      existing.push({ id: tag.id, name: tag.name, color: tag.color });
      tagsMap.set(tag.transaction_id, existing);
    }
  }

  // Get source filenames
  const fileHashes = [...new Set(txs.map(t => t.source_file_hash).filter(Boolean))];
  const filesMap = new Map<string, string>();

  if (fileHashes.length > 0) {
    for (const hashes of chunk(fileHashes, CHUNK_SIZE)) {
      const filePlaceholders = hashes.map(() => '?').join(',');
      const filesQuery = scopeUserId
        ? `SELECT file_hash, original_filename FROM ingested_files WHERE file_hash IN (${filePlaceholders}) AND user_id = ?`
        : `SELECT file_hash, original_filename FROM ingested_files WHERE file_hash IN (${filePlaceholders})`;
      const filesResult = scopeUserId
        ? await db.prepare(filesQuery).bind(...hashes, scopeUserId).all<{ file_hash: string; original_filename: string }>()
        : await db.prepare(filesQuery).bind(...hashes).all<{ file_hash: string; original_filename: string }>();
      for (const f of filesResult.results || []) {
        filesMap.set(f.file_hash, f.original_filename);
      }
    }
  }

  // Enrich transactions
  return txs.map(tx => {
    const meta = metaMap.get(tx.id);
    const tags = tagsMap.get(tx.id) || [];
    const sourceFilename = filesMap.get(tx.source_file_hash);
    const merchantNormalized = normalizeMerchant((tx as any).merchant || '', tx.description || '');

    return {
      ...tx,
      is_excluded: tx.is_excluded === 1,
      is_transfer: tx.is_transfer === 1,
      category_id: meta?.category_id || null,
      category_name: meta?.category_name || null,
      category_color: meta?.category_color || null,
      merchant_id: meta?.merchant_id || null,
      merchant_name: meta?.merchant_name || ((tx as any).merchant ? merchantNormalized.merchant : null),
      notes: meta?.notes || null,
      is_recurring: meta?.is_recurring === 1,
      source_filename: sourceFilename || null,
      tags,
    };
  });
}
