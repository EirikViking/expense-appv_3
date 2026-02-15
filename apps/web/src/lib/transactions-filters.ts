export interface DateFilterState {
  dateFrom: string;
  dateTo: string;
}

export interface NarrowingFilterState extends DateFilterState {
  status: string;
  sourceType: string;
  categoryId: string;
  merchantId: string;
  merchantName: string;
  minAmount: string;
  maxAmount: string;
  searchQuery: string;
  flowType: string;
}

export function resolveDateFiltersFromSearchParams(searchParams: URLSearchParams): DateFilterState {
  return {
    dateFrom: searchParams.get('date_from') || '',
    dateTo: searchParams.get('date_to') || '',
  };
}

export function isDateFilterActive(dateFrom: string, dateTo: string): boolean {
  return Boolean(dateFrom || dateTo);
}

export function clearDateFiltersInSearchParams(searchParams: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  next.delete('date_from');
  next.delete('date_to');
  return next;
}

export function hasNarrowingFilters(filters: NarrowingFilterState): boolean {
  return Boolean(
    filters.dateFrom ||
      filters.dateTo ||
      filters.status ||
      filters.sourceType ||
      filters.categoryId ||
      filters.merchantId ||
      filters.merchantName ||
      filters.minAmount ||
      filters.maxAmount ||
      filters.searchQuery ||
      filters.flowType
  );
}
