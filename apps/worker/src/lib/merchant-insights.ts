import type { MerchantBreakdown } from '@expense/shared';
import { toNumber } from './analytics';
import { merchantChainKey } from './merchant-chain';
import { merchantCasefoldKey, normalizeMerchant } from './merchant-normalize';

export type MerchantAggregateRow = {
  merchant_id: string | null;
  merchant_name: string;
  total: number;
  count: number;
};

type MerchantPreviousRow = {
  merchant_id: string | null;
  merchant_name: string;
  total: number;
};

function normalizedChainName(merchantId: string | null, merchantName: string): string {
  const normalized = normalizeMerchant(merchantName);
  return merchantChainKey(merchantId, normalized.merchant);
}

function normalizedChainKey(merchantId: string | null, merchantName: string): string {
  return merchantCasefoldKey(normalizedChainName(merchantId, merchantName));
}

export function buildMerchantBreakdown(
  currentRows: MerchantAggregateRow[],
  previousRows: MerchantPreviousRow[]
): MerchantBreakdown[] {
  const prevMap = new Map<string, number>();
  for (const row of previousRows) {
    const key = normalizedChainKey(row.merchant_id, row.merchant_name);
    prevMap.set(key, (prevMap.get(key) || 0) + toNumber(row.total));
  }

  const currentMap = new Map<
    string,
    { merchant_name: string; total: number; count: number; merchant_ids: Set<string> }
  >();
  for (const row of currentRows) {
    const displayName = normalizedChainName(row.merchant_id, row.merchant_name);
    const key = normalizedChainKey(row.merchant_id, displayName);
    const existing = currentMap.get(key);
    if (existing) {
      existing.total += toNumber(row.total);
      existing.count += toNumber(row.count);
      if (row.merchant_id) existing.merchant_ids.add(row.merchant_id);
      // Prefer a concrete merchant label over unknown placeholders.
      if (existing.merchant_name === 'Ukjent brukersted' && displayName !== 'Ukjent brukersted') {
        existing.merchant_name = displayName;
      }
    } else {
      currentMap.set(key, {
        merchant_name: displayName,
        total: toNumber(row.total),
        count: toNumber(row.count),
        merchant_ids: row.merchant_id ? new Set([row.merchant_id]) : new Set(),
      });
    }
  }

  const merchants: MerchantBreakdown[] = [...currentMap.entries()].map(([groupKey, row]) => {
    const total = toNumber(row.total);
    const count = toNumber(row.count);
    const avg = count > 0 ? total / count : 0;
    const prevTotal = prevMap.get(groupKey) || 0;
    const trend = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : 0;
    const recomputed = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : 0;
    const trendBasisValid = prevTotal > 0 && Number.isFinite(recomputed) && Number.isFinite(trend) && Math.abs(recomputed - trend) < 0.001;
    const merchantId = row.merchant_ids.size === 1 ? [...row.merchant_ids][0] : null;

    return {
      merchant_id: merchantId,
      merchant_name: row.merchant_name,
      total,
      count,
      avg,
      trend,
      previous_total: prevTotal,
      trend_basis_valid: trendBasisValid,
    };
  });

  merchants.sort((a, b) => b.total - a.total);
  return merchants;
}

