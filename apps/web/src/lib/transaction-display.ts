function normalizeSpace(value: string): string {
  return String(value || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
}

export function getDisplayTransactionDescription(
  description: string | null | undefined,
  merchantName?: string | null,
): string {
  const source = normalizeSpace(description || '');
  const merchant = normalizeSpace(merchantName || '');
  if (!source) return merchant || '';

  const codeOnly = /^(?:[A-Z]?\d{8,}|[A-Z]?\d{2,}(?:[.\-/:]\d{2,}){1,})[,;:]?$/i;
  if (codeOnly.test(source) && merchant) return merchant;

  let cleaned = source;

  // Strip leading reference codes like:
  // - 9802.44.27714, Felleskonto ...
  // - R9802.44.27714, Felleskonto ...
  cleaned = cleaned.replace(/^[A-Z]?\d{2,}(?:[.\-/:]\d{2,}){1,}[,;:]?\s+/i, '');
  cleaned = cleaned.replace(/^[A-Z]?\d{8,}[,;:]?\s+/i, '');
  cleaned = normalizeSpace(cleaned);

  if (!cleaned) return merchant || source;
  if (merchant && cleaned.toLowerCase() === merchant.toLowerCase()) return merchant;
  return cleaned;
}
