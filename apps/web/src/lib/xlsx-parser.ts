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
  detectedFormat?: string;
  debugInfo?: string;
}

const MAX_HEADER_SCAN_ROWS = 50;
const DATE_VALUE_PATTERN = /^\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{2,4}$/;

// Possible column name variations for different Norwegian banks
// EXPANDED to cover Storebrand, DNB, Skandiabanken, Nordea, Sparebank1, etc.
const COLUMN_VARIATIONS = {
  DATE: [
    'Dato', 'Transaksjonsdato', 'Bokføringsdato', 'Date', 'Utført dato',
    'Valuteringsdato', 'Handledato', 'Trans.dato', 'Bokført', 'Rentedato',
    'Kjøpsdato', 'Posteringsdato', 'Forfall', 'Transaksjon dato',
    // Storebrand specific
    'Transaksjons dato', 'Betalingsdato', 'Oppgjørsdato',
  ],
  BOOKED_DATE: [
    'Bokført', 'Bokført dato', 'Regnskapsdato', 'Rentedato', 'Booked date',
    'Posteringsdato', 'Oppgjørsdato',
  ],
  DESCRIPTION: [
    'Spesifikasjon', 'Beskrivelse', 'Tekst', 'Forklaring', 'Melding',
    'Description', 'Transaksjonstekst', 'Transaksjon', 'Kontotekst',
    'Betalingsmottaker', 'Til konto', 'Fra konto', 'Mottaker',
    'Avsender', 'Navn', 'Type', 'Kategori',
    // Storebrand specific
    'Transaksjonstype', 'Merknad', 'Kommentar', 'Detaljer',
  ],
  AMOUNT: [
    'Beløp', 'Sum', 'Kroner', 'Amount', 'Inn/Ut', 'Ut', 'Inn',
    'Transaksjonsbeløp', 'NOK', 'Utbetalt', 'Innskudd', 'Belastet',
    'Kreditert', 'Debitert', 'Saldo endring', 'Kr', 'Verdi',
    // Storebrand specific
    'Transaksjons beløp', 'Beløp NOK', 'Beløp (NOK)', 'NOK beløp',
  ],
  CURRENCY: ['Valuta', 'Currency', 'Valutakode', 'Myntslag'],
  MERCHANT: [
    'Sted', 'Mottaker', 'Avsender', 'Fra/Til', 'Recipient', 'Location',
    'Butikk', 'Forhandler', 'Betalingsmottaker',
  ],
};

function normalizeHeaderValue(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const ALL_NORMALIZED_HEADERS = new Set(
  Object.values(COLUMN_VARIATIONS).flatMap((values) => values.map(normalizeHeaderValue))
);

/**
 * Convert Excel serial date to ISO string (YYYY-MM-DD)
 * Excel stores dates as number of days since 1900-01-01 (with a leap year bug)
 */
function excelSerialToDate(serial: number): string | null {
  // Sanity check: Excel serial dates for reasonable dates (1990-2050) are roughly 33000-55000
  if (serial < 1 || serial > 100000) return null;

  // Excel has a bug where it thinks 1900 was a leap year
  // Dates after Feb 28, 1900 need adjustment
  const adjustedSerial = serial > 60 ? serial - 1 : serial;

  // Excel epoch is January 1, 1900
  const excelEpoch = new Date(1900, 0, 1);
  const date = new Date(excelEpoch.getTime() + (adjustedSerial - 1) * 24 * 60 * 60 * 1000);

  if (isNaN(date.getTime())) return null;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  // Validate reasonable date range (1990-2050)
  if (year < 1990 || year > 2050) return null;

  return `${year}-${month}-${day}`;
}

/**
 * Parse Norwegian date format or Excel serial number to ISO YYYY-MM-DD
 */
function parseNorwegianDate(dateValue: unknown): string | null {
  // Handle Excel serial dates (numbers)
  if (typeof dateValue === 'number') {
    return excelSerialToDate(dateValue);
  }

  if (!dateValue) return null;

  // Handle string dates and potential date objects from XLSX
  const str = String(dateValue).trim();

  // Check if it's a number stored as string (Excel serial date)
  const numericValue = parseFloat(str);
  if (!isNaN(numericValue) && numericValue > 30000 && numericValue < 100000) {
    return excelSerialToDate(numericValue);
  }

  // Match DD.MM.YYYY format
  const dotMatch = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dotMatch) {
    const [, day, month, year] = dotMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Match YYYY-MM-DD format (ISO)
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return str;
  }

  // Match DD/MM/YYYY format
  const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Match DD-MM-YYYY format
  const dashMatch = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch) {
    const [, day, month, year] = dashMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return null;
}

