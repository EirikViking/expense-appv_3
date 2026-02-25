/* eslint-disable no-console */
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeMerchant } from '../apps/worker/src/lib/merchant-normalize';
import { normalizeTransactionDescription } from '../apps/worker/src/lib/transaction-description-normalize';

type TxRow = {
  id: string;
  description: string;
  merchant: string | null;
  merchant_raw: string | null;
  raw_json: string | null;
};

function arg(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function sqlString(value: string | null): string {
  if (value === null) return 'NULL';
  return `'${value.replace(/'/g, "''")}'`;
}

function runWranglerJson(database: string, args: string[]): any {
  const cmd =
    ['npx', 'wrangler', 'd1', 'execute', database, '--remote', '--json', ...args]
      .map((part) => {
        const safe = String(part);
        if (/^[A-Za-z0-9._:/=-]+$/.test(safe)) return safe;
        return `"${safe.replace(/"/g, '\\"')}"`;
      })
      .join(' ');
  const out = execSync(cmd, {
    cwd: join(process.cwd(), 'apps', 'worker'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
  const trimmed = out.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const idxArr = trimmed.indexOf('[');
    const idxObj = trimmed.indexOf('{');
    const idxCandidates = [idxArr, idxObj].filter((v) => v >= 0).sort((a, b) => a - b);
    if (idxCandidates.length === 0) throw new Error(`Unexpected wrangler output: ${trimmed.slice(0, 200)}`);
    return JSON.parse(trimmed.slice(idxCandidates[0]));
  }
}

function buildRowUpdate(row: TxRow): { sql: string; merchantChanged: boolean; descriptionChanged: boolean } | null {
  const sourceRaw = row.merchant_raw || row.merchant || row.description || '';
  const normalizedMerchant = normalizeMerchant(sourceRaw, row.description || '');
  const merchantNext = normalizedMerchant.merchant || null;
  const merchantRawNext = normalizedMerchant.merchant_raw || null;
  const descriptionNext = normalizeTransactionDescription(row.description || '', merchantNext);

  const merchantChanged =
    (row.merchant || null) !== merchantNext || (row.merchant_raw || null) !== merchantRawNext;
  const descriptionChanged = (row.description || '') !== descriptionNext;
  if (!merchantChanged && !descriptionChanged) return null;

  let nextRawJson: string | null = row.raw_json || null;
  if (row.raw_json) {
    try {
      const parsed = JSON.parse(row.raw_json);
      if (parsed && typeof parsed === 'object') {
        (parsed as any).merchant_raw = merchantRawNext;
        (parsed as any).merchant_normalized = merchantNext;
        (parsed as any).merchant_kind = normalizedMerchant.merchant_kind;
        (parsed as any).normalized_description = descriptionNext;
        nextRawJson = JSON.stringify(parsed);
      }
    } catch {
      // Keep malformed JSON as-is.
    }
  }

  const sql = [
    'UPDATE transactions',
    `SET merchant = ${sqlString(merchantNext)},`,
    `merchant_raw = ${sqlString(merchantRawNext)},`,
    `description = ${sqlString(descriptionNext)},`,
    `raw_json = ${sqlString(nextRawJson)}`,
    `WHERE id = ${sqlString(row.id)};`,
  ].join(' ');

  return { sql, merchantChanged, descriptionChanged };
}

function main() {
  const database = arg('--database', 'expense-db');
  const pageSize = Number(arg('--page-size', '1000'));
  const batchSize = Number(arg('--batch-size', '300'));
  const dryRun = hasFlag('--dry-run');

  if (!Number.isFinite(pageSize) || pageSize < 50 || pageSize > 5000) {
    throw new Error('--page-size must be between 50 and 5000');
  }
  if (!Number.isFinite(batchSize) || batchSize < 10 || batchSize > 2000) {
    throw new Error('--batch-size must be between 10 and 2000');
  }

  let cursor = '';
  let scanned = 0;
  let wouldUpdate = 0;
  let merchantUpdates = 0;
  let descriptionUpdates = 0;
  const sqlUpdates: string[] = [];

  for (;;) {
    const escapedCursor = cursor.replace(/'/g, "''");
    const query =
      `SELECT id, description, merchant, merchant_raw, raw_json ` +
      `FROM transactions ` +
      `WHERE id > '${escapedCursor}' ` +
      `ORDER BY id ASC ` +
      `LIMIT ${pageSize}`;
    const res = runWranglerJson(database, ['--command', query]);
    const rows: TxRow[] = res?.[0]?.results || [];
    if (rows.length === 0) break;

    scanned += rows.length;
    cursor = rows[rows.length - 1]?.id || cursor;

    for (const row of rows) {
      const update = buildRowUpdate(row);
      if (!update) continue;
      wouldUpdate++;
      if (update.merchantChanged) merchantUpdates++;
      if (update.descriptionChanged) descriptionUpdates++;
      sqlUpdates.push(update.sql);
    }

    if (rows.length < pageSize) break;
  }

  console.log(
    `[normalize-backfill] scanned=${scanned} would_update=${wouldUpdate} merchant_updates=${merchantUpdates} description_updates=${descriptionUpdates} dry_run=${dryRun}`
  );

  if (dryRun || sqlUpdates.length === 0) return;

  const tmpDir = mkdtempSync(join(tmpdir(), 'tx-normalize-'));
  try {
    let applied = 0;
    for (let i = 0; i < sqlUpdates.length; i += batchSize) {
      const chunk = sqlUpdates.slice(i, i + batchSize);
      const file = join(tmpDir, `batch-${String(i / batchSize).padStart(5, '0')}.sql`);
      writeFileSync(file, `${chunk.join('\n')}\n`, 'utf8');
      runWranglerJson(database, ['--file', file]);
      applied += chunk.length;
      console.log(`[normalize-backfill] applied=${applied}/${sqlUpdates.length}`);
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

main();
