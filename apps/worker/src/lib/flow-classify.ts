import type { FlowType, SourceType } from '@expense/shared';
import { extractSectionLabelFromRawJson, isPaymentLikeRow, isPurchaseSection, isRefundLike } from './xlsx-normalize';
import { isFelleskontoDescription, isStraksbetalingDescription } from './transfer-detect';

function normalizeForMatch(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/å/g, 'a')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeTransfer(description: string, sectionLabel: string | null): boolean {
  // Product decision: Felleskonto should never be transfer.
  if (isFelleskontoDescription(description)) return false;

  const d = normalizeForMatch(description);
  const s = normalizeForMatch(sectionLabel || '');

  // Strong signals of internal transfers.
  const transferSignals = [
    'overforing',
    'til konto',
    'fra konto',
    'egen konto',
    'mellom egne konti',
    'internal transfer',
    'to account',
    'from account',
  ];

  if (transferSignals.some((sig) => d.includes(sig))) return true;
  if (transferSignals.some((sig) => s.includes(sig))) return true;

  // Credit card payments / top-ups often appear under "Innbetaling ...".
  if (isPaymentLikeRow(description, sectionLabel)) return true;

  return false;
}

function looksLikeIncome(description: string): boolean {
  const d = normalizeForMatch(description);

  // Intentionally conservative: we only classify as income when it is explicit.
  const incomeSignals = [
    'lonn',
    'salary',
    'payroll',
    'utbytte',
    'rente',
    'interest',
    'nav',
    'utbetaling',
    'pensjon',
    'trygd',
    'refund', // English refunds, e.g. Stripe refunds from merchants (money in)
    'tilbakebetaling',
  ];

  if (incomeSignals.some((sig) => d.includes(sig))) return true;

  // Refund-like markers should be treated as income only when amount is positive (handled outside).
  return false;
}

function looksLikePurchase(description: string): boolean {
  const d = normalizeForMatch(description);
  if (!d) return false;

  // Payment methods / card purchase markers.
  if (d.includes('kortkjop') || d.includes('kortkjop') || d.includes('bankax') || d.includes('visa')) return true;

  // Vipps payments are typically expenses (P2P or merchant).
  if (d.startsWith('vipps')) return true;

  // Common recurring / merchants that should never be income.
  const purchaseSignals = [
    'sats',
    'google',
    'apple',
    'spotify',
    'netflix',
    'wolt',
    'foodora',
    'narvesen',
    'xxl',
    'cutters',
    'skatteetaten',
    'rema',
    'kiwi',
    'meny',
    'coop',
    'spar',
    'joker',
    'vinmonopolet',
    'shell',
  ];

  if (purchaseSignals.some((sig) => d.includes(sig))) return true;

  // Heuristic: "GOOGLE *..." style merchant tokens.
  if (description.includes('*') && !looksLikeIncome(description)) return true;

  return false;
}

function looksLikeMerchantishText(description: string): boolean {
  // If it looks like a merchant label (letters, not a code-only line), treat as purchase by default.
  const trimmed = (description || '').trim();
  if (!trimmed) return false;
  if (!/[A-Za-zÆØÅæøå]/.test(trimmed)) return false;

  const d = normalizeForMatch(trimmed);

  // Exclude obvious income/transfer prefixes.
  if (d.startsWith('innbetaling')) return false;
  if (d.startsWith('utbetaling')) return false;
  if (d.includes('overforing') || d.includes('til konto') || d.includes('fra konto')) return false;

  // If it contains typical merchant-ish separators or tokens, it's likely a purchase.
  if (trimmed.includes('*')) return true;
  if (/\bAS\b/i.test(trimmed)) return true;
  if (/\bNOR\b/i.test(trimmed)) return true;

  // Default: merchant-ish.
  return true;
}

export function classifyFlowType(args: {
  source_type: SourceType;
  description: string;
  amount: number;
  raw_json?: string | null;
}): { flow_type: FlowType; reason: string; section_label: string | null } {
  const sectionLabel = extractSectionLabelFromRawJson(args.raw_json || undefined);

  // Product decision: "Straksbetaling" must never be transfer.
  if (isStraksbetalingDescription(args.description)) {
    return args.amount > 0
      ? { flow_type: 'income', reason: 'straksbetaling-positive', section_label: sectionLabel }
      : { flow_type: 'expense', reason: 'straksbetaling-nonpositive', section_label: sectionLabel };
  }

  // Product decision: "Felleskonto" rows are always treated as real spending.
  if (isFelleskontoDescription(args.description)) {
    return { flow_type: 'expense', reason: 'felleskonto-expense', section_label: sectionLabel };
  }

  // Transfers must never count as income/expense (when excluded).
  if (looksLikeTransfer(args.description, sectionLabel)) {
    return { flow_type: 'transfer', reason: 'transfer-signals', section_label: sectionLabel };
  }

  // Strong XLSX context: "Kjøp/uttak" means purchase.
  if (isPurchaseSection(sectionLabel)) {
    return { flow_type: 'expense', reason: 'xlsx-section-purchase', section_label: sectionLabel };
  }

  // Positive refunds with refund markers are income-like (money in).
  if (args.amount > 0 && isRefundLike(args.description)) {
    return { flow_type: 'income', reason: 'refund-positive', section_label: sectionLabel };
  }

  // Explicit income markers.
  if (looksLikeIncome(args.description)) {
    return { flow_type: 'income', reason: 'income-keywords', section_label: sectionLabel };
  }

  // Purchase-like markers (works for both PDF and XLSX).
  if (looksLikePurchase(args.description) && !looksLikeIncome(args.description)) {
    return { flow_type: 'expense', reason: 'purchase-like', section_label: sectionLabel };
  }

  // Final safety: if a positive row looks like a merchant label and not explicit income, treat as expense.
  // This prevents obvious purchases (SATS/Google/restaurants/shops) from being misreported as income.
  if (args.amount > 0 && looksLikeMerchantishText(args.description) && !looksLikeIncome(args.description)) {
    return { flow_type: 'expense', reason: 'merchantish-positive', section_label: sectionLabel };
  }

  // Fallback: signed amounts can imply flow when we have no other context.
  if (args.amount < 0) {
    return { flow_type: 'expense', reason: 'fallback-negative', section_label: sectionLabel };
  }

  return { flow_type: 'unknown', reason: 'unknown', section_label: sectionLabel };
}

export function normalizeAmountAndFlags(args: {
  flow_type: FlowType;
  amount: number;
}): { amount: number; flags?: { is_transfer: 1; is_excluded: 1 } } {
  if (args.flow_type === 'expense') {
    return { amount: -Math.abs(args.amount) };
  }
  if (args.flow_type === 'income') {
    return { amount: Math.abs(args.amount) };
  }
  if (args.flow_type === 'transfer') {
    return { amount: args.amount, flags: { is_transfer: 1, is_excluded: 1 } };
  }
  return { amount: args.amount };
}