/**
 * Parse Norwegian number format: comma as decimal, space as thousands
 */
function parseNorwegianAmount(value: unknown): number | null {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    let cleaned = value.trim();
    if (!cleaned) return null;

    const hasComma = cleaned.includes(',');
    const hasDot = cleaned.includes('.');

    // Remove spaces (thousands separators)
    cleaned = cleaned.replace(/\s/g, '');

    // If both comma and dot are present, assume dot is thousands separator
    if (hasComma && hasDot) {
      cleaned = cleaned.replace(/\./g, '');
    }

    // Replace comma with dot for decimals
    cleaned = cleaned.replace(',', '.');

    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  return null;
}

function isLikelyDateValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return false;
    const rounded = Math.round(value);
    const isInteger = Math.abs(value - rounded) < 0.000001;
    return isInteger && value >= 30000 && value <= 60000;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (DATE_VALUE_PATTERN.test(trimmed)) return true;
    return parseNorwegianDate(trimmed) !== null;
  }

  return false;
}

function isLikelyAmountValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return false;
    const rounded = Math.round(value);
    const isInteger = Math.abs(value - rounded) < 0.000001;
    if (isInteger && value >= 30000 && value <= 60000) return false;
    return true;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (DATE_VALUE_PATTERN.test(trimmed)) return false;

    const stripped = trimmed.replace(/\s?(kr|nok)$/i, '').trim();
    if (/[A-Za-z]/.test(stripped)) return false;

    const normalized = stripped.replace(/\s/g, '');
    if (!/^-?\d+([,\.]\d{1,2})?$/.test(normalized)) return false;
    return parseNorwegianAmount(stripped) !== null;
  }

  return false;
}

function isLikelyCurrencyValue(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length !== 3) return false;
  return /^[A-Z]{3}$/.test(trimmed.toUpperCase());
}

function isLikelyTextValue(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length < 2) return false;
  return /[a-z]/.test(normalizeHeaderValue(trimmed));
}

function analyzeRowValues(values: unknown[]): {
  dateCount: number;
  amountCount: number;
  currencyCount: number;
  textCount: number;
  nonEmptyCount: number;
} {
  let dateCount = 0;
  let amountCount = 0;
  let currencyCount = 0;
  let textCount = 0;
  let nonEmptyCount = 0;

  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    nonEmptyCount++;

    if (isLikelyDateValue(value)) {
      dateCount++;
      continue;
    }
    if (isLikelyAmountValue(value)) {
      amountCount++;
      continue;
    }
    if (isLikelyCurrencyValue(value)) {
      currencyCount++;
      continue;
    }
    if (isLikelyTextValue(value)) {
      textCount++;
    }
  }

  return {
    dateCount,
    amountCount,
    currencyCount,
    textCount,
    nonEmptyCount,
  };
}

function getRowValues(sheet: XLSX.WorkSheet, range: XLSX.Range, row: number): unknown[] {
  const values: unknown[] = [];
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
    const cell = sheet[cellRef];
    values.push(cell && cell.v !== undefined && cell.v !== null ? cell.v : '');
  }
  return values;
}

/**
 * Find which column name matches any of the variations
 */
function findColumnName(headers: string[], variations: string[]): string | null {
  const normalizedVariations = new Set(variations.map(normalizeHeaderValue));

  for (const header of headers) {
    const normalized = normalizeHeaderValue(header);
    if (normalizedVariations.has(normalized)) {
      return header;
    }
  }
  return null;
}

// Detailed header row finder with column mapping
interface ColumnMapping {
  dateCol: string;
  amountCol: string;
  descriptionCol: string | null;
  bookedDateCol: string | null;
  currencyCol: string | null;
  merchantCol: string | null;
  headerRow: number;
  foundHeaders: string[];
}

