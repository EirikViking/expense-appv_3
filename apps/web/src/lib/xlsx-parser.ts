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

// Parse Norwegian date format DD.MM.YYYY to ISO YYYY-MM-DD
function parseNorwegianDate(dateStr: string): string | null {
  if (!dateStr) return null;

  // Convert Excel serial date to ISO string
  // Excel stores dates as number of days since 1900-01-01 (with a leap year bug)
  function excelSerialToDate(serial: number): string | null {
    if (serial < 1 || serial > 100000) return null; // Sanity check

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

  // Parse Norwegian date format DD.MM.YYYY to ISO YYYY-MM-DD
  // Also handles Excel serial date numbers
  function parseNorwegianDate(dateStr: string | number): string | null {
    if (typeof dateStr === 'number') {
      // This is likely an Excel serial date
      return excelSerialToDate(dateStr);
    }

    if (!dateStr) return null;

    // Handle both string and potential date objects from XLSX
    const str = String(dateStr).trim();

    // Check if it's a number (Excel serial date stored as string)
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

    return null;
  }

  // Parse Norwegian number format: comma as decimal, space as thousands
  function parseNorwegianAmount(value: unknown): number | null {
    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'string') {
      // Remove spaces (thousands separators), currency markers, and replace comma with dot
      const cleaned = value
        .trim()
        .replace(/\s/g, '')
        .replace(/(nok|kr)$/i, '')
        .replace(',', '.')
        .replace(/^\+/, '');
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
    foundHeaders: string[];
  }

  interface HeadersOnlyResult {
    foundHeaders: string[];
  }

  function findHeaderRowAndColumns(sheet: XLSX.WorkSheet): ColumnMapping | HeadersOnlyResult {
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');

    // Scan first 50 rows for header
    let lastRowHeaders: string[] = [];
    for (let row = range.s.r; row <= Math.min(range.e.r, 50); row++) {
      const headers: string[] = [];

      // Collect all headers in this row
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
        const cell = sheet[cellRef];
        headers.push(cell && cell.v ? String(cell.v).trim() : '');
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
    return { foundHeaders: lastRowHeaders };
  }

  // Try to detect column types from data (for headerless files)
  function detectColumnsFromData(sheet: XLSX.WorkSheet): ColumnMapping | null {
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
    const dateStringPattern = /^(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2})$/;
    const amountStringPattern = /^[+-]?\d[\d\s]*(?:[.,]\d{1,2})?(?:\s*(?:kr|nok))?$/i;

    // Look at first 5 rows to understand data patterns
    const columnTypes: Map<number, { hasDate: boolean; hasAmount: boolean; hasText: boolean }> = new Map();

    for (let row = range.s.r; row <= Math.min(range.e.r, 4); row++) {
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
        const cell = sheet[cellRef];
        if (!cell || cell.v === undefined || cell.v === null || cell.v === '') continue;

        const value = cell.v;
        const types = columnTypes.get(col) || { hasDate: false, hasAmount: false, hasText: false };

        // Check if it's an Excel serial date (number between 30000-60000 for 1982-2064)
        if (typeof value === 'number' && value > 30000 && value < 60000) {
          types.hasDate = true;
        }
        // Check if it's a monetary amount (negative number or small positive)
        else if (typeof value === 'number' && (value < 0 || (value > 0 && value < 100000))) {
          types.hasAmount = true;
        } else if (typeof value === 'string') {
          const trimmed = value.trim();
          const numericValue = parseFloat(trimmed.replace(',', '.'));

          if (dateStringPattern.test(trimmed) || (numericValue > 30000 && numericValue < 100000)) {
            types.hasDate = true;
          } else if (amountStringPattern.test(trimmed)) {
            types.hasAmount = true;
          } else if (trimmed.length > 2) {
            types.hasText = true;
          }
        }

        columnTypes.set(col, types);
      }
    }

    // Find columns by type
    let dateColIdx = -1;
    let amountColIdx = -1;
    let descColIdx = -1;
    let currencyColIdx = -1;

    for (const [col, types] of columnTypes) {
      if (types.hasDate && dateColIdx === -1) dateColIdx = col;
      else if (types.hasAmount && amountColIdx === -1) amountColIdx = col;
      else if (types.hasText && descColIdx === -1) descColIdx = col;
    }

    // Check for currency column (usually contains "NOK" or similar)
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
      const cell = sheet[cellRef];
      if (cell && typeof cell.v === 'string' && /^[A-Z]{3}$/.test(cell.v.trim())) {
        currencyColIdx = col;
        break;
      }
    }

    if (dateColIdx >= 0 && amountColIdx >= 0) {
      console.log(`[XLSX Parser] Headerless file detected. Date col: ${dateColIdx}, Amount col: ${amountColIdx}, Desc col: ${descColIdx}`);
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

    return null;
  }

  export function parseXlsxFile(arrayBuffer: ArrayBuffer): XlsxParseResult {
    try {
      const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false }); // Keep dates as numbers
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      if (!sheet) {
        return { transactions: [], error: 'No worksheet found in XLSX file' };
      }

      // First try to find header row
      let mapping = findHeaderRowAndColumns(sheet);

      // If no headers found, try to detect columns from data patterns
      if (!mapping || !('dateCol' in mapping)) {
        const dataMapping = detectColumnsFromData(sheet);
        if (dataMapping) {
          mapping = dataMapping;
        }
      }

      if (!mapping || !('dateCol' in mapping)) {
        // Provide helpful error with headers found
        const headersFound = (mapping && 'foundHeaders' in mapping) ? mapping.foundHeaders : [];
        const headersList = headersFound.length > 0
          ? `Headers found: [${headersFound.slice(0, 10).join(', ')}${headersFound.length > 10 ? '...' : ''}]`
          : 'No headers detected in first 50 rows';
        return {
          transactions: [],
          error: `Could not detect required columns (need Date + Amount). ${headersList}`,
          debugInfo: `All headers: ${JSON.stringify(headersFound)}`,
        };
      }

      const isHeaderless = mapping.headerRow === -1;
      const detectedFormat = isHeaderless
        ? `Headerless file - Date col: ${mapping.dateCol}, Amount col: ${mapping.amountCol}`
        : `Date: "${mapping.dateCol}", Amount: "${mapping.amountCol}"${mapping.descriptionCol ? `, Desc: "${mapping.descriptionCol}"` : ''}`;
      console.log(`[XLSX Parser] Detected format: ${detectedFormat}`);

      // Parse sheet data
      const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
      const startRow = isHeaderless ? range.s.r : mapping.headerRow + 1;

      const transactions: ParsedXlsxTransaction[] = [];

      if (isHeaderless) {
        // For headerless files, read cells directly using column indices
        const dateColIdx = parseInt(mapping.dateCol.replace('__COL_', ''));
        const amountColIdx = parseInt(mapping.amountCol.replace('__COL_', ''));
        const descColIdx = mapping.descriptionCol ? parseInt(mapping.descriptionCol.replace('__COL_', '')) : -1;
        const currencyColIdx = mapping.currencyCol ? parseInt(mapping.currencyCol.replace('__COL_', '')) : -1;

        for (let row = startRow; row <= range.e.r; row++) {
          // Get cell values directly
          const dateCellRef = XLSX.utils.encode_cell({ r: row, c: dateColIdx });
          const amountCellRef = XLSX.utils.encode_cell({ r: row, c: amountColIdx });
          const dateCell = sheet[dateCellRef];
          const amountCell = sheet[amountCellRef];

          if (!dateCell || !amountCell) continue;

          // Parse date - pass the raw value which could be a number
          const txDate = parseNorwegianDate(dateCell.v);
          if (!txDate) continue;

          // Parse amount
          const amount = parseNorwegianAmount(amountCell.v);
          if (amount === null) continue;

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
      } else {
        // For files with headers, use sheet_to_json
        const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
          range: mapping.headerRow,
          defval: '',
        });

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
          const txDate = parseNorwegianDate(txDateRaw as string | number);
          if (!txDate) continue;

          // Parse amount (required)
          const amount = parseNorwegianAmount(amountRaw);
          if (amount === null) continue;

          // Parse optional fields
          const bookedDate = parseNorwegianDate(bookedDateRaw as string | number) || undefined;
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
