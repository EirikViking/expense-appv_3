export type MerchantKind = 'name' | 'code' | 'unknown';

export const UNKNOWN_MERCHANT = 'Ukjent brukersted';

function normalizeSpace(value: string): string {
  return value
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripEmptySeparators(value: string): string {
  return value
    .replace(/\s*[-/]{2,}\s*/g, ' ')
    .replace(/\s+[/-]\s*$/g, '')
    .trim();
}

function normalizeTokenCasing(value: string): string {
  const hasLower = /[a-zæøå]/.test(value);
  const hasUpper = /[A-ZÆØÅ]/.test(value);

  // Keep all-caps merchant names as-is (PAYPAL, ELKJOP, RUTER).
  if (hasUpper && !hasLower) return value;

  return value
    .split(' ')
    .map((token) => {
      if (!token) return token;
      if (/^\d+$/.test(token)) return token;
      if (/^(as|ab|sa)$/i.test(token)) return token.toUpperCase();
      if (/^[A-Z0-9.&/:-]+$/.test(token) && token.length <= 3) return token.toUpperCase();
      const first = token.slice(0, 1).toUpperCase();
      const rest = token.slice(1).toLowerCase();
      return `${first}${rest}`;
    })
    .join(' ');
}

function isCodeLike(value: string): boolean {
  const compact = value.replace(/\s+/g, '').toUpperCase();
  if (!compact) return true;
  if (/^\d+$/.test(compact)) return true;
  if (/^\d+(?:[.,]\d+)?(?:NOK|KR)$/.test(compact)) return true;
  if (/^(?:NOK|KR)$/.test(compact)) return true;
  if (/^\d{3,8}(?:NOK|KR)?$/.test(compact)) return true;
  return false;
}

function applyDomainMapping(value: string): string {
  const upper = value.toUpperCase();

  if (
    /(?:^|\b)CLASOHLSON(?:\.COM)?(?:\/NO)?(?:\b|$)/.test(upper) ||
    /(?:^|\b)CLAS[.\s_-]*OHLSON(?:\b|$)/.test(upper)
  ) {
    return 'CLAS OHLSON';
  }

  if (/(?:^|\b)ELKJOP(?:\.NO)?(?:\b|$)/.test(upper)) {
    return 'ELKJOP';
  }

  return value;
}

function cleanupMerchantCandidate(raw: string): string {
  let candidate = normalizeSpace(raw);
  candidate = stripEmptySeparators(candidate);

  // Remove generic payment rail prefixes when followed by an actual merchant.
  candidate = candidate.replace(
    /^(?:visa|giro|girobetaling|e[-\s]?varekj[oø]p|varekj[oø]p|kortkj[oø]p)\s+/i,
    ''
  );

  // Remove leading numeric transaction codes.
  candidate = candidate.replace(/^\d{3,8}\s+/, '');

  // Drop pointless trailing currency token.
  candidate = candidate.replace(/\s+(?:NOK|KR)\.?$/i, '').trim();

  candidate = applyDomainMapping(candidate);
  candidate = normalizeSpace(candidate);

  return candidate;
}

export function normalizeMerchant(raw: string): {
  merchant: string;
  merchant_raw: string;
  merchant_kind: MerchantKind;
} {
  const merchant_raw = normalizeSpace(String(raw || ''));
  if (!merchant_raw) {
    return {
      merchant: UNKNOWN_MERCHANT,
      merchant_raw,
      merchant_kind: 'unknown',
    };
  }

  if (isCodeLike(merchant_raw)) {
    return {
      merchant: UNKNOWN_MERCHANT,
      merchant_raw,
      merchant_kind: 'code',
    };
  }

  let candidate = cleanupMerchantCandidate(merchant_raw);
  if (!candidate) {
    candidate = merchant_raw;
  }

  if (isCodeLike(candidate)) {
    return {
      merchant: UNKNOWN_MERCHANT,
      merchant_raw,
      merchant_kind: 'code',
    };
  }

  return {
    merchant: normalizeTokenCasing(candidate),
    merchant_raw,
    merchant_kind: 'name',
  };
}