interface HeadersOnlyResult {
  foundHeaders: string[];
}

/**
 * Find header row and map columns to known column names
 */
function findHeaderRowAndColumns(sheet: XLSX.WorkSheet): ColumnMapping | HeadersOnlyResult {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');

  const maxRow = Math.min(range.e.r, range.s.r + MAX_HEADER_SCAN_ROWS - 1);
  let bestHeaderRowHeaders: string[] = [];
  let bestHeaderScore = -1;

  for (let row = range.s.r; row <= maxRow; row++) {
    const rowValues = getRowValues(sheet, range, row);
    const headers = rowValues.map((value) => (value !== null && value !== undefined ? String(value).trim() : ''));

    const nonEmptyHeaders = headers.filter(h => h.length > 0);
    if (nonEmptyHeaders.length === 0) continue;

    const analysis = analyzeRowValues(rowValues);
    const headerMatchCount = headers.reduce((count, header) => {
      const normalized = normalizeHeaderValue(header);
      return normalized && ALL_NORMALIZED_HEADERS.has(normalized) ? count + 1 : count;
    }, 0);

    const looksLikeDataRow = analysis.dateCount > 0 && analysis.amountCount > 0;
    const isHeaderCandidate = analysis.nonEmptyCount >= 2 && analysis.textCount >= 1 && !looksLikeDataRow;
    const headerScore = headerMatchCount * 2 + analysis.textCount;

    if (isHeaderCandidate && headerScore > bestHeaderScore) {
      bestHeaderScore = headerScore;
      bestHeaderRowHeaders = nonEmptyHeaders;
    }

    const dateCol = findColumnName(headers, COLUMN_VARIATIONS.DATE);
    const amountCol = findColumnName(headers, COLUMN_VARIATIONS.AMOUNT);

    if (dateCol && amountCol && !looksLikeDataRow) {
      console.log(`[XLSX Parser] Found header row ${row}: Date="${dateCol}", Amount="${amountCol}"`);
      return {
        dateCol,
        amountCol,
        descriptionCol: findColumnName(headers, COLUMN_VARIATIONS.DESCRIPTION),
        bookedDateCol: findColumnName(headers, COLUMN_VARIATIONS.BOOKED_DATE),
        currencyCol: findColumnName(headers, COLUMN_VARIATIONS.CURRENCY),
        merchantCol: findColumnName(headers, COLUMN_VARIATIONS.MERCHANT),
        headerRow: row,
        foundHeaders: nonEmptyHeaders,
      };
    }

    if (isHeaderCandidate && (!dateCol || !amountCol)) {
      const dataMapping = detectColumnsFromData(sheet, { startRow: row + 1, maxRows: 20 });
      if (dataMapping) {
        console.log(`[XLSX Parser] Header row inferred at ${row} using data heuristics`);
        return {
          ...dataMapping,
          headerRow: row,
          foundHeaders: nonEmptyHeaders,
        };
      }
    }
  }

  console.log(`[XLSX Parser] No header row found. Best header-like row: [${bestHeaderRowHeaders.slice(0, 5).join(', ')}...]`);
  return { foundHeaders: bestHeaderRowHeaders };
}

/**
 * Analyze first few rows to detect column roles based on data types
 * Used for headerless files like some Storebrand exports
 */
