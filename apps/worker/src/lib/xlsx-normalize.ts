function normalizeForMatch(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // NFKD does not reliably decompose Norwegian letters like ø/æ/å into ASCII.
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/å/g, 'a')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractSectionLabelFromRawJson(rawJson: string | null | undefined): string | null {
  const raw = (rawJson || '').trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as any;
    const direct = parsed?.section_label ?? parsed?.section ?? parsed?.sectionContext ?? parsed?.section_context;
    if (typeof direct === 'string' && direct.trim()) return direct.trim();

    // Older clients stored the raw row object directly; attempt to find a "type/section" field.
    const candidates: unknown[] = [];
    if (parsed && typeof parsed === 'object') {
      if (parsed.raw_row && typeof parsed.raw_row === 'object') {
        for (const [k, v] of Object.entries(parsed.raw_row)) {
          if (typeof v !== 'string') continue;
          const kn = normalizeForMatch(String(k));
          if (kn.includes('type') || kn.includes('transaksjonstype') || kn.includes('kategori') || kn.includes('gruppe')) {
            candidates.push(v);
          }
        }
      }

      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v !== 'string') continue;
        const kn = normalizeForMatch(String(k));
        if (kn.includes('type') || kn.includes('transaksjonstype') || kn.includes('kategori') || kn.includes('gruppe')) {
          candidates.push(v);
        }
      }
    }

    for (const c of candidates) {
      const s = String(c || '').trim();
      if (s) return s;
    }
  } catch {
    // ignore parse errors
  }

  return null;
}

export function isPurchaseSection(sectionLabel: string | null): boolean {
  if (!sectionLabel) return false;
  const s = normalizeForMatch(sectionLabel);
  return s.includes('kjop/uttak') || s.includes('kjop / uttak') || (s.includes('kjop') && s.includes('uttak'));
}

export function isRefundLike(description: string | null | undefined): boolean {
  const d = normalizeForMatch(description || '');
  if (!d) return false;
  return (
    d.includes('refusjon')
    || d.includes('tilbake')
    || d.includes('tilbakefor')
    || d.includes('retur')
    || d.includes('kredit')
    || d.includes('krediter')
    || d.includes('revers')
    || d.includes('refund')
    || d.includes('return')
  );
}

export function isPaymentLikeRow(description: string | null | undefined, sectionLabel: string | null): boolean {
  const d = normalizeForMatch(description || '');
  const s = normalizeForMatch(sectionLabel || '');

  // These are typically payments to/from accounts and should not count as income in credit card exports.
  if (d.startsWith('innbetaling')) return true;
  if (s.startsWith('innbetaling')) return true;
  if (d.includes('innbetaling bankgiro')) return true;
  if (d.includes('bankgiro') && d.includes('innbetaling')) return true;
  if (s.includes('innbetaling') && (s.includes('bankgiro') || s.includes('giro'))) return true;

  // Storebrand account exports contain payment-rail rows that should be treated as transfers/excluded.
  // These are not expenses (even when they are negative) and would otherwise bloat "Other".
  // Keep this list conservative; users can always un-exclude or recategorize manually.
  if (d === 'straksbetaling' || d.startsWith('straksbetaling ')) return true;
  if (d.includes('seb kort')) return true;
  if (d.includes('engangsfullmakt')) return true;
  if (d.includes('betaling med engangsfullmakt')) return true;

  // Investment / account payment phrases (best treated as transfers by default).
  if (d.includes('kjop kron') || d.includes('kron - uttak') || d.includes('kron uttak')) return true;
  if (d.includes('betaling av kredittkort') || d.includes('kreditkortregning') || d.includes('kredittkortregning')) return true;

  return false;
}

export function normalizeXlsxAmountForIngest(args: {
  amount: number;
  description: string;
  raw_json: string;
}): { amount: number; flags?: { is_transfer: 1; is_excluded: 1 } } {
  const sectionLabel = extractSectionLabelFromRawJson(args.raw_json);

  // Payment rows should be excluded from income/expense; keep original sign for cashflow transfers breakdown.
  if (isPaymentLikeRow(args.description, sectionLabel)) {
    return { amount: args.amount, flags: { is_transfer: 1, is_excluded: 1 } };
  }

  // Purchases in "Kjøp/uttak" should be negative (expenses). Never flip refunds.
  if (isPurchaseSection(sectionLabel) && !isRefundLike(args.description)) {
    return { amount: -Math.abs(args.amount) };
  }

  return { amount: args.amount };
}
