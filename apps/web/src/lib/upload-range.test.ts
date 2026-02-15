import { describe, expect, it } from 'vitest';
import type { IngestResponse } from '@expense/shared';
import { buildTransactionsLinkForRange, getRangeFromIngestResponse } from './upload-range';

describe('upload-range helpers', () => {
  it('uses min/max tx date from ingest response when available', () => {
    const response: IngestResponse = {
      inserted: 10,
      skipped_duplicates: 0,
      skipped_invalid: 0,
      file_duplicate: false,
      min_tx_date: '2024-01-02',
      max_tx_date: '2026-02-03',
    };

    expect(getRangeFromIngestResponse(response)).toEqual({
      date_from: '2024-01-02',
      date_to: '2026-02-03',
    });
  });

  it('builds transactions link with explicit date range', () => {
    const link = buildTransactionsLinkForRange({
      date_from: '2024-01-02',
      date_to: '2026-02-03',
    });

    expect(link).toContain('/transactions?');
    expect(link).toContain('date_from=2024-01-02');
    expect(link).toContain('date_to=2026-02-03');
    expect(link).toContain('include_excluded=true');
  });
});