function detectColumnsFromData(
  sheet: XLSX.WorkSheet,
  options?: { startRow?: number; maxRows?: number }
): ColumnMapping | null {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  const startRow = options?.startRow ?? range.s.r;
  const maxRows = options?.maxRows ?? 20;
  const endRow = Math.min(range.e.r, startRow + maxRows - 1);

  if (startRow > endRow) {
    return null;
  }

  console.log(`[XLSX Parser] Attempting headerless detection (rows ${startRow}-${endRow})...`);

  const columnAnalysis: Map<number, {
    dateCount: number;
    amountCount: number;
    textCount: number;
    currencyCount: number;
    samples: unknown[];
  }> = new Map();

  for (let row = startRow; row <= endRow; row++) {
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = sheet[cellRef];
      if (!cell || cell.v === undefined || cell.v === null || cell.v === '') continue;

      const value = cell.v;
      const analysis = columnAnalysis.get(col) || {
        dateCount: 0,
        amountCount: 0,
        textCount: 0,
        currencyCount: 0,
        samples: [],
      };

      if (analysis.samples.length < 3) {
        analysis.samples.push(value);
      }

      if (isLikelyDateValue(value)) {
        analysis.dateCount++;
      } else if (isLikelyAmountValue(value)) {
        analysis.amountCount++;
      } else if (isLikelyCurrencyValue(value)) {
        analysis.currencyCount++;
      } else if (isLikelyTextValue(value)) {
        analysis.textCount++;
      }

      columnAnalysis.set(col, analysis);
    }
  }

  let dateColIdx = -1;
  let amountColIdx = -1;
  let descColIdx = -1;
  let currencyColIdx = -1;

  const rowsAnalyzed = Math.max(1, endRow - startRow + 1);
  const minCount = Math.min(2, rowsAnalyzed);

  let maxDateScore = 0;
  for (const [col, analysis] of columnAnalysis) {
    const total = analysis.dateCount + analysis.amountCount + analysis.textCount + analysis.currencyCount;
    if (total === 0) continue;
    const dateScore = analysis.dateCount / total;
    if (analysis.dateCount >= minCount && dateScore >= 0.5 && dateScore > maxDateScore) {
      maxDateScore = dateScore;
      dateColIdx = col;
    }
  }

  let maxAmountScore = 0;
  for (const [col, analysis] of columnAnalysis) {
    if (col === dateColIdx) continue;
    const total = analysis.dateCount + analysis.amountCount + analysis.textCount + analysis.currencyCount;
    if (total === 0) continue;
    const amountScore = analysis.amountCount / total;
    if (analysis.amountCount >= minCount && amountScore >= 0.4 && amountScore > maxAmountScore) {
      maxAmountScore = amountScore;
      amountColIdx = col;
    }
  }

  let maxTextCount = 0;
  for (const [col, analysis] of columnAnalysis) {
    if (col === dateColIdx || col === amountColIdx) continue;
    if (analysis.textCount > maxTextCount) {
      maxTextCount = analysis.textCount;
      descColIdx = col;
    }
  }

  for (const [col, analysis] of columnAnalysis) {
    if (col === dateColIdx || col === amountColIdx || col === descColIdx) continue;
    const total = analysis.currencyCount + analysis.textCount + analysis.amountCount + analysis.dateCount;
    if (analysis.currencyCount >= minCount && (analysis.currencyCount / Math.max(total, 1)) >= 0.5) {
      currencyColIdx = col;
      break;
    }
  }

  for (const [col, analysis] of columnAnalysis) {
    console.log(`[XLSX Parser] Column ${col}: dates=${analysis.dateCount}, amounts=${analysis.amountCount}, text=${analysis.textCount}, currency=${analysis.currencyCount}, samples=${JSON.stringify(analysis.samples)}`);
  }

  if (dateColIdx >= 0 && amountColIdx >= 0) {
    console.log(`[XLSX Parser] Headerless file detected - Date col: ${dateColIdx}, Amount col: ${amountColIdx}, Desc col: ${descColIdx}, Currency col: ${currencyColIdx}`);
    return {
      dateCol: `__COL_${dateColIdx}`,
      amountCol: `__COL_${amountColIdx}`,
      descriptionCol: descColIdx >= 0 ? `__COL_${descColIdx}` : null,
      bookedDateCol: null,
      currencyCol: currencyColIdx >= 0 ? `__COL_${currencyColIdx}` : null,
      merchantCol: null,
      headerRow: -1,
      foundHeaders: [],
    };
  }

  console.log(`[XLSX Parser] Could not detect columns from data - no clear date+amount pattern`);
  return null;
}

/**
 * Parse XLSX file for headerless format (direct cell access)
 */
