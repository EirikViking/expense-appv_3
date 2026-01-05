// Source types
export const SOURCE_TYPES = ['xlsx', 'pdf'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

// Transaction status
export const TRANSACTION_STATUSES = ['pending', 'booked'] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

// Category rule match types
export const MATCH_TYPES = ['exact', 'contains', 'regex'] as const;
export type MatchType = (typeof MATCH_TYPES)[number];

// PDF section markers (Norwegian bank statements)
export const PDF_SECTION_PENDING = 'Reservasjoner';
export const PDF_SECTION_BOOKED = 'Kontobevegelser';

// XLSX column names (Norwegian credit card exports)
export const XLSX_COLUMNS = {
  DATE: 'Dato',
  BOOKED_DATE: 'Bokført',
  DESCRIPTION: 'Spesifikasjon',
  LOCATION: 'Sted',
  CURRENCY: 'Valuta',
  FOREIGN_AMOUNT: 'Utl. beløp',
  AMOUNT: 'Beløp',
} as const;
