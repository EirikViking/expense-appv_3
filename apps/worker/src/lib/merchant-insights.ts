import type { MerchantBreakdown } from '@expense/shared';
import { toNumber } from './analytics';
import { merchantChainKey } from './merchant-chain';
import { normalizeMerchant } from './merchant-normalize';

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

function normalizedChainKey(merchantId: string | null, merchantName: string): string {
  const normalized = normalizeMerchant(merchantName);
  return merchantChainKey(merchantId, normalized.merchant);
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

  const currentMap = new Map<string, { merchant_id: string | null; merchant_name: string; total: number; count: number }>();
  for (const row of currentRows) {
    const key = normalizedChainKey(row.merchant_id, row.merchant_name);
    const existing = currentMap.get(key);
    if (existing) {
      existing.total += toNumber(row.total);
      existing.count += toNumber(row.count);
    } else {
      currentMap.set(key, {
        merchant_id: row.merchant_id ? row.merchant_id : null,
        merchant_name: key,
        total: toNumber(row.total),
        count: toNumber(row.count),
      });
    }
  }

  const merchants: MerchantBreakdown[] = [...currentMap.values()].map((row) => {
    const total = toNumber(row.total);
    const count = toNumber(row.count);
    const avg = count > 0 ? total / count : 0;
    const prevTotal = prevMap.get(row.merchant_name) || 0;
    const trend = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : 0;
    const recomputed = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : 0;
    const trendBasisValid = prevTotal > 0 && Number.isFinite(recomputed) && Number.isFinite(trend) && Math.abs(recomputed - trend) < 0.001;

    return {
      merchant_id: row.merchant_id,
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

