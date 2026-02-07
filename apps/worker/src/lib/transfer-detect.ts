// Lightweight heuristics to identify internal transfers.
// This is intentionally conservative; users can always override via UI.

const TRANSFER_PATTERNS: RegExp[] = [
  // Norwegian (Bokmal-ish)
  /\boverf(o|ø)ring\b/i,
  /\btil\s+konto\b/i,
  /\bfra\s+konto\b/i,
  /\begen\s+konto\b/i,
  /\bmellom\s+egne\s+konti\b/i,
  /\binnskudd\b/i,
  /\butbetaling\s+til\s+egen\s+konto\b/i,
  /\bbetaling\s+av\s+kredittkort/i,
  /\bkredittkortregning\b/i,
  /\bfelleskonto\b/i,
  /\bgebyr\s+overført\b/i,
  /\bstraksbetaling\b/i,
  /\bseb\s+kort\b/i,
  /\bengangsfullmakt\b/i,
  /\bbetaling\s+med\s+engangsfullmakt\b/i,
  /\bkjøp\s+kron\b/i,
  /\bkron\s*-\s*uttak\b/i,

  // Transfers to people (common Norwegian names pattern)
  /^til\s+[A-ZÆØÅ][a-zæøå]+$/i,  // "Til Anja", "Til Per", etc.

  // Account number patterns (Norwegian format: XXXX.XX.XXXXX)
  /\b\d{4,5}\.\d{2}\.\d{5}\b/,
  /\b\d{10,11}\b/,  // Account numbers without dots

  // English
  /\btransfer\b/i,
  /\bto\s+account\b/i,
  /\bfrom\s+account\b/i,
  /\binternal\s+transfer\b/i,
];

export function detectIsTransfer(description: string | null | undefined): boolean {
  const d = (description || '').trim();
  if (!d) return false;
  return TRANSFER_PATTERNS.some((re) => re.test(d));
}
