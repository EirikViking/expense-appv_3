import type { SourceType, TransactionStatus, MatchType } from './constants';

// Database entities
export interface IngestedFile {
  id: string;
  file_hash: string;
  source_type: SourceType;
  original_filename: string;
  uploaded_at: string;
  metadata_json: string | null;
}

export interface Transaction {
  id: string;
  tx_hash: string;
  tx_date: string;
  booked_date: string | null;
  description: string;
  merchant: string | null;
  amount: number;
  currency: string;
  status: TransactionStatus;
  source_type: SourceType;
  source_file_hash: string;
  raw_json: string;
  created_at: string;
}

export interface CategoryRule {
  id: string;
  name: string;
  match_type: MatchType;
  pattern: string;
  category: string;
  created_at: string;
}

// API request types
export interface LoginRequest {
  password: string;
}

export interface XlsxIngestRequest {
  file_hash: string;
  filename: string;
  source: 'xlsx';
  transactions: Array<{
    tx_date: string;
    booked_date?: string;
    description: string;
    merchant?: string;
    amount: number;
    currency: string;
    raw_json: string;
  }>;
}

export interface PdfIngestRequest {
  file_hash: string;
  filename: string;
  source: 'pdf';
  extracted_text: string;
}

// API response types
export interface LoginResponse {
  success: boolean;
}

export interface IngestResponse {
  inserted: number;
  skipped_duplicates: number;
  skipped_invalid: number;
  file_duplicate: boolean;
}

export interface TransactionsResponse {
  transactions: Transaction[];
  total: number;
}

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

export interface ErrorResponse {
  error: string;
  details?: string;
}

// Query parameters
export interface TransactionsQuery {
  date_from?: string;
  date_to?: string;
  status?: TransactionStatus;
  source_type?: SourceType;
  limit?: number;
  offset?: number;
}
