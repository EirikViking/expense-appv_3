// Canonicalizes merchant grouping keys for analytics when we don't have a canonical merchant_id.
// This is intentionally conservative and focused on reducing fragmentation in Storebrand exports.

export function merchantChainKey(merchantId: string | null | undefined, merchantName: string): string {
  const name = String(merchantName || '').trim();
  if (!name) return name;
  if (merchantId) return name; // canonical merchants should not be merged heuristically

  const lower = name.toLowerCase();

  // Always aggregate tax payments under a single "Skatteetaten" merchant group.
  // These often appear with prefixes like "Girobetaling ..." or truncation, but include the keyword.
  if (lower.includes('skatteetaten') || lower.includes('skatteinnkreving')) return 'SKATTEETATEN';

  const parts = name.split(/\s+/);
  if (parts.length >= 2 && /^\d+$/.test(parts[1])) return parts[0]; // "KIWI 505" -> "KIWI"

  return name;
}

