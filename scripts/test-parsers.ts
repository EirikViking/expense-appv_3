import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as XLSX from 'xlsx';

import { parseXlsxFile } from '../apps/web/src/lib/xlsx-parser';
import { parsePdfText } from '../apps/worker/src/lib/pdf-parser';
import {
  normalizePdfExport,
  normalizeXlsxExport,
  exportNormalizedTransactions,
} from '../packages/shared/src/exports';

const FIXTURES_DIR = path.join(process.cwd(), 'tests', 'fixtures');

function readFixtureJson<T>(filename: string): T {
  const filePath = path.join(FIXTURES_DIR, filename);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

function readFixtureText(filename: string): string {
  const filePath = path.join(FIXTURES_DIR, filename);
  return fs.readFileSync(filePath, 'utf-8');
}

function buildWorkbookBuffer(rows: unknown[][]): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

function runXlsxFixture(rowsFile: string, expectedFile: string) {
  const rows = readFixtureJson<unknown[][]>(rowsFile);
  const buffer = buildWorkbookBuffer(rows);
  const result = parseXlsxFile(buffer);

  assert.ok(!result.error, `XLSX parse failed: ${result.error ?? 'unknown error'}`);
  assert.ok(result.transactions.length > 0, 'XLSX parse returned zero transactions');

  const exported = exportNormalizedTransactions(
    result.transactions.map(normalizeXlsxExport)
  );
  const expected = readFixtureJson(expectedFile);

  assert.deepStrictEqual(exported, expected);
}

function runPdfFixture(textFile: string, expectedFile: string) {
  const text = readFixtureText(textFile);
  const result = parsePdfText(text);

  assert.ok(!result.error, `PDF parse failed: ${result.error ?? 'unknown error'}`);
  assert.ok(result.transactions.length > 0, 'PDF parse returned zero transactions');

  const exported = exportNormalizedTransactions(
    result.transactions.map(normalizePdfExport)
  );
  const expected = readFixtureJson(expectedFile);

  assert.deepStrictEqual(exported, expected);

  const reasons = new Set((result.skipped_lines || []).map((line) => line.reason));
  assert.ok(reasons.has('section_marker'), 'Expected section_marker skip reason');
  assert.ok(reasons.has('page_number'), 'Expected page_number skip reason');
  assert.ok(reasons.has('excluded_pattern'), 'Expected excluded_pattern skip reason');
  assert.ok(!reasons.has('no_date'), 'Expected wrapped amount line to be merged');
}

function main() {
  runXlsxFixture('xlsx_headerless_strings.json', 'expected_xlsx_headerless.json');
  runXlsxFixture('xlsx_preamble_unknown_headers.json', 'expected_xlsx_preamble.json');
  runPdfFixture('pdf_wrapped_lines.txt', 'expected_pdf_wrapped.json');
  console.log('Parser fixtures: all checks passed.');
}

main();
