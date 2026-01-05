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

// Multiple regex patterns to handle different PDF text extraction formats
const TX_PATTERNS = [
  // Standard: DD.MM.YYYY  Description  -1 234,56
  /(\d{2})\.(\d{2})\.(\d{4})\s+(.+?)\s+(-?\d[\d\s]*,\d{2})\s*$/,
  // Without decimals: DD.MM.YYYY  Description  -1234
  /(\d{2})\.(\d{2})\.(\d{4})\s+(.+?)\s+(-?\d[\d\s]+)\s*$/,
  // With NOK prefix: DD.MM.YYYY  Description  NOK -1 234,56
  /(\d{2})\.(\d{2})\.(\d{4})\s+(.+?)\s+(?:NOK\s*)?(-?\d[\d\s]*,?\d*)\s*$/,
  // Flexible: date anywhere, amount at end
  /(\d{2})[\.\-\/](\d{2})[\.\-\/](\d{4})\s+(.+?)\s+(-?[\d\s]+[,.]?\d*)\s*$/,
];

// Pattern to find dates in text
const DATE_PATTERN = /(\d{2})[\.\-\/](\d{2})[\.\-\/](\d{2,4})/g;

// Pattern to find amounts (Norwegian format: -1 234,56 or -1234.56)
const AMOUNT_PATTERN = /(-?\d[\d\s]*[,\.]\d{2}|-?\d+)\s*$/;

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
        let description = line.substring(dateEndIdx, amountStartIdx).trim();

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

export function parsePdfText(extractedText: string): {
  transactions: ParsedPdfTransaction[];
  error?: string;
} {
  // Check for section markers (case-insensitive)
  const textLower = extractedText.toLowerCase();
  const hasPending = textLower.includes(PDF_SECTION_PENDING.toLowerCase()) ||
                     textLower.includes('reservasjon');
  const hasBooked = textLower.includes(PDF_SECTION_BOOKED.toLowerCase()) ||
                    textLower.includes('kontobevegelse') ||
                    textLower.includes('transaksjoner') ||
                    textLower.includes('bevegelser');

  if (!hasPending && !hasBooked) {
    return {
      transactions: [],
      error: 'Unrecognized PDF format: expected Reservasjoner or Kontobevegelser sections',
    };
  }

  const transactions: ParsedPdfTransaction[] = [];

  // Split by newlines and also try splitting by multiple spaces (PDF text often lacks newlines)
  let lines = extractedText.split(/\n/).map(l => l.trim()).filter(Boolean);

  // If very few lines, the PDF might have all text on one "line" - try to split differently
  if (lines.length < 5) {
    // Try splitting on date patterns to find transaction boundaries
    lines = extractedText.split(/(?=\d{2}[\.\-\/]\d{2}[\.\-\/]\d{2,4})/).map(l => l.trim()).filter(Boolean);
  }

  let currentStatus: TransactionStatus = 'booked'; // Default to booked if no section marker before transactions

  for (const line of lines) {
    const lineLower = line.toLowerCase();

    // Check for section markers
    if (lineLower.includes(PDF_SECTION_PENDING.toLowerCase()) || lineLower.includes('reservasjon')) {
      currentStatus = 'pending';
      continue;
    }
    if (lineLower.includes(PDF_SECTION_BOOKED.toLowerCase()) ||
        lineLower.includes('kontobevegelse') ||
        lineLower.includes('transaksjoner')) {
      currentStatus = 'booked';
      continue;
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
    }
  }

  return { transactions };
}
