/* eslint-disable no-console */
// CLI helper: ingest a local PDF by extracting text with pdfjs-dist and calling /ingest/pdf.
// No secrets/JWTs are printed.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const API_BASE = (process.env.EXPENSE_API_BASE_URL || 'https://expense-api.cromkake.workers.dev').replace(/\/$/, '');
const PASSWORD = process.env.RUN_REBUILD_PASSWORD || process.env.ADMIN_PASSWORD;

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

const filePath = argValue('--file');
if (!filePath) {
  console.error('Usage: pnpm run ingest:pdf -- --file <path-to-pdf>');
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
  if (!PASSWORD) throw new Error('Missing RUN_REBUILD_PASSWORD (or ADMIN_PASSWORD) env var');
  const data = await jsonRequest('/auth/login', { method: 'POST', body: { password: PASSWORD } });
  if (!data || typeof data.token !== 'string' || !data.token) throw new Error('Login failed: token missing from response');
  return data.token;
}

async function extractTextFromPdfBytes(bytes) {
  // Resolve pdfjs-dist from the web workspace dependency so root scripts don't need hoisting.
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const pdfjsPath = path.join(repoRoot, 'apps', 'web', 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs');
  const pdfjs = await import(pathToFileURL(pdfjsPath).href);

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes) });
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

  console.log(
    JSON.stringify(
      {
        success: true,
        filename,
        inserted: res.inserted,
        skipped_duplicates: res.skipped_duplicates,
        skipped_invalid: res.skipped_invalid,
        file_duplicate: res.file_duplicate,
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
