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
    // Remove spaces (thousands separators) and replace comma with dot
    const cleaned = value.trim().replace(/\s/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  return null;
}

/**
 * Find which column name matches any of the variations
 */
function findColumnName(headers: string[], variations: string[]): string | null {
  const normalizedVariations = variations.map(v => v.toLowerCase());

  for (const header of headers) {
    const normalized = header.toLowerCase().trim();
    if (normalizedVariations.includes(normalized)) {
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

  // Scan first 20 rows for header
  let lastRowHeaders: string[] = [];
  for (let row = range.s.r; row <= Math.min(range.e.r, 20); row++) {
    const headers: string[] = [];

    // Collect all cell values in this row
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = sheet[cellRef];
      headers.push(cell && cell.v !== undefined && cell.v !== null ? String(cell.v).trim() : '');
    }

    // Keep track of non-empty headers for debug
    const nonEmptyHeaders = headers.filter(h => h.length > 0);
    if (nonEmptyHeaders.length > lastRowHeaders.length) {
      lastRowHeaders = nonEmptyHeaders;
    }

    // Try to find required columns
    const dateCol = findColumnName(headers, COLUMN_VARIATIONS.DATE);
    const amountCol = findColumnName(headers, COLUMN_VARIATIONS.AMOUNT);

    // We need at least date and amount columns
    if (dateCol && amountCol) {
      console.log(`[XLSX Parser] Found header row ${row}: Date="${dateCol}", Amount="${amountCol}"`);
      return {
        dateCol,
        amountCol,
        descriptionCol: findColumnName(headers, COLUMN_VARIATIONS.DESCRIPTION),
        bookedDateCol: findColumnName(headers, COLUMN_VARIATIONS.BOOKED_DATE),
        currencyCol: findColumnName(headers, COLUMN_VARIATIONS.CURRENCY),
        merchantCol: findColumnName(headers, COLUMN_VARIATIONS.MERCHANT),
        headerRow: row,
        foundHeaders: headers.filter(h => h.length > 0),
      };
    }
  }

  // Return the best row of headers we found for debugging
  console.log(`[XLSX Parser] No header row found. Best row headers: [${lastRowHeaders.slice(0, 5).join(', ')}...]`);
  return { foundHeaders: lastRowHeaders };
}

/**
 * Analyze first few rows to detect column roles based on data types
 * Used for headerless files like some Storebrand exports
 */
function detectColumnsFromData(sheet: XLSX.WorkSheet): ColumnMapping | null {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');

  console.log(`[XLSX Parser] Attempting headerless detection...`);

  // Track what types of data appear in each column
  const columnAnalysis: Map<number, {
    dateCount: number;
    amountCount: number;
    textCount: number;
    currencyCount: number;
    samples: unknown[];
  }> = new Map();

  // Analyze first 10 rows (or all rows if less than 10)
  const maxRows = Math.min(range.e.r, 9);
  for (let row = range.s.r; row <= maxRows; row++) {
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

      // Keep samples for debugging
      if (analysis.samples.length < 3) {
        analysis.samples.push(value);
      }

      // Detect date: Excel serial number in typical range for dates (1990-2050)
      if (typeof value === 'number' && value > 30000 && value < 60000) {
        analysis.dateCount++;
      }
      // Detect amount: any number that's not a date-like serial
      else if (typeof value === 'number' && (value < 0 || (value > 0 && value < 30000))) {
        analysis.amountCount++;
      }
      // Detect currency code (3-letter uppercase)
      else if (typeof value === 'string' && /^[A-Z]{3}$/.test(value.trim())) {
        analysis.currencyCount++;
      }
      // Detect text (description)
      else if (typeof value === 'string' && value.trim().length > 2) {
        analysis.textCount++;
      }

      columnAnalysis.set(col, analysis);
    }
  }

  // Find best column for each role
  let dateColIdx = -1;
  let amountColIdx = -1;
  let descColIdx = -1;
  let currencyColIdx = -1;

  // Find the column most likely to be dates (highest dateCount and majority are dates)
  let maxDateScore = 0;
  for (const [col, analysis] of columnAnalysis) {
    const total = analysis.dateCount + analysis.amountCount + analysis.textCount + analysis.currencyCount;
    const dateScore = analysis.dateCount / Math.max(total, 1);
    if (analysis.dateCount >= 2 && dateScore > maxDateScore) {
      maxDateScore = dateScore;
      dateColIdx = col;
    }
  }

  // Find the column most likely to be amounts
  let maxAmountScore = 0;
  for (const [col, analysis] of columnAnalysis) {
    if (col === dateColIdx) continue; // Skip if already assigned to date
    const total = analysis.dateCount + analysis.amountCount + analysis.textCount + analysis.currencyCount;
    const amountScore = analysis.amountCount / Math.max(total, 1);
    if (analysis.amountCount >= 2 && amountScore > maxAmountScore) {
      maxAmountScore = amountScore;
      amountColIdx = col;
    }
  }

  // Find description column (most text)
  let maxTextCount = 0;
  for (const [col, analysis] of columnAnalysis) {
    if (col === dateColIdx || col === amountColIdx) continue;
    if (analysis.textCount > maxTextCount) {
      maxTextCount = analysis.textCount;
      descColIdx = col;
    }
  }

  // Find currency column
  for (const [col, analysis] of columnAnalysis) {
    if (col === dateColIdx || col === amountColIdx || col === descColIdx) continue;
    if (analysis.currencyCount >= 2) {
      currencyColIdx = col;
      break;
    }
  }

  // Log analysis results
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
      headerRow: -1, // No header row
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
  range: XLSX.Range
): ParsedXlsxTransaction[] {
  const transactions: ParsedXlsxTransaction[] = [];

  const dateColIdx = parseInt(mapping.dateCol.replace('__COL_', ''));
  const amountColIdx = parseInt(mapping.amountCol.replace('__COL_', ''));
  const descColIdx = mapping.descriptionCol ? parseInt(mapping.descriptionCol.replace('__COL_', '')) : -1;
  const currencyColIdx = mapping.currencyCol ? parseInt(mapping.currencyCol.replace('__COL_', '')) : -1;

  console.log(`[XLSX Parser] Parsing headerless file: rows ${range.s.r} to ${range.e.r}`);

  for (let row = range.s.r; row <= range.e.r; row++) {
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
    const isHeaderless = fullMapping.headerRow === -1;
    const detectedFormat = isHeaderless
      ? `Headerless file - Date col: ${fullMapping.dateCol}, Amount col: ${fullMapping.amountCol}`
      : `Date: "${fullMapping.dateCol}", Amount: "${fullMapping.amountCol}"${fullMapping.descriptionCol ? `, Desc: "${fullMapping.descriptionCol}"` : ''}`;
    console.log(`[XLSX Parser] Detected format: ${detectedFormat}`);

    // Parse transactions based on file type
    let transactions: ParsedXlsxTransaction[];
    if (isHeaderless) {
      transactions = parseHeaderlessFile(sheet, fullMapping, range);
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
