function normalizeSpace(value: string): string {
  return String(value || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const CODE_ONLY_PATTERN = /^(?:[A-Z]?\d{8,}|[A-Z]?\d{2,}(?:[.\-/:]\d{2,}){1,})[,;:]?$/i;
const ALNUM_CODE_ONLY_PATTERN = /^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{8,}$/i;
const LEADING_REFERENCE_PATTERNS: RegExp[] = [
  // Common payment rails / wrappers in Norwegian bank exports.
  /^(?:visa|giro|girobetaling|avtalegiro(?:\s+til)?|e[-\s]?faktura(?:\s+til)?|e[-\s]?varekj[oø]p|varekj[oø]p|kortkj[oø]p)\s+/i,
  /^(?:vipps|paypal|nyx|tm|uber|google)\s*\*\s*/i,
  /^[A-Z]{1,24}[_-]*\*\s*/i,
  /^[A-Z0-9]{6,}\s*\/\s*/i,
  /^[A-Z]\d{2,6}\s+(?=[A-Za-z\u00C6\u00D8\u00C5])/,
  /^\d{4,}\s*-\s*/,
  /^(?:vare|visa\s+vare)\s+\d+X+\d+\s+\d{1,2}[.\-]\d{1,2}\s+[\d.,]+\s+/i,
  /^\d+X+\d+\s+\d{1,2}[.\-]\d{1,2}\s+/i,
  /^[*]+\s*/,

  /^(?:konto|kto)\s+[A-Z]?\d{2,}(?:[.\-/:]\d{2,}){1,}[,;:]?\s+/i,
  /^(?:konto|kto)\s+[A-Z]?\d{8,}[,;:]?\s+/i,
  /^[A-Z]?\d{2,}(?:[.\-/:]\d{2,}){1,}[,;:]?\s+/i,
  /^[A-Z]?\d{8,}[,;:]?\s+/i,
  // Leading store/register codes, e.g. "2515 COOP PRIX ...".
  /^\d{1,8}\s+(?=[A-Za-z\u00C6\u00D8\u00C5])/,
];

export function looksLikeOpaqueDescriptionToken(value: string | null | undefined): boolean {
  const compact = normalizeSpace(value || '').replace(/\s+/g, '');
  if (!compact) return false;
  return /^[A-Z0-9]+[*][A-Z0-9*._/-]*$/i.test(compact);
}

function stripLeadingReferenceNoise(value: string): string {
  let current = normalizeSpace(value);
  let changed = true;

  while (changed && current) {
    changed = false;
    for (const pattern of LEADING_REFERENCE_PATTERNS) {
      const next = current.replace(pattern, '');
      if (next !== current) {
        current = normalizeSpace(next);
        changed = true;
      }
    }
  }

  return current;
}

function stripTrailingNoise(value: string): string {
  let cleaned = normalizeSpace(value);
  cleaned = cleaned.replace(/\s+nota(?:\s*nr)?\s+\d+.*$/i, '');
  cleaned = cleaned.replace(/\s+betal(?:ings)?\s*dato\s+\d{1,4}[.\-/]\d{1,2}[.\-/]\d{1,4}.*$/i, '');
  cleaned = cleaned.replace(/\s+forfalls?dato\s+\d{1,4}[.\-/]\d{1,2}[.\-/]\d{1,4}.*$/i, '');
  cleaned = cleaned.replace(/\s+(?:USD|EUR|GBP|SEK|DKK|AUD)\s+[-\d.,]+\s+Kurs\s+[-\d.,]+.*$/i, '');
  return normalizeSpace(cleaned);
}

export function normalizeTransactionDescription(raw: string | null | undefined, merchantName?: string | null): string {
  const source = normalizeSpace(raw || '');
  const merchant = normalizeSpace(merchantName || '');
  if (!source) return merchant || '';

  if (
    merchant &&
    merchant.toLowerCase() !== source.toLowerCase() &&
    (CODE_ONLY_PATTERN.test(source) ||
      ALNUM_CODE_ONLY_PATTERN.test(source) ||
      looksLikeOpaqueDescriptionToken(source))
  ) {
    return merchant;
  }

  const stripped = stripTrailingNoise(stripLeadingReferenceNoise(source));
  if (!stripped) return merchant || source;
  if (
    merchant &&
    merchant.toLowerCase() !== stripped.toLowerCase() &&
    (CODE_ONLY_PATTERN.test(stripped) ||
      ALNUM_CODE_ONLY_PATTERN.test(stripped) ||
      looksLikeOpaqueDescriptionToken(stripped))
  ) {
    return merchant;
  }

  return stripped;
}
