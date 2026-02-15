// Lightweight heuristics to identify internal transfers.
// This is intentionally conservative; users can always override via UI.

function normalizeForMatch(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/Ã¸/g, 'o')
    .replace(/Ã¦/g, 'ae')
    .replace(/Ã¥/g, 'a')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isStraksbetalingDescription(description: string | null | undefined): boolean {
  const d = normalizeForMatch(description);
  return d === 'straksbetaling' || d.startsWith('straksbetaling ');
}

export function isFelleskontoDescription(description: string | null | undefined): boolean {
  const d = normalizeForMatch(description);
  return d.includes('felleskonto');
}

const TRANSFER_PATTERNS: RegExp[] = [
  // Norwegian (Bokmal-ish)
  /\boverf(o|Ã¸)ring\b/i,
  /\btil\s+konto\b/i,
  /\bfra\s+konto\b/i,
  /\begen\s+konto\b/i,
  /\bmellom\s+egne\s+konti\b/i,
  /\binnskudd\b/i,
  /\butbetaling\s+til\s+egen\s+konto\b/i,
  /\bbetaling\s+av\s+kredittkort/i,
  /\bkredittkortregning\b/i,
  /\bgebyr\s+overfÃ¸rt\b/i,
  /\bseb\s+kort\b/i,
  /\bengangsfullmakt\b/i,
  /\bbetaling\s+med\s+engangsfullmakt\b/i,
  /\bkjÃ¸p\s+kron\b/i,
  /\bkron\s*-\s*uttak\b/i,

  // Transfers to people (common Norwegian names pattern)
  /^til\s+[A-ZÃ†Ã˜Ã…][a-zÃ¦Ã¸Ã¥]+$/i, // "Til Anja", "Til Per", etc.

  // Account number patterns (Norwegian format: XXXX.XX.XXXXX)
  /\b\d{4,5}\.\d{2}\.\d{5}\b/,
  /\b\d{10,11}\b/, // Account numbers without dots

  // English
  /\btransfer\b/i,
  /\bto\s+account\b/i,
  /\bfrom\s+account\b/i,
  /\binternal\s+transfer\b/i,
];

export function detectIsTransfer(description: string | null | undefined): boolean {
  const d = (description || '').trim();
  if (!d) return false;
  // Product decision: "Straksbetaling" must be treated as expense/income, never transfer.
  if (isStraksbetalingDescription(d)) return false;
  // Product decision: "Felleskonto" rows are real shared expenses, never transfers.
  if (isFelleskontoDescription(d)) return false;
  return TRANSFER_PATTERNS.some((re) => re.test(d));
}
