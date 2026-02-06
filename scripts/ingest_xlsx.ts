/* eslint-disable no-console */
// CLI helper: ingest a local XLSX by using the same parser as the web app and calling /ingest/xlsx.
// No secrets/JWTs are printed.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseXlsxFile } from '../apps/web/src/lib/xlsx-parser';

const API_BASE = (process.env.EXPENSE_API_BASE_URL || 'https://expense-api.cromkake.workers.dev').replace(/\/$/, '');
const PASSWORD = process.env.RUN_REBUILD_PASSWORD;

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

const filePath = argValue('--file');
const verify = process.argv.includes('--verify');

if (!filePath) {
  console.error('Usage: pnpm run ingest:xlsx -- --file <path-to-xlsx> [--verify]');
  process.exit(2);
}

async function jsonRequest(pathname: string, opts: { method?: string; token?: string; body?: unknown } = {}) {
  const res = await fetch(`${API_BASE}${pathname}`, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  let data: any;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const msg = (data && (data.error || data.message)) ? String(data.error || data.message) : `HTTP ${res.status}`;
    throw new Error(`${opts.method || 'GET'} ${pathname} failed: ${msg}`);
  }

  return data;
}

async function login() {
  if (!PASSWORD) throw new Error('Missing RUN_REBUILD_PASSWORD env var');
  const data = await jsonRequest('/auth/login', { method: 'POST', body: { password: PASSWORD } });
  if (!data || typeof data.token !== 'string' || !data.token) throw new Error('Login failed: token missing from response');
  return data.token as string;
}

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function computeDateRangeFromTransactions(txs: Array<{ tx_date: string }>): { date_from: string; date_to: string } {
  const dates = txs.map((t) => t?.tx_date).filter((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  if (dates.length === 0) {
    const now = new Date();
    const to = now.toISOString().slice(0, 10);
    const from = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return { date_from: from, date_to: to };
  }
  return { date_from: dates[0], date_to: dates[dates.length - 1] };
}

async function run() {
  // Ensure we resolve relative imports correctly under tsx
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  process.chdir(repoRoot);

  const token = await login();

  const absPath = path.resolve(filePath);
  const bytes = await readFile(absPath);
  const filename = path.basename(absPath);
  const file_hash = createHash('sha256').update(bytes).digest('hex');

  const { transactions, error } = parseXlsxFile(toArrayBuffer(bytes));
  if (error) throw new Error(error);
  if (!transactions || transactions.length === 0) throw new Error('No valid transactions found in XLSX');

  const res = await jsonRequest('/ingest/xlsx', {
    method: 'POST',
    token,
    body: { file_hash, filename, source: 'xlsx', transactions },
  });

  let validation: any = null;
  if (verify && !res.file_duplicate) {
    const range = computeDateRangeFromTransactions(transactions);
    validation = await jsonRequest(
      '/transactions/admin/validate-ingest?' + new URLSearchParams(range).toString(),
      { token }
    );

    if (!validation || validation.ok !== true) {
      const failures = Array.isArray(validation?.failures) ? validation.failures : ['unknown'];
      throw new Error(`Post-ingest validation failed: ${failures.join(', ')}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        success: true,
        filename,
        parsed: transactions.length,
        inserted: res.inserted,
        skipped_duplicates: res.skipped_duplicates,
        skipped_invalid: res.skipped_invalid,
        file_duplicate: res.file_duplicate,
        ...(validation ? { validation } : {}),
      },
      null,
      2
    )
  );
}

run().catch((err) => {
  console.error(err && err.message ? err.message : String(err));
  process.exit(1);
});

