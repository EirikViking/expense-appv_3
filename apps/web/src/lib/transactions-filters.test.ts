import { describe, expect, it } from 'vitest';
import {
  clearDateFiltersInSearchParams,
  hasNarrowingFilters,
  resolveDateFiltersFromSearchParams,
} from './transactions-filters';

describe('transactions-filters', () => {
  it('does not apply hidden date defaults when URL has no date params', () => {
    const params = new URLSearchParams('status=booked');
    const resolved = resolveDateFiltersFromSearchParams(params);
    expect(resolved).toEqual({ dateFrom: '', dateTo: '' });
  });

  it('clears date params without touching other filters', () => {
    const params = new URLSearchParams('date_from=2026-01-01&date_to=2026-02-01&status=booked');
    const next = clearDateFiltersInSearchParams(params);
    expect(next.get('date_from')).toBeNull();
    expect(next.get('date_to')).toBeNull();
    expect(next.get('status')).toBe('booked');
  });

  it('detects narrowing filters correctly', () => {
    expect(
      hasNarrowingFilters({
        dateFrom: '',
        dateTo: '',
        status: '',
        sourceType: '',
        categoryId: '',
        merchantId: '',
        merchantName: '',
        minAmount: '',
        maxAmount: '',
        searchQuery: '',
        flowType: '',
      })
    ).toBe(false);

    expect(
      hasNarrowingFilters({
        dateFrom: '',
        dateTo: '',
        status: 'booked',
        sourceType: '',
        categoryId: '',
        merchantId: '',
        merchantName: '',
        minAmount: '',
        maxAmount: '',
        searchQuery: '',
        flowType: '',
      })
    ).toBe(true);
  });
});
