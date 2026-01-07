import {
  PDF_SECTION_PENDING,
  PDF_SECTION_BOOKED,
  type TransactionStatus,
} from '@expense/shared';

export interface ParsedPdfTransaction {
  tx_date: string;
  description: string;
  amount: number;
  status: TransactionStatus;
  raw_line: string;
}

export interface SkippedLine {
  line: string;
  reason: 'header' | 'section_marker' | 'page_number' | 'empty' | 'no_date' | 'no_amount' | 'parse_failed' | 'excluded_pattern';
  lineNumber: number;
}

export interface PdfParseResult {
  transactions: ParsedPdfTransaction[];
  error?: string;
  stats?: {
    totalLines: number;
    parsedCount: number;
    dateContainingLines: number;
    skippedCount: number;
  };
  skipped_lines?: SkippedLine[];
}

// Multiple regex patterns to handle different PDF text extraction formats
// Order matters - more specific patterns first
const TX_PATTERNS = [
  // Standard: DD.MM.YYYY  Description  -1 234,56
  /^(\d{2})\.(\d{2})\.(\d{4})\s+(.+?)\s+(-?\d[\d\s]*,\d{2})\s*$/,
  // Two dates (transaction + booked): DD.MM.YY DD.MM.YY Description Amount
  /^(\d{2})\.(\d{2})\.(\d{2,4})\s+\d{2}\.\d{2}\.\d{2,4}\s+(.+?)\s+(-?\d[\d\s]*,?\d*)\s*$/,
  // Date at start, amount with "kr" suffix: DD.MM.YYYY  Description  1 234,56 kr
  /^(\d{2})\.(\d{2})\.(\d{4})\s+(.+?)\s+(-?\d[\d\s]*,?\d*)\s*(?:kr)?\s*$/i,
  // Date at start, amount can have spaces: DD.MM.YY Description 1234,56
  /^(\d{2})\.(\d{2})\.(\d{2})\s+(.+?)\s+(-?\d[\d\s]*,\d{2})\s*$/,
  // Without decimals: DD.MM.YYYY  Description  -1234
  /^(\d{2})\.(\d{2})\.(\d{4})\s+(.+?)\s+(-?\d[\d\s]+)\s*$/,
  // Date with dashes: DD-MM-YYYY  Description  Amount
  /^(\d{2})-(\d{2})-(\d{4})\s+(.+?)\s+(-?\d[\d\s]*,?\d*)\s*$/,
  // Date with slashes: DD/MM/YYYY  Description  Amount
  /^(\d{2})\/(\d{2})\/(\d{4})\s+(.+?)\s+(-?\d[\d\s]*,?\d*)\s*$/,
  // Storebrand format: may have extra columns, be flexible
  /(\d{2})\.(\d{2})\.(\d{4})\s+(.{3,50}?)\s+(-?\d[\d\s]*[,.]?\d*)\s*$/,
  // Very flexible: date anywhere, description, amount at end
  /(\d{2})[.\-\/](\d{2})[.\-\/](\d{4})\s+(.+?)\s+(-?[\d\s]+[,.]?\d*)\s*$/,
  // Fallback for short year: DD.MM.YY Description Amount
  /(\d{2})\.(\d{2})\.(\d{2})\s+(.{3,}?)\s+(-?\d[\d\s]*,?\d*)\s*$/,
];

// Pattern to find dates in text
const DATE_PATTERN = /(\d{2})[.\-\/](\d{2})[.\-\/](\d{2,4})/g;

// Pattern to find amounts (Norwegian format: -1 234,56 or -1234.56 or 1234 kr)
const AMOUNT_PATTERN = /(-?\d[\d\s]*[,.]?\d{0,2})\s*(?:kr)?\s*$/i;

// Patterns for non-transaction content that should be skipped (not errors)
const HEADER_PATTERNS = [
  /^dato\s+/i,                          // Column header starting with "Dato"
  /^beskrivelse\s+/i,                   // "Beskrivelse" header
  /^beløp\s*$/i,                        // "Beløp" header
  /^inn\s+ut/i,                         // "Inn Ut" column headers
  /^transaksjonsdato/i,                 // Transaction date header
  /^bokførings?dato/i,                  // Booking date header
  /^konto.*?saldo/i,                    // Account saldo header
];