function parseHeaderlessFile(
  sheet: XLSX.WorkSheet,
  mapping: ColumnMapping,
  range: XLSX.Range,
  startRow: number = range.s.r
): ParsedXlsxTransaction[] {
  const transactions: ParsedXlsxTransaction[] = [];

  const dateColIdx = parseInt(mapping.dateCol.replace('__COL_', ''));
  const amountColIdx = parseInt(mapping.amountCol.replace('__COL_', ''));
  const descColIdx = mapping.descriptionCol ? parseInt(mapping.descriptionCol.replace('__COL_', '')) : -1;
  const currencyColIdx = mapping.currencyCol ? parseInt(mapping.currencyCol.replace('__COL_', '')) : -1;

  console.log(`[XLSX Parser] Parsing headerless file: rows ${startRow} to ${range.e.r}`);

  for (let row = startRow; row <= range.e.r; row++) {
    // Get cell values directly
    const dateCellRef = XLSX.utils.encode_cell({ r: row, c: dateColIdx });
    const amountCellRef = XLSX.utils.encode_cell({ r: row, c: amountColIdx });
    const dateCell = sheet[dateCellRef];
    const amountCell = sheet[amountCellRef];

    // Skip empty rows
    if (!dateCell || !amountCell) continue;

    // Parse date - pass the raw value which could be a number (Excel serial)
    const txDate = parseNorwegianDate(dateCell.v);
    if (!txDate) {
      console.log(`[XLSX Parser] Row ${row}: Invalid date value:`, dateCell.v);
      continue;
    }

    // Parse amount
    const amount = parseNorwegianAmount(amountCell.v);
    if (amount === null) {
      console.log(`[XLSX Parser] Row ${row}: Invalid amount value:`, amountCell.v);
      continue;
    }

    // Get description
    let descriptionStr = '';
    if (descColIdx >= 0) {
      const descCellRef = XLSX.utils.encode_cell({ r: row, c: descColIdx });
      const descCell = sheet[descCellRef];
      descriptionStr = descCell ? String(descCell.v || '').trim() : '';
    }

    // Get currency
    let currencyStr = 'NOK';
    if (currencyColIdx >= 0) {
      const currCellRef = XLSX.utils.encode_cell({ r: row, c: currencyColIdx });
      const currCell = sheet[currCellRef];
      currencyStr = currCell ? String(currCell.v || 'NOK').trim() : 'NOK';
    }

    // If no description, use a placeholder
    if (!descriptionStr) {
      descriptionStr = `Transaction ${txDate}`;
    }

    // Build raw JSON for debugging
    const rowData: Record<string, unknown> = {};
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = sheet[cellRef];
      if (cell) rowData[`col${col}`] = cell.v;
    }

    transactions.push({
      tx_date: txDate,
      description: descriptionStr,
      amount,
      currency: currencyStr,
      raw_json: JSON.stringify(rowData),
    });
  }

  console.log(`[XLSX Parser] Parsed ${transactions.length} transactions from headerless file`);
  return transactions;
}

/**
 * Parse XLSX file with headers (using sheet_to_json)
 */
function parseFileWithHeaders(
  sheet: XLSX.WorkSheet,
  mapping: ColumnMapping
): ParsedXlsxTransaction[] {
  const transactions: ParsedXlsxTransaction[] = [];

  // Use sheet_to_json starting from the header row
  const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    range: mapping.headerRow,
    defval: '',
  });

  console.log(`[XLSX Parser] Parsing file with headers: ${jsonData.length} data rows`);

  for (const row of jsonData) {
    // Get values using detected column names
    const txDateRaw = row[mapping.dateCol];
    const amountRaw = row[mapping.amountCol];

    // Optional columns - try mapped column or fallback to standard
    const bookedDateRaw = mapping.bookedDateCol ? row[mapping.bookedDateCol] : row[XLSX_COLUMNS.BOOKED_DATE];
    const description = mapping.descriptionCol
      ? row[mapping.descriptionCol]
      : row[XLSX_COLUMNS.DESCRIPTION] || row['Tekst'] || row['Beskrivelse'] || '';
    const currency = mapping.currencyCol ? row[mapping.currencyCol] : row[XLSX_COLUMNS.CURRENCY];
    const merchant = mapping.merchantCol ? row[mapping.merchantCol] : row[XLSX_COLUMNS.LOCATION];

    // Parse date (required) - pass raw value for Excel serial date handling
    const txDate = parseNorwegianDate(txDateRaw);
    if (!txDate) continue;

    // Parse amount (required)
    const amount = parseNorwegianAmount(amountRaw);
    if (amount === null) continue;

    // Parse optional fields
    const bookedDate = parseNorwegianDate(bookedDateRaw) || undefined;
    let descriptionStr = String(description || '').trim();
    const merchantStr = String(merchant || '').trim() || undefined;
    const currencyStr = String(currency || 'NOK').trim();

    // If no description column found, try to construct one from other columns
    if (!descriptionStr) {
      // Try using merchant as description if no dedicated description column
      if (merchantStr) {
        descriptionStr = merchantStr;
      } else {
        // Try any column that might contain text
        const possibleDescFields = ['Tekst', 'Melding', 'Forklaring', 'Transaksjon', 'Mottaker'];
        for (const field of possibleDescFields) {
          const val = row[field];
          if (val && String(val).trim()) {
            descriptionStr = String(val).trim();
            break;
          }
        }
      }
    }

    // Still no description? Skip this row
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

  console.log(`[XLSX Parser] Parsed ${transactions.length} transactions from file with headers`);
  return transactions;
}

