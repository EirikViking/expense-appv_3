import type {
  LoginResponse,
  IngestResponse,
  TransactionsResponse,
  HealthResponse,
  ErrorResponse,
  XlsxIngestRequest,
  PdfIngestRequest,
  TransactionsQuery,
} from '@expense/shared';

// In dev mode, use /api which gets proxied by Vite to the worker
// In production, use the configured API URL
const API_URL = import.meta.env.DEV ? '/api' : (import.meta.env.VITE_API_URL || '');

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    const error = data as ErrorResponse;
    throw new Error(error.error || 'Request failed');
  }

  return data as T;
}

export const api = {
  health: () => request<HealthResponse>('/health'),

  login: (password: string) =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  logout: () =>
    request<{ success: boolean }>('/auth/logout', {
      method: 'POST',
    }),

  ingestXlsx: (data: XlsxIngestRequest) =>
    request<IngestResponse>('/ingest/xlsx', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  ingestPdf: (data: PdfIngestRequest) =>
    request<IngestResponse>('/ingest/pdf', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getTransactions: (query: TransactionsQuery = {}) => {
    const params = new URLSearchParams();
    if (query.date_from) params.set('date_from', query.date_from);
    if (query.date_to) params.set('date_to', query.date_to);
    if (query.status) params.set('status', query.status);
    if (query.source_type) params.set('source_type', query.source_type);
    if (query.limit) params.set('limit', String(query.limit));
    if (query.offset) params.set('offset', String(query.offset));

    const queryString = params.toString();
    return request<TransactionsResponse>(
      `/transactions${queryString ? `?${queryString}` : ''}`
    );
  },
};
