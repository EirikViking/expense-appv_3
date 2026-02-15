import type { IngestResponse } from '@expense/shared';

export interface DateRange {
  date_from: string;
  date_to: string;
}

function isIsoDate(value: string | undefined): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function getRangeFromIngestResponse(result: IngestResponse | undefined): DateRange | undefined {
  if (!result) return undefined;
  if (!isIsoDate(result.min_tx_date) || !isIsoDate(result.max_tx_date)) return undefined;
  return {
    date_from: result.min_tx_date,
    date_to: result.max_tx_date,
  };
}

export function buildTransactionsLinkForRange(range: DateRange): string {
  return (
    '/transactions?' +
    new URLSearchParams({
      date_from: range.date_from,
      date_to: range.date_to,
      include_excluded: 'true',
    }).toString()
  );
}
