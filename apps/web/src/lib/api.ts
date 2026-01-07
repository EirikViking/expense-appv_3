import type {
  LoginResponse,
  IngestResponse,
  TransactionsResponse,
  HealthResponse,
  ErrorResponse,
  XlsxIngestRequest,
  PdfIngestRequest,
  TransactionsQuery,
  CategoriesResponse,
  Category,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  TagsResponse,
  Tag,
  CreateTagRequest,
  UpdateTagRequest,
  MerchantsResponse,
  Merchant,
  CreateMerchantRequest,
  UpdateMerchantRequest,
  RulesResponse,
  Rule,
  CreateRuleRequest,
  UpdateRuleRequest,
  ApplyRulesRequest,
  ApplyRulesResponse,
  BudgetsResponse,
  BudgetWithSpent,
  CreateBudgetRequest,
  UpdateBudgetRequest,
  RecurringResponse,
  Recurring,
  CreateRecurringRequest,
  UpdateRecurringRequest,
  UpdateTransactionMetaRequest,
  TransactionWithMeta,
  AnalyticsSummary,
  CategoryBreakdown,
  MerchantBreakdown,
  TimeSeriesPoint,
  AnomalyItem,
  RecurringItem,
  AnalyticsCompareResponse,
} from '@expense/shared';

// In dev mode, use /api which gets proxied by Vite to the worker
// In production, use the configured API URL
const API_URL = import.meta.env.DEV ? '/api' : (import.meta.env.VITE_API_URL || '');

// Token storage key
const AUTH_TOKEN_KEY = 'expense_auth_token';

// Get stored auth token
export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

// Set auth token
export function setAuthToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

// Clear auth token
export function clearAuthToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  // Build headers, including Authorization if token exists
  const headers: Record<string, string> = {};

  // Only set Content-Type for requests with a body (POST, PUT, PATCH)
  const method = options.method?.toUpperCase() || 'GET';
  if (method !== 'GET' && method !== 'DELETE') {
    headers['Content-Type'] = 'application/json';
  }

  // Add Authorization header if token exists
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers as Record<string, string>),
    },
  });

  const data = await response.json();

  if (!response.ok) {
    const error = data as ErrorResponse;
    throw new Error(error.error || 'Request failed');
  }

  return data as T;
}

// Build query string from params
function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.set(key, String(value));
    }
  }
  const str = searchParams.toString();
  return str ? `?${str}` : '';
}

// Helper to convert query objects to Record
function toQueryRecord(obj: Record<string, unknown>): Record<string, string | number | boolean | undefined> {
  const result: Record<string, string | number | boolean | undefined> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      result[key] = value;
    }
  }
  return result;
}

