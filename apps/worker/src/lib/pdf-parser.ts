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
  tokens?: string[];
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
  /^(\d{2})\.(\d{2})\.(\d{2,4})\s+(\d{2})\.(\d{2})\.(\d{2,4})\s+(.+?)\s+(-?\d[\d\s]*,?\d*)\s*$/,
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
const INLINE_DATE_PATTERN = /\d{2}[.\-\/]\d{2}[.\-\/]\d{2,4}/;

// Patterns to find amounts.
// Important: be strict enough to not accidentally treat years (e.g. 2026) as amounts.
const MONEY_DECIMAL_ANYWHERE_PATTERN = /-?\d[\d\s\u00A0]*[,.]\d{2}\s*(?:kr|nok)?/gi;
// Integer amounts are only accepted if they look like actual money (negative sign or explicit currency).
const MONEY_NEGATIVE_INT_AT_END_PATTERN = /-\d[\d\s\u00A0]*\s*$/i;
const MONEY_INT_WITH_CURRENCY_AT_END_PATTERN = /-?\d[\d\s\u00A0]*\s*(?:kr|nok)\s*$/i;

const DATE_TOKEN_PATTERN = /\b\d{2}[.\-\/]\d{2}[.\-\/]\d{2,4}\b/g;
const ISO_DATE_TOKEN_PATTERN = /\b\d{4}-\d{2}-\d{2}\b/g;

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
  let cleaned = amountStr.replace(/\s|\u00A0/g, '');
  // Replace comma with dot for decimal
  cleaned = cleaned.replace(',', '.');
  cleaned = cleaned.replace(/(kr|nok)$/i, '');
  return parseFloat(cleaned);
}

