import * as XLSX from 'xlsx';
import { XLSX_COLUMNS } from '@expense/shared';

export interface ParsedXlsxTransaction {
  tx_date: string;
  booked_date?: string;
  description: string;
  merchant?: string;
  amount: number;
  currency: string;
  raw_json: string;
}

export interface XlsxParseResult {
  transactions: ParsedXlsxTransaction[];
  error?: string;
}

// Parse Norwegian date format DD.MM.YYYY to ISO YYYY-MM-DD
function parseNorwegianDate(dateStr: string): string | null {
  if (!dateStr) return null;

  // Handle both string and potential date objects from XLSX
  const str = String(dateStr).trim();

  // Match DD.MM.YYYY format
  const match = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return null;
}

// Parse Norwegian number format: comma as decimal, space as thousands
function parseNorwegianAmount(value: unknown): number | null {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    // Remove spaces (thousands separators) and replace comma with dot
    const cleaned = value.trim().replace(/\s/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  return null;
}

// Find the header row by looking for key column names
function findHeaderRow(sheet: XLSX.WorkSheet): number {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');

  for (let row = range.s.r; row <= Math.min(range.e.r, 20); row++) {
    let foundDato = false;
    let foundBeløp = false;

    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = sheet[cellRef];
      if (cell && cell.v) {
        const value = String(cell.v).trim();
        if (value === XLSX_COLUMNS.DATE) foundDato = true;
        if (value === XLSX_COLUMNS.AMOUNT) foundBeløp = true;
      }
    }

    if (foundDato && foundBeløp) {
      return row;
    }
  }

  return -1;
}

export function parseXlsxFile(arrayBuffer: ArrayBuffer): XlsxParseResult {
  try {
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
      return { transactions: [], error: 'No worksheet found in XLSX file' };
    }

    // Find the header row
    const headerRow = findHeaderRow(sheet);
    if (headerRow === -1) {
      return { transactions: [], error: 'Could not find header row with Dato and Beløp columns' };
    }

    // Parse as JSON starting from header row
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      range: headerRow,
      defval: '',
    });

    const transactions: ParsedXlsxTransaction[] = [];

    for (const row of jsonData) {
      const txDateRaw = row[XLSX_COLUMNS.DATE];
      const bookedDateRaw = row[XLSX_COLUMNS.BOOKED_DATE];
      const description = row[XLSX_COLUMNS.DESCRIPTION];
      const location = row[XLSX_COLUMNS.LOCATION];
      const currency = row[XLSX_COLUMNS.CURRENCY];
      const amountRaw = row[XLSX_COLUMNS.AMOUNT];

      // Parse date (required)
      const txDate = parseNorwegianDate(String(txDateRaw || ''));
      if (!txDate) continue;

      // Parse amount (required)
      const amount = parseNorwegianAmount(amountRaw);
      if (amount === null) continue;

      // Parse optional fields
      const bookedDate = parseNorwegianDate(String(bookedDateRaw || '')) || undefined;
      const descriptionStr = String(description || '').trim();
      const merchantStr = String(location || '').trim() || undefined;
      const currencyStr = String(currency || 'NOK').trim();

      if (!descriptionStr) continue;

      transactions.push({
        tx_date: txDate,
        booked_date: bookedDate,
        description: descriptionStr,
        merchant: merchantStr,
        amount,
        currency: currencyStr,
        raw_json: JSON.stringify(row),
      });
    }

    if (transactions.length === 0) {
      return { transactions: [], error: 'No valid transactions found in XLSX file' };
    }

    return { transactions };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { transactions: [], error: `Failed to parse XLSX: ${message}` };
  }
}