export const api = {
  // Health
  health: () => request<HealthResponse>('/health'),

  // Auth
  login: (password: string) =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  logout: () =>
    request<{ success: boolean }>('/auth/logout', {
      method: 'POST',
    }),

  // Ingest
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

  // Transactions
  getTransactions: (query: TransactionsQuery = {}) => {
    const qs = buildQuery(toQueryRecord(query as unknown as Record<string, unknown>));
    return request<TransactionsResponse>(`/transactions${qs}`);
  },

  getTransaction: (id: string) =>
    request<TransactionWithMeta>(`/transactions/${id}`),

  createTransaction: (data: any) =>
    request<TransactionWithMeta>('/transactions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteTransaction: (id: string) =>
    request<{ success: boolean }>(`/transactions/${id}`, {
      method: 'DELETE',
    }),

  resetData: (confirm: boolean) =>
    request<{ success: boolean; message: string }>('/transactions/admin/reset', {
      method: 'DELETE',
      body: JSON.stringify({ confirm }),
    }),

  // Transaction Meta
  updateTransactionMeta: (id: string, data: UpdateTransactionMetaRequest) =>
    request<TransactionWithMeta>(`/transaction-meta/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  addTransactionTag: (transactionId: string, tagId: string) =>
    request<{ success: boolean }>(`/transaction-meta/${transactionId}/tags/${tagId}`, {
      method: 'POST',
    }),

  removeTransactionTag: (transactionId: string, tagId: string) =>
    request<{ success: boolean }>(`/transaction-meta/${transactionId}/tags/${tagId}`, {
      method: 'DELETE',
    }),

  // Categories
  getCategories: () => request<CategoriesResponse>('/categories'),

  getCategoriesFlat: () => request<{ categories: Category[] }>('/categories/flat'),

  getCategory: (id: string) => request<Category>(`/categories/${id}`),

  createCategory: (data: CreateCategoryRequest) =>
    request<Category>('/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateCategory: (id: string, data: UpdateCategoryRequest) =>
    request<Category>(`/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteCategory: (id: string) =>
    request<{ success: boolean }>(`/categories/${id}`, {
      method: 'DELETE',
    }),

  // Tags
  getTags: () => request<TagsResponse>('/tags'),

  getTag: (id: string) => request<Tag>(`/tags/${id}`),

  createTag: (data: CreateTagRequest) =>
    request<Tag>('/tags', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateTag: (id: string, data: UpdateTagRequest) =>
    request<Tag>(`/tags/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteTag: (id: string) =>
    request<{ success: boolean }>(`/tags/${id}`, {
      method: 'DELETE',
    }),

  // Merchants
  getMerchants: (search?: string, limit?: number, offset?: number) => {
    const qs = buildQuery({ search, limit, offset });
    return request<MerchantsResponse>(`/merchants${qs}`);
  },

  getMerchant: (id: string) => request<Merchant>(`/merchants/${id}`),

  createMerchant: (data: CreateMerchantRequest) =>
    request<Merchant>('/merchants', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateMerchant: (id: string, data: UpdateMerchantRequest) =>
    request<Merchant>(`/merchants/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteMerchant: (id: string) =>
    request<{ success: boolean }>(`/merchants/${id}`, {
      method: 'DELETE',
    }),

  // Rules
  getRules: (enabledOnly?: boolean) => {
    const qs = buildQuery({ enabled: enabledOnly ? 'true' : undefined });
    return request<RulesResponse>(`/rules${qs}`);
  },

  getRule: (id: string) => request<Rule>(`/rules/${id}`),

  createRule: (data: CreateRuleRequest) =>
    request<Rule>('/rules', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateRule: (id: string, data: UpdateRuleRequest) =>
    request<Rule>(`/rules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteRule: (id: string) =>
    request<{ success: boolean }>(`/rules/${id}`, {
      method: 'DELETE',
    }),

  testRule: (id: string, testText: string) => {
    return request<{
      matches: boolean;
      message: string;
    }>(`/rules/${id}/test`, {
      method: 'POST',
      body: JSON.stringify({ test_text: testText }),
    });
  },

  applyRules: (data?: ApplyRulesRequest) =>
    request<ApplyRulesResponse>('/rules/apply', {
      method: 'POST',
      body: JSON.stringify(data || { all: true }),
    }),

  // Budgets
  getBudgets: (activeOnly?: boolean) => {
    const qs = buildQuery({ active: activeOnly ? 'true' : undefined });
    return request<BudgetsResponse>(`/budgets${qs}`);
  },

  getCurrentBudget: () => request<{ budget: BudgetWithSpent | null }>('/budgets/current'),

  getBudget: (id: string) => request<BudgetWithSpent>(`/budgets/${id}`),

  createBudget: (data: CreateBudgetRequest) =>
    request<BudgetWithSpent>('/budgets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateBudget: (id: string, data: UpdateBudgetRequest) =>
    request<BudgetWithSpent>(`/budgets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteBudget: (id: string) =>
    request<{ success: boolean }>(`/budgets/${id}`, {
      method: 'DELETE',
    }),

  // Recurring
  getRecurring: (activeOnly?: boolean, subscriptionsOnly?: boolean) => {
    const qs = buildQuery({
      active: activeOnly ? 'true' : undefined,
      subscriptions: subscriptionsOnly ? 'true' : undefined,
    });
    return request<RecurringResponse>(`/recurring${qs}`);
  },

  getRecurringItem: (id: string) => request<Recurring>(`/recurring/${id}`),

  createRecurring: (data: CreateRecurringRequest) =>
    request<Recurring>('/recurring', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateRecurring: (id: string, data: UpdateRecurringRequest) =>
    request<Recurring>(`/recurring/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteRecurring: (id: string) =>
    request<{ success: boolean }>(`/recurring/${id}`, {
      method: 'DELETE',
    }),

  detectSubscriptions: (minOccurrences?: number, months?: number) => {
    const qs = buildQuery({ min: minOccurrences, months });
    return request<{ detections: RecurringItem[] }>(`/recurring/detect${qs}`);
  },

  // Analytics
  getAnalyticsSummary: (query: { date_from?: string; date_to?: string }) => {
    const qs = buildQuery(toQueryRecord(query));
    return request<AnalyticsSummary>(`/analytics/summary${qs}`);
  },

  getAnalyticsByCategory: (query: { date_from?: string; date_to?: string }) => {
    const qs = buildQuery(toQueryRecord(query));
    return request<{ categories: CategoryBreakdown[]; total: number }>(`/analytics/by-category${qs}`);
  },

  getAnalyticsByMerchant: (query: { date_from?: string; date_to?: string; limit?: number }) => {
    const qs = buildQuery(toQueryRecord(query));
    return request<{ merchants: MerchantBreakdown[] }>(`/analytics/by-merchant${qs}`);
  },

  getAnalyticsTimeseries: (query: { date_from?: string; date_to?: string; granularity?: string }) => {
    const qs = buildQuery(toQueryRecord(query));
    return request<{ series: TimeSeriesPoint[] }>(`/analytics/timeseries${qs}`);
  },

  getAnalyticsSubscriptions: (minOccurrences?: number, months?: number) => {
    const qs = buildQuery({ min: minOccurrences, months });
    return request<{ subscriptions: RecurringItem[] }>(`/analytics/subscriptions${qs}`);
  },

  getAnalyticsAnomalies: (query: { date_from?: string; date_to?: string; threshold?: number }) => {
    const qs = buildQuery(toQueryRecord(query));
    return request<{
      anomalies: AnomalyItem[];
      stats: { mean: number; std_dev: number };
    }>(`/analytics/anomalies${qs}`);
  },

  getAnalyticsCompare: (query: { current_start: string; current_end: string; previous_start: string; previous_end: string }) => {
    const qs = buildQuery(toQueryRecord(query));
    return request<AnalyticsCompareResponse>(`/analytics/compare${qs}`);
  },
};