const PAGE_NUMBER_PATTERNS = [
  /^side\s+\d+\s*(av\s+\d+)?$/i,        // "Side 1 av 3" or "Side 1"
  /^\d+\s*(av|of)\s+\d+$/i,             // "1 av 3" or "1 of 3"
  /^page\s+\d+$/i,                      // "Page 1"
];

const EXCLUDED_PATTERNS = [
  /^(saldo|balance|sum|totalt?)\s*:?\s*[+-]?[\d\s,\.]+$/i,  // Balance/total lines
  /^utgående\s+saldo/i,                 // "Utgående saldo"
  /^inngående\s+saldo/i,                // "Inngående saldo"
  /^periode[:\s]/i,                     // "Periode: ..."
  /^kontonummer/i,                      // Account number
  /^bank\s*statement/i,                 // Bank statement header
  /^kontoutskrift/i,                    // Norwegian bank statement
  /^\d{4}\.\d{2}\.\d{5}$/,             // Account numbers like 1234.56.78901
];

function parseNorwegianAmount(amountStr: string): number {
  // Remove spaces (thousands separators)
  let cleaned = amountStr.replace(/\s/g, '');
  // Replace comma with dot for decimal
  cleaned = cleaned.replace(',', '.');
  return parseFloat(cleaned);
}

function parseNorwegianDate(day: string, month: string, year: string): string {
  // Handle 2-digit years
  let fullYear = year;
  if (year.length === 2) {
    const yearNum = parseInt(year, 10);
    fullYear = yearNum > 50 ? `19${year}` : `20${year}`;
  }
  return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/**
 * Classify why a line was skipped
 */
function classifySkippedLine(line: string): SkippedLine['reason'] {
  const trimmed = line.trim();

  // Empty or whitespace-only
  if (!trimmed) {
    return 'empty';
  }

  // Header patterns
  for (const pattern of HEADER_PATTERNS) {
    if (pattern.test(trimmed)) {
      return 'header';
    }
  }

  // Page number patterns
  for (const pattern of PAGE_NUMBER_PATTERNS) {
    if (pattern.test(trimmed)) {
      return 'page_number';
    }
  }

  // Excluded patterns (balance lines, totals, etc.)
  for (const pattern of EXCLUDED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return 'excluded_pattern';
    }
  }

  // Check if no date
  if (!/\d{2}[.\-\/]\d{2}[.\-\/]\d{2,4}/.test(trimmed)) {
    return 'no_date';
  }

  // Check if no amount-like number at end
  if (!AMOUNT_PATTERN.test(trimmed)) {
    return 'no_amount';
  }

  // Otherwise parsing failed for unknown reason
  return 'parse_failed';
}

function tryParseTransactionLine(line: string): { date: string; description: string; amount: number } | null {
  // Try each pattern
  for (const pattern of TX_PATTERNS) {
    const match = pattern.exec(line);
    if (match) {
      const [, day, month, year, description, amountStr] = match;
      const amount = parseNorwegianAmount(amountStr);
      if (!isNaN(amount) && description.trim().length > 0) {
        return {
          date: parseNorwegianDate(day, month, year),
          description: description.trim(),
          amount,
        };
      }
    }
  }

  // Fallback: try to find date and amount separately
  const dateMatch = DATE_PATTERN.exec(line);
  DATE_PATTERN.lastIndex = 0; // Reset regex state

  if (dateMatch) {
    const amountMatch = AMOUNT_PATTERN.exec(line);
    if (amountMatch) {
      const [, day, month, year] = dateMatch;
      const amount = parseNorwegianAmount(amountMatch[1]);

      if (!isNaN(amount)) {
        // Extract description (text between date and amount)
        const dateEndIdx = dateMatch.index + dateMatch[0].length;
        const amountStartIdx = amountMatch.index;
        const description = line.substring(dateEndIdx, amountStartIdx).trim();

        if (description.length > 0) {
          return {
            date: parseNorwegianDate(day, month, year),
            description,
            amount,
          };
        }
      }
    }
  }

  return null;
}

