/* eslint-disable no-console */
// CLI helper: ingest a local PDF by extracting text with pdfjs-dist and calling /ingest/pdf.
// No secrets/JWTs are printed.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { access } from 'node:fs/promises';

const API_BASE = (process.env.EXPENSE_API_BASE_URL || 'https://expense-api.cromkake.workers.dev').replace(/\/$/, '');
const PASSWORD = process.env.RUN_REBUILD_PASSWORD;

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

const filePath = argValue('--file');
const verify = process.argv.includes('--verify');
const overrideFrom = argValue('--from');
const overrideTo = argValue('--to');
if (!filePath) {
  console.error('Usage: pnpm run ingest:pdf -- --file <path-to-pdf> [--verify] [--from YYYY-MM-DD --to YYYY-MM-DD]');
  process.exit(2);
}

async function jsonRequest(pathname, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API_BASE}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const msg = (data && (data.error || data.message)) ? String(data.error || data.message) : `HTTP ${res.status}`;
    throw new Error(`${method} ${pathname} failed: ${msg}`);
  }

  return data;
}

async function login() {
  if (!PASSWORD) throw new Error('Missing RUN_REBUILD_PASSWORD env var');
  const data = await jsonRequest('/auth/login', { method: 'POST', body: { password: PASSWORD } });
  if (!data || typeof data.token !== 'string' || !data.token) throw new Error('Login failed: token missing from response');
  return data.token;
}

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function computeDateRangeFromExtractedText(text) {
  const isoDates = new Set();
  const ddmmyyyy = /\b(\d{2})\.(\d{2})\.(\d{4})\b/g;
  const yyyymmdd = /\b(\d{4})-(\d{2})-(\d{2})\b/g;

  for (const m of text.matchAll(ddmmyyyy)) {
    const [, dd, mm, yyyy] = m;
    isoDates.add(`${yyyy}-${mm}-${dd}`);
  }
  for (const m of text.matchAll(yyyymmdd)) {
    isoDates.add(m[0]);
  }

  const sorted = [...isoDates].filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)).sort();
  if (sorted.length === 0) {
    const now = new Date();
    const to = isoDate(now);
    const from = isoDate(new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000));
    return { date_from: from, date_to: to, source: 'fallback_last_60_days' };
  }

  return { date_from: sorted[0], date_to: sorted[sorted.length - 1], source: 'pdf_dates' };
}

async function extractTextFromPdfBytes(bytes) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const require = createRequire(import.meta.url);

  // Resolve pdfjs-dist relative to the web workspace (works with pnpm non-hoisted installs).
  let pdfjsDistRoot;
  try {
    const pkgJsonPath = require.resolve('pdfjs-dist/package.json', {
      paths: [path.join(repoRoot, 'apps', 'web')],
    });
    pdfjsDistRoot = path.dirname(pkgJsonPath);
  } catch {
    throw new Error('Failed to locate pdfjs-dist. Ensure `pnpm --filter web install` has been run.');
  }

  const standardFontsDir = path.join(pdfjsDistRoot, 'standard_fonts');
  try {
    await access(standardFontsDir);
  } catch {
    throw new Error(`pdfjs standard fonts not found at ${standardFontsDir}`);
  }

  const pdfjsModulePath = path.join(pdfjsDistRoot, 'legacy', 'build', 'pdf.mjs');
  try {
    await access(pdfjsModulePath);
  } catch {
    throw new Error(`pdfjs module not found at ${pdfjsModulePath}`);
  }

  // Self-test, one line, no noisy logs.
  console.log('pdfjs fonts ok');

  const pdfjs = await import(pathToFileURL(pdfjsModulePath).href);
  const standardFontDataUrl = pathToFileURL(standardFontsDir + path.sep).href;

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl,
  });
  const doc = await loadingTask.promise;
  let out = '';

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const strings = (content.items || [])
      .map((it) => (typeof it.str === 'string' ? it.str : ''))
      .filter(Boolean);
    out += strings.join('\n') + '\n';
  }

  return out.trim();
}

async function run() {
  const token = await login();

  const absPath = path.resolve(filePath);
  const bytes = await readFile(absPath);
  const filename = path.basename(absPath);
  const file_hash = createHash('sha256').update(bytes).digest('hex');

  const extracted_text = await extractTextFromPdfBytes(bytes);
  if (!extracted_text || extracted_text.length < 20) {
    throw new Error('PDF text extraction returned too little text (is the PDF scanned/image-only?)');
  }

  const res = await jsonRequest('/ingest/pdf', {
    method: 'POST',
    token,
    body: { file_hash, filename, source: 'pdf', extracted_text },
  });

  let validation = null;
  if (verify && !res.file_duplicate) {
    const range = (overrideFrom && overrideTo)
      ? { date_from: overrideFrom, date_to: overrideTo, source: 'override_args' }
      : computeDateRangeFromExtractedText(extracted_text);

    validation = await jsonRequest(
      '/transactions/admin/validate-ingest?' + new URLSearchParams({ date_from: range.date_from, date_to: range.date_to }).toString(),
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
