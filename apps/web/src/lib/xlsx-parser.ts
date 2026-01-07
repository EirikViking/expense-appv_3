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
}

// Possible column name variations for different Norwegian banks
const COLUMN_VARIATIONS = {
  DATE: ['Dato', 'Transaksjonsdato', 'Bokføringsdato', 'Date', 'Utført dato', 'Valuteringsdato', 'Handledato'],
  BOOKED_DATE: ['Bokført', 'Bokført dato', 'Regnskapsdato', 'Rentedato', 'Booked date'],
  DESCRIPTION: ['Spesifikasjon', 'Beskrivelse', 'Tekst', 'Forklaring', 'Melding', 'Description', 'Transaksjonstekst', 'Transaksjon'],
  AMOUNT: ['Beløp', 'Sum', 'Kroner', 'Amount', 'Inn/Ut', 'Ut', 'Inn', 'Transaksjonsbeløp', 'NOK'],
  CURRENCY: ['Valuta', 'Currency', 'Valutakode'],
  MERCHANT: ['Sted', 'Mottaker', 'Avsender', 'Fra/Til', 'Recipient', 'Location'],
};

// Parse Norwegian date format DD.MM.YYYY to ISO YYYY-MM-DD
function parseNorwegianDate(dateStr: string): string | null {
  if (!dateStr) return null;

  // Handle both string and potential date objects from XLSX
  const str = String(dateStr).trim();

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

// Find which column name matches any of the variations
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
}

function findHeaderRowAndColumns(sheet: XLSX.WorkSheet): ColumnMapping | null {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');

  // Scan first 20 rows for header
  for (let row = range.s.r; row <= Math.min(range.e.r, 20); row++) {
    const headers: string[] = [];

    // Collect all headers in this row
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = sheet[cellRef];
      headers.push(cell && cell.v ? String(cell.v).trim() : '');
    }

    // Try to find required columns
    const dateCol = findColumnName(headers, COLUMN_VARIATIONS.DATE);
    const amountCol = findColumnName(headers, COLUMN_VARIATIONS.AMOUNT);

    // We need at least date and amount columns
    if (dateCol && amountCol) {
      return {
        dateCol,
        amountCol,
        descriptionCol: findColumnName(headers, COLUMN_VARIATIONS.DESCRIPTION),
        bookedDateCol: findColumnName(headers, COLUMN_VARIATIONS.BOOKED_DATE),
        currencyCol: findColumnName(headers, COLUMN_VARIATIONS.CURRENCY),
        merchantCol: findColumnName(headers, COLUMN_VARIATIONS.MERCHANT),
        headerRow: row,
      };
    }
  }

  return null;
}

export function parseXlsxFile(arrayBuffer: ArrayBuffer): XlsxParseResult {
  try {
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
      return { transactions: [], error: 'No worksheet found in XLSX file' };
    }

    // Find the header row and column mapping
    const mapping = findHeaderRowAndColumns(sheet);
    if (!mapping) {
      // Provide helpful error with what we're looking for
      return {
        transactions: [],
        error: `Could not detect column headers. Looking for date column (${COLUMN_VARIATIONS.DATE.slice(0, 3).join(', ')}...) and amount column (${COLUMN_VARIATIONS.AMOUNT.slice(0, 3).join(', ')}...). Please check your file format.`
      };
    }

    const detectedFormat = `Date: "${mapping.dateCol}", Amount: "${mapping.amountCol}"${mapping.descriptionCol ? `, Desc: "${mapping.descriptionCol}"` : ''}`;
    console.log(`[XLSX Parser] Detected format: ${detectedFormat} at row ${mapping.headerRow + 1}`);

    // Parse as JSON starting from header row
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      range: mapping.headerRow,
      defval: '',
    });

    const transactions: ParsedXlsxTransaction[] = [];

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

      // Parse date (required)
      const txDate = parseNorwegianDate(String(txDateRaw || ''));
      if (!txDate) continue;

      // Parse amount (required)
      const amount = parseNorwegianAmount(amountRaw);
      if (amount === null) continue;

      // Parse optional fields
      const bookedDate = parseNorwegianDate(String(bookedDateRaw || '')) || undefined;
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

    if (transactions.length === 0) {
      return { transactions: [], error: 'No valid transactions found in XLSX file. Check that rows have dates and amounts.' };
    }

    return { transactions, detectedFormat };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { transactions: [], error: `Failed to parse XLSX: ${message}` };
  }
}