/**
 * Main entry point: Parse XLSX file and extract transactions
 */
export function parseXlsxFile(arrayBuffer: ArrayBuffer): XlsxParseResult {
  try {
    // Read workbook, keeping dates as numbers to handle Excel serial dates
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
      return { transactions: [], error: 'No worksheet found in XLSX file' };
    }

    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
    console.log(`[XLSX Parser] Sheet "${sheetName}" range: ${sheet['!ref']}, rows: ${range.e.r - range.s.r + 1}`);

    // First try to find header row with known column names
    let mapping = findHeaderRowAndColumns(sheet);

    // If no headers found, try to detect columns from data patterns (headerless file)
    if (!('dateCol' in mapping)) {
      const dataMapping = detectColumnsFromData(sheet);
      if (dataMapping) {
        mapping = dataMapping;
      }
    }

    // If still no mapping, provide helpful error
    if (!('dateCol' in mapping)) {
      const headersFound = ('foundHeaders' in mapping) ? mapping.foundHeaders : [];
      const headersList = headersFound.length > 0
        ? `Headers found: [${headersFound.slice(0, 10).join(', ')}${headersFound.length > 10 ? '...' : ''}]`
        : 'No headers detected in first 20 rows';
      return {
        transactions: [],
        error: `Could not detect required columns (need Date + Amount). ${headersList}`,
        debugInfo: `All headers: ${JSON.stringify(headersFound)}`,
      };
    }

    const fullMapping = mapping as ColumnMapping;
    const usesIndexMapping = fullMapping.dateCol.startsWith('__COL_') || fullMapping.amountCol.startsWith('__COL_');
    const detectedFormat = usesIndexMapping
      ? `Index mapping - Date col: ${fullMapping.dateCol}, Amount col: ${fullMapping.amountCol}${fullMapping.headerRow >= 0 ? ` (header row ${fullMapping.headerRow + 1})` : ''}`
      : `Date: "${fullMapping.dateCol}", Amount: "${fullMapping.amountCol}"${fullMapping.descriptionCol ? `, Desc: "${fullMapping.descriptionCol}"` : ''}`;
    console.log(`[XLSX Parser] Detected format: ${detectedFormat}`);

    // Parse transactions based on file type
    let transactions: ParsedXlsxTransaction[];
    if (usesIndexMapping) {
      const startRow = fullMapping.headerRow >= 0 ? fullMapping.headerRow + 1 : range.s.r;
      transactions = parseHeaderlessFile(sheet, fullMapping, range, startRow);
    } else {
      transactions = parseFileWithHeaders(sheet, fullMapping);
    }

    if (transactions.length === 0) {
      return { transactions: [], error: 'No valid transactions found in XLSX file. Check that rows have dates and amounts.' };
    }

    return { transactions, detectedFormat };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[XLSX Parser] Error:`, err);
    return { transactions: [], error: `Failed to parse XLSX: ${message}` };
  }
}