function stripDateTokens(text: string): string {
  return text
    .replace(DATE_TOKEN_PATTERN, ' ')
    .replace(ISO_DATE_TOKEN_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function descriptionHasLetters(description: string): boolean {
  return /[A-Za-zÆØÅæøå]/.test(description);
}

function getYearFromIsoDate(isoDate: string): number | null {
  const m = /^(\d{4})-\d{2}-\d{2}$/.exec(isoDate);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  return Number.isFinite(y) ? y : null;
}

export function extractPdfAmountFromLine(line: string): { amount: number; raw: string } | null {
  const stripped = stripDateTokens(line);

  // Prefer decimal amounts anywhere, but take the last one (statements usually place the amount at the end).
  MONEY_DECIMAL_ANYWHERE_PATTERN.lastIndex = 0;
  const decimalMatches = [...stripped.matchAll(MONEY_DECIMAL_ANYWHERE_PATTERN)];
  if (decimalMatches.length > 0) {
    const raw = decimalMatches[decimalMatches.length - 1][0];
    const amount = parseNorwegianAmount(raw);
    if (!Number.isFinite(amount)) return null;
    return { amount, raw };
  }

  // Fallback: integer amounts are only accepted if they look like money.
  // 1) explicit currency at the end (e.g. "1234 kr")
  if (MONEY_INT_WITH_CURRENCY_AT_END_PATTERN.test(stripped)) {
    const parts = stripped.split(/\s+/);
    const lastTwo = parts.slice(-2).join(' ');
    const amount = parseNorwegianAmount(lastTwo);
    if (Number.isFinite(amount)) {
      const isoDate = parseNorwegianDateFromLine(line);
      const year = isoDate ? getYearFromIsoDate(isoDate) : null;
      if (amount >= 1900 && amount <= 2100 && year !== null && year === amount) {
        return null;
      }
      return { amount, raw: lastTwo };
    }
  }

  // 2) negative integer at the end (e.g. "-1234")
  if (MONEY_NEGATIVE_INT_AT_END_PATTERN.test(stripped)) {
    const lastToken = stripped.split(/\s+/).slice(-1)[0];
    const amount = parseNorwegianAmount(lastToken);
    if (!Number.isFinite(amount)) return null;

    // Safety guard: if this "amount" is a year and the line has a date with the same year, reject it.
    const isoDate = parseNorwegianDateFromLine(line);
    const year = isoDate ? getYearFromIsoDate(isoDate) : null;
    if (amount >= 1900 && amount <= 2100 && year !== null && year === amount) {
      return null;
    }

    return { amount, raw: lastToken };
  }

  return null;
}

function parseNorwegianDate(day: string, month: string, year: string): string | null {
  const dayNum = parseInt(day, 10);
  const monthNum = parseInt(month, 10);

  if (!Number.isFinite(dayNum) || !Number.isFinite(monthNum)) return null;
  if (monthNum < 1 || monthNum > 12) return null;
  if (dayNum < 1 || dayNum > 31) return null;

  // Handle 2-digit years
  let fullYear = year;
  if (year.length === 2) {
    const yearNum = parseInt(year, 10);
    fullYear = yearNum > 50 ? `19${year}` : `20${year}`;
  }

  const yearNum = parseInt(fullYear, 10);
  if (!Number.isFinite(yearNum)) return null;

  // Guard rails: avoid poisoning analytics with impossible years/dates.
  const currentYear = new Date().getFullYear();
  if (yearNum < 1990 || yearNum > currentYear + 1) return null;

  const d = new Date(Date.UTC(yearNum, monthNum - 1, dayNum));
  if (
    d.getUTCFullYear() !== yearNum ||
    d.getUTCMonth() !== monthNum - 1 ||
    d.getUTCDate() !== dayNum
  ) {
    return null;
  }

  return `${String(yearNum)}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
}

function parseNorwegianDateFromLine(line: string): string | null {
  DATE_PATTERN.lastIndex = 0;
  const m = DATE_PATTERN.exec(line);
  if (!m) return null;
  const [, day, month, year] = m;
  return parseNorwegianDate(day, month, year);
}

function tokenizeLine(line: string): string[] {
  return line.trim().split(/\s+/).filter(Boolean).slice(0, 8);
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

  // Check if no amount-like number
  if (!extractPdfAmountFromLine(trimmed)) {
    return 'no_amount';
  }

  // Otherwise parsing failed for unknown reason
  return 'parse_failed';
}

function tryParseTransactionLine(line: string): { date: string; description: string; amount: number } | null {
  const amountRes = extractPdfAmountFromLine(line);
  if (!amountRes) return null;

  // Try each pattern
  for (const pattern of TX_PATTERNS) {
    const match = pattern.exec(line);
    if (match) {
      if (match.length === 6) {
        const [, day, month, year, description] = match;
        const date = parseNorwegianDate(day, month, year);
        const desc = description.trim();
        if (date && desc.length > 0 && descriptionHasLetters(desc)) {
          return {
            date,
            description: desc,
            amount: amountRes.amount,
          };
        }
      }

      // Two dates (transaction + booked): fall back to the second date if the first is invalid.
      if (match.length === 9) {
        const [, d1, m1, y1, d2, m2, y2, description] = match;
        const date = parseNorwegianDate(d1, m1, y1) ?? parseNorwegianDate(d2, m2, y2);
        const desc = description.trim();
        if (date && desc.length > 0 && descriptionHasLetters(desc)) {
          return {
            date,
            description: desc,
            amount: amountRes.amount,
          };
        }
      }
    }
  }

  // Fallback: try to find date and amount separately
  DATE_PATTERN.lastIndex = 0; // Reset regex state
  let dateMatch: RegExpExecArray | null;
  // Try all date-like matches and pick the first one that yields a valid ISO date.
  while ((dateMatch = DATE_PATTERN.exec(line))) {
    const [, day, month, year] = dateMatch;
    const date = parseNorwegianDate(day, month, year);
    if (!date) continue;

    // Best-effort description: remove date tokens and money tokens from the line.
    // We keep this conservative to avoid parsing garbage like date-only lines.
    let description = stripDateTokens(line);
    MONEY_DECIMAL_ANYWHERE_PATTERN.lastIndex = 0;
    description = description.replace(MONEY_DECIMAL_ANYWHERE_PATTERN, ' ');
    description = description.replace(/-?\d[\d\s\u00A0]*\s*(?:kr|nok)\b/gi, ' ');
    description = description.replace(/-\d[\d\s\u00A0]*\b/g, ' ');
    description = description.replace(/\s+/g, ' ').trim();

    if (description.length > 0 && descriptionHasLetters(description)) {
      return {
        date,
        description,
        amount: amountRes.amount,
      };
    }
  }

  return null;
}

export function parsePdfTransactionLine(line: string): { date: string; description: string; amount: number } | null {
  return tryParseTransactionLine(line);
}

function stripMoneyTokens(text: string): string {
  // Remove typical money tokens ("-123,45", "123,45 kr", "-1234 nok") so merchant extraction can work.
  MONEY_DECIMAL_ANYWHERE_PATTERN.lastIndex = 0;
  return text
    .replace(MONEY_DECIMAL_ANYWHERE_PATTERN, ' ')
    .replace(/-?\d[\d\s\u00A0]*\s*(?:kr|nok)\b/gi, ' ')
    .replace(MONEY_NEGATIVE_INT_AT_END_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Best-effort merchant extraction from a PDF raw line.
 *
 * Many Norwegian statements include "Butikk ..." (store/merchant) on the same or wrapped line.
 * We extract that when present; otherwise we fall back to the parsed description.
 */
export function extractMerchantFromPdfLine(line: string): string | null {
  const raw = String(line || '').replace(/\s+/g, ' ').trim();
  if (!raw) return null;

  // Prefer explicit "Butikk" marker if present.
  const butikkMatch = raw.match(/\bButikk\b\s*:?\s*(.+)$/i);
  if (butikkMatch?.[1]) {
    let merchant = stripMoneyTokens(stripDateTokens(butikkMatch[1]));
    merchant = merchant.replace(/^[:\-–]\s*/, '').trim();
    if (merchant && descriptionHasLetters(merchant) && !/^\d+([.,]\d+)?$/.test(merchant)) return merchant;
  }

  const parsed = tryParseTransactionLine(raw);
  if (parsed?.description) {
    const candidate = parsed.description.trim();
    if (candidate && descriptionHasLetters(candidate) && !/^\d+([.,]\d+)?$/.test(candidate)) return candidate;
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

function isNonTransactionLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;

  const lineLower = trimmed.toLowerCase();
  if (isSectionMarker(lineLower)) return true;

  for (const pattern of HEADER_PATTERNS) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }

  for (const pattern of PAGE_NUMBER_PATTERNS) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }

  for (const pattern of EXCLUDED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }

  return false;
}

function mergeWrappedLines(lines: string[]): string[] {
  const merged: string[] = [];
  let buffer: string | null = null;

  const flushBuffer = () => {
    if (buffer) {
      merged.push(buffer);
      buffer = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const hasDate = INLINE_DATE_PATTERN.test(line);
    const hasAmount = Boolean(extractPdfAmountFromLine(line));

    if (buffer) {
      if (hasDate) {
        flushBuffer();
        if (hasDate && !hasAmount) {
          buffer = line;
          continue;
        }
        merged.push(line);
        continue;
      }

      if (isNonTransactionLine(line)) {
        flushBuffer();
        merged.push(line);
        continue;
      }

      const candidate = `${buffer} ${line}`.replace(/\s+/g, ' ').trim();
      if (extractPdfAmountFromLine(candidate)) {
        merged.push(candidate);
        buffer = null;
      } else {
        buffer = candidate;
      }
      continue;
    }

    if (hasDate && !hasAmount) {
      buffer = line;
      continue;
    }

    merged.push(line);
  }

  flushBuffer();
  return merged;
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
  lines = mergeWrappedLines(lines);

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
        tokens: tokenizeLine(line),
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
          tokens: tokenizeLine(line),
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