/**
 * Check if a line is a section marker (not an error, just navigation)
 */
function isSectionMarker(lineLower: string): boolean {
  return lineLower.includes(PDF_SECTION_PENDING.toLowerCase()) ||
    lineLower.includes('reservasjon') ||
    lineLower.includes(PDF_SECTION_BOOKED.toLowerCase()) ||
    lineLower.includes('kontobevegelse') ||
    lineLower.includes('transaksjoner') ||
    lineLower.includes('bevegelser');
}

export function parsePdfText(extractedText: string): PdfParseResult {
  // Check for section markers (case-insensitive)
  const textLower = extractedText.toLowerCase();
  const hasPending = textLower.includes(PDF_SECTION_PENDING.toLowerCase()) ||
    textLower.includes('reservasjon');
  const hasBooked = textLower.includes(PDF_SECTION_BOOKED.toLowerCase()) ||
    textLower.includes('kontobevegelse') ||
    textLower.includes('transaksjoner') ||
    textLower.includes('bevegelser') ||
    textLower.includes('saldo'); // Storebrand uses "saldo"

  if (!hasPending && !hasBooked) {
    return {
      transactions: [],
      error: 'Unrecognized PDF format: expected Reservasjoner or Kontobevegelser sections',
    };
  }

  const transactions: ParsedPdfTransaction[] = [];
  const skipped_lines: SkippedLine[] = [];

  // Split by newlines and also try splitting by multiple spaces (PDF text often lacks newlines)
  let lines = extractedText.split(/\n/).map(l => l.trim()).filter(Boolean);

  // If very few lines, the PDF might have all text on one "line" - try to split differently
  if (lines.length < 5) {
    // Try splitting on date patterns to find transaction boundaries
    lines = extractedText.split(/(?=\d{2}[.\-\/]\d{2}[.\-\/]\d{2,4})/).map(l => l.trim()).filter(Boolean);
  }

  let currentStatus: TransactionStatus = 'booked'; // Default to booked if no section marker before transactions
  let dateContainingLines = 0;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    const lineLower = line.toLowerCase();

    // Check for section markers
    if (isSectionMarker(lineLower)) {
      if (lineLower.includes(PDF_SECTION_PENDING.toLowerCase()) || lineLower.includes('reservasjon')) {
        currentStatus = 'pending';
      } else {
        currentStatus = 'booked';
      }
      skipped_lines.push({
        line: line.substring(0, 100), // Truncate long lines
        reason: 'section_marker',
        lineNumber: lineNum + 1,
      });
      continue;
    }

    // Check if line contains a date (for stats)
    if (/\d{2}[.\-\/]\d{2}[.\-\/]\d{2,4}/.test(line)) {
      dateContainingLines++;
    }

    // Try to parse as transaction line
    const parsed = tryParseTransactionLine(line);
    if (parsed) {
      transactions.push({
        tx_date: parsed.date,
        description: parsed.description,
        amount: parsed.amount,
        status: currentStatus,
        raw_line: line,
      });
    } else {
      // Classify why this line was skipped
      const reason = classifySkippedLine(line);

      // Only include in skipped_lines if it's not just empty/whitespace
      if (reason !== 'empty') {
        skipped_lines.push({
          line: line.substring(0, 100), // Truncate long lines
          reason,
          lineNumber: lineNum + 1,
        });
      }
    }
  }

  // Group skipped lines by reason for logging
  const reasonCounts = skipped_lines.reduce((acc, sl) => {
    acc[sl.reason] = (acc[sl.reason] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log(`[PDF Parser] Skipped line summary:`, JSON.stringify(reasonCounts));

  return {
    transactions,
    stats: {
      totalLines: lines.length,
      parsedCount: transactions.length,
      dateContainingLines,
      skippedCount: skipped_lines.length,
    },
    skipped_lines,
  };
}
