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

