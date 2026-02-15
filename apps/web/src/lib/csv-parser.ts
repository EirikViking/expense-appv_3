import * as XLSX from 'xlsx';
import { parseXlsxFile, type XlsxParseResult } from './xlsx-parser';

const DELIMITER_CANDIDATES = [',', ';', '\t', '|'] as const;
const ENCODING_CANDIDATES = ['utf-8', 'windows-1252'] as const;

function scoreDecodedText(text: string): number {
  const replacementCount = (text.match(/\uFFFD/g) || []).length;
  const mojibakeCount = (text.match(/Ã.|Â.|â./g) || []).length;
  const norwegianCount = (text.match(/[æøåÆØÅ]/g) || []).length;
  // Lower is better.
  return replacementCount * 10 + mojibakeCount * 3 - norwegianCount;
}

function decodeCsvText(arrayBuffer: ArrayBuffer): string {
  const bytes = new Uint8Array(arrayBuffer);
  let best = '';
  let bestScore = Number.POSITIVE_INFINITY;

  for (const encoding of ENCODING_CANDIDATES) {
    const decoded = new TextDecoder(encoding, { fatal: false }).decode(bytes);
    const score = scoreDecodedText(decoded);
    if (score < bestScore) {
      bestScore = score;
      best = decoded;
    }
  }

  return best.replace(/^\uFEFF/, '');
}

function delimiterScore(text: string, delimiter: string): number {
  const lines = text.split(/\r?\n/).slice(0, 50).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return Number.NEGATIVE_INFINITY;

  const counts = lines.map((line) => {
    let inQuotes = false;
    let fields = 1;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (!inQuotes && ch === delimiter) fields++;
    }
    return fields;
  });

  const histogram = new Map<number, number>();
  for (const n of counts) histogram.set(n, (histogram.get(n) || 0) + 1);
  let modeFields = 0;
  let modeCount = 0;
  for (const [fields, count] of histogram) {
    if (count > modeCount || (count === modeCount && fields > modeFields)) {
      modeFields = fields;
      modeCount = count;
    }
  }

  if (modeFields <= 1) return Number.NEGATIVE_INFINITY;
  return modeCount * 100 + modeFields;
}

function detectDelimiter(text: string): string {
  let bestDelimiter = ',';
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const delimiter of DELIMITER_CANDIDATES) {
    const score = delimiterScore(text, delimiter);
    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = delimiter;
    }
  }
  return bestDelimiter;
}

function parseDelimitedRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };

  const pushRow = () => {
    // Drop empty trailing row fragments.
    if (row.length === 1 && row[0].trim() === '') {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      pushField();
      continue;
    }
    if (ch === '\n') {
      pushField();
      pushRow();
      continue;
    }
    if (ch === '\r') {
      continue;
    }
    field += ch;
  }

  pushField();
  if (row.length > 0) pushRow();

  return rows;
}

function rowsToXlsxArrayBuffer(rows: string[][]): ArrayBuffer {
  const normalizedRows = rows.filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''));
  const ws = XLSX.utils.aoa_to_sheet(normalizedRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as unknown;

  if (out instanceof ArrayBuffer) return out;
  if (out && typeof out === 'object' && 'buffer' in (out as any)) {
    const u8 = out as Uint8Array;
    const copy = new Uint8Array(u8.byteLength);
    copy.set(u8);
    return copy.buffer;
  }
  throw new Error('Could not convert CSV rows to workbook');
}

export function parseCsvFile(arrayBuffer: ArrayBuffer): XlsxParseResult {
  try {
    const text = decodeCsvText(arrayBuffer);
    if (!text.trim()) {
      return { transactions: [], error: 'CSV file is empty' };
    }

    const delimiter = detectDelimiter(text);
    const rows = parseDelimitedRows(text, delimiter);
    if (rows.length === 0) {
      return { transactions: [], error: 'No rows found in CSV file' };
    }

    const xlsxBuffer = rowsToXlsxArrayBuffer(rows);
    const parsed = parseXlsxFile(xlsxBuffer);
    return {
      ...parsed,
      detectedFormat: parsed.detectedFormat
        ? `CSV delimiter "${delimiter}" -> ${parsed.detectedFormat}`
        : `CSV delimiter "${delimiter}"`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown CSV parser error';
    return { transactions: [], error: `Failed to parse CSV: ${message}` };
  }
}

