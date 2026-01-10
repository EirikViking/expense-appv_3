import type { SourceType, TransactionStatus } from './constants';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface NormalizedTransactionExport {
  date: string;
  amount: number;
  currency: string;
  description: string;
  merchant: string | null;
  source: SourceType;
  status?: TransactionStatus;
}

function ensureIsoDate(date: string): string {
  if (!ISO_DATE_PATTERN.test(date)) {
    throw new Error(`Export requires ISO date (YYYY-MM-DD), got "${date}"`);
  }
  return date;
}

export function normalizeXlsxExport(tx: {
  tx_date: string;
  amount: number;
  currency?: string;
  description: string;
  merchant?: string | null;
}): NormalizedTransactionExport {
  return {
    date: ensureIsoDate(tx.tx_date),
    amount: Number(tx.amount),
    currency: (tx.currency || 'NOK').trim(),
    description: String(tx.description).trim(),
    merchant: tx.merchant ?? null,
    source: 'xlsx',
  };
}

export function normalizePdfExport(tx: {
  tx_date: string;
  amount: number;
  description: string;
  status?: TransactionStatus;
}): NormalizedTransactionExport {
  return {
    date: ensureIsoDate(tx.tx_date),
    amount: Number(tx.amount),
    currency: 'NOK',
    description: String(tx.description).trim(),
    merchant: null,
    source: 'pdf',
    ...(tx.status ? { status: tx.status } : {}),
  };
}

export function exportNormalizedTransactions(
  transactions: NormalizedTransactionExport[]
): NormalizedTransactionExport[] {
  return [...transactions].sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    const descCompare = a.description.localeCompare(b.description);
    if (descCompare !== 0) return descCompare;
    const amountCompare = a.amount - b.amount;
    if (amountCompare !== 0) return amountCompare;
    return a.source.localeCompare(b.source);
  });
}
