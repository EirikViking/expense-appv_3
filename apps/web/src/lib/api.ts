import type {
  AuthMeResponse,
  BootstrapRequest,
  BootstrapResponse,
  BasicSuccessResponse,
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
  CreateTransactionRequest,
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
  BulkSetTransactionCategoryRequest,
  TransactionWithMeta,
  AnalyticsSummary,
  CategoryBreakdown,
  MerchantBreakdown,
  TimeSeriesPoint,
  AnomalyItem,
  RecurringItem,
  AnalyticsCompareResponse,
  AnalyticsOverview,
  UpdateTransactionRequest,
  AnalyticsQuery,
  AppUser,
  CreateUserRequest,
  UpdateUserRequest,
  AdminUsersResponse,
  CreateUserResponse,
  ResetLinkResponse,
} from '@expense/shared';
import { getApiBaseUrl } from './version';

export interface ValidateIngestResponse {
  ok: boolean;
  failures: string[];
  period: { date_from: string; date_to: string };
  counts?: {
    total?: number;
    excluded?: number;
    zero_amount?: { active?: number; excluded?: number };
    flow_type?: Record<string, number>;
    source_type?: Record<string, number>;
  };
  groceries?: {
    analytics_total?: number;
    tx_base_total?: number;
    analytics_delta?: number;
    flow_delta?: number;
    income_leak_count?: number;
  };
  suspicious_income?: Array<{ description: string; count: number; total_abs: number }>;
}

export interface ReclassifyOtherResponse {
  success: boolean;
  scope: { source_file_hash: string | null };
  dry_run: boolean;
  force?: boolean;
  limit: number;
  scanned: number;
  updated: number;
  skipped: { no_score: number; by_guard: number; low_conf: number };
  remaining_other_like: number;
  next_cursor: string | null;
  done: boolean;
}

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

type RequestOptions = RequestInit & {
  skipCache?: boolean;
  cacheTtlMs?: number;
};

type CachedResponse = {
  expiresAt: number;
  data: unknown;
};

const getResponseCache = new Map<string, CachedResponse>();
const inflightGetRequests = new Map<string, Promise<unknown>>();

function clearRequestCache() {
  getResponseCache.clear();
  inflightGetRequests.clear();
}

function getCacheTtlMs(endpoint: string, override?: number): number {
  if (typeof override === 'number') return override;
  if (endpoint.startsWith('/categories') || endpoint.startsWith('/tags')) return 5 * 60_000;
  if (endpoint.startsWith('/analytics')) return 30_000;
  if (endpoint.startsWith('/merchants')) return 60_000;
  if (endpoint.startsWith('/transactions')) return 10_000;
  if (endpoint.startsWith('/auth/me')) return 15_000;
  return 20_000;
}

function readCachedResponse<T>(cacheKey: string): T | null {
  const cached = getResponseCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    getResponseCache.delete(cacheKey);
    return null;
  }
  return cached.data as T;
}

async function request<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const fetchOptions: RequestInit = { ...options };
  delete (fetchOptions as RequestOptions).skipCache;
  delete (fetchOptions as RequestOptions).cacheTtlMs;
  const headers: Record<string, string> = {};

  // Only set Content-Type for requests with a body (POST, PUT, PATCH)
  const method = options.method?.toUpperCase() || 'GET';
  const isGet = method === 'GET';
  const skipCache = options.skipCache === true;
  const cacheTtlMs = getCacheTtlMs(endpoint, options.cacheTtlMs);
  const shouldCacheGet = isGet && !skipCache && cacheTtlMs > 0;
  const cacheKey = `${method}:${endpoint}`;
  if (method !== 'GET' && method !== 'DELETE') {
    headers['Content-Type'] = 'application/json';
  }

  if (shouldCacheGet) {
    const cached = readCachedResponse<T>(cacheKey);
    if (cached !== null) return cached;
    const inflight = inflightGetRequests.get(cacheKey) as Promise<T> | undefined;
    if (inflight) return inflight;
  }

  const executeRequest = async (): Promise<T> => {
    const apiUrl = getApiBaseUrl();
    const response = await fetch(`${apiUrl}${endpoint}`, {
      credentials: 'include',
      ...fetchOptions,
      headers: {
        ...headers,
        ...(fetchOptions.headers as Record<string, string>),
      },
    });

    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      const errObj = data as Partial<ErrorResponse> & { message?: string };
      const msg = errObj?.message || errObj?.error || `HTTP ${response.status}`;
      throw new ApiError(String(msg), response.status, data);
    }

    if (shouldCacheGet) {
      getResponseCache.set(cacheKey, {
        data,
        expiresAt: Date.now() + cacheTtlMs,
      });
    } else if (!isGet) {
      clearRequestCache();
    }

    return data as T;
  };

  if (!shouldCacheGet) {
    return executeRequest();
  }

  const inflight = executeRequest().finally(() => {
    inflightGetRequests.delete(cacheKey);
  });
  inflightGetRequests.set(cacheKey, inflight);
  return inflight;
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
  authMe: () => request<AuthMeResponse>('/auth/me'),

  bootstrap: (data: BootstrapRequest) =>
    request<BootstrapResponse>('/auth/bootstrap', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  login: (email: string, password: string, remember_me: boolean) =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, remember_me }),
    }),

  logout: () =>
    request<BasicSuccessResponse>('/auth/logout', {
      method: 'POST',
    }),

  setPassword: (token: string, password: string) =>
    request<BasicSuccessResponse>('/auth/set-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),

  resetPassword: (token: string, password: string) =>
    request<BasicSuccessResponse>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),

  onboardingComplete: () =>
    request<BasicSuccessResponse>('/auth/onboarding-complete', {
      method: 'POST',
    }),

  // Admin users
  adminListUsers: () => request<AdminUsersResponse>('/admin/users'),

  adminCreateUser: (data: CreateUserRequest) =>
    request<CreateUserResponse>('/admin/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  adminUpdateUser: (id: string, data: UpdateUserRequest) =>
    request<AppUser>(`/admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  adminCreateResetLink: (id: string) =>
    request<ResetLinkResponse>(`/admin/users/${id}/reset-link`, {
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

  validateIngest: (params: { date_from: string; date_to: string }) => {
    const qs = buildQuery(params);
    return request<ValidateIngestResponse>(`/transactions/admin/validate-ingest${qs}`);
  },

  reclassifyOther: (body: {
    source_file_hash?: string;
    cursor?: string | null;
    limit?: number;
    dry_run?: boolean;
    min_conf?: number;
    min_margin?: number;
    min_docs?: number;
    force?: boolean;
  }) =>
    request<ReclassifyOtherResponse>('/transactions/admin/reclassify-other', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getTransaction: (id: string) =>
    request<TransactionWithMeta>(`/transactions/${id}`),

  createTransaction: (data: CreateTransactionRequest) =>
    request<TransactionWithMeta>('/transactions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteTransaction: (id: string) =>
    request<{ success: boolean }>(`/transactions/${id}`, {
      method: 'DELETE',
    }),

  patchTransaction: (id: string, data: UpdateTransactionRequest) =>
    request<TransactionWithMeta>(`/transactions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  resetData: (confirm: boolean) =>
    request<{ success: boolean; message: string }>('/transactions/admin/reset', {
      method: 'DELETE',
      body: JSON.stringify({ confirm }),
    }),

  // Transaction exclusion
  excludeTransaction: (id: string) =>
    request<{ success: boolean; id: string; is_excluded: boolean }>(`/transactions/${id}/exclude`, {
      method: 'POST',
    }),

  includeTransaction: (id: string) =>
    request<{ success: boolean; id: string; is_excluded: boolean }>(`/transactions/${id}/include`, {
      method: 'POST',
    }),

  bulkExcludeTransactions: (criteria: {
    transaction_ids?: string[];
    amount_threshold?: number;
    merchant_name?: string;
  }) =>
    request<{ success: boolean; updated: number }>('/transactions/bulk/exclude', {
      method: 'POST',
      body: JSON.stringify(criteria),
    }),

  bulkIncludeTransactions: (criteria: {
    transaction_ids?: string[];
    all?: boolean;
  }) =>
    request<{ success: boolean; updated: number }>('/transactions/bulk/include', {
      method: 'POST',
      body: JSON.stringify(criteria),
    }),

  // Transaction Meta
  updateTransactionMeta: (id: string, data: UpdateTransactionMetaRequest) =>
    request<TransactionWithMeta>(`/transaction-meta/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  bulkSetTransactionCategory: (data: BulkSetTransactionCategoryRequest) =>
    request<{ success: boolean; updated: number }>(`/transaction-meta/bulk/category`, {
      method: 'POST',
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
      rule_id: string;
      tested: number;
      matched: number;
      matches: Array<{
        transaction_id: string;
        description: string;
        amount: number;
        date: string;
      }>;
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
  getAnalyticsOverview: (query: Partial<AnalyticsQuery>) => {
    const qs = buildQuery(toQueryRecord(query));
    return request<AnalyticsOverview>(`/analytics/overview${qs}`);
  },

  getAnalyticsSummary: (query: Partial<AnalyticsQuery>) => {
    const qs = buildQuery(toQueryRecord(query));
    return request<AnalyticsSummary>(`/analytics/summary${qs}`);
  },

  getAnalyticsByCategory: (query: Partial<AnalyticsQuery>) => {
    const qs = buildQuery(toQueryRecord(query));
    return request<{ categories: CategoryBreakdown[]; total: number }>(`/analytics/by-category${qs}`);
  },

  getAnalyticsByMerchant: (query: Partial<AnalyticsQuery> & { limit?: number }) => {
    const qs = buildQuery(toQueryRecord(query));
    return request<{ merchants: MerchantBreakdown[] }>(`/analytics/by-merchant${qs}`);
  },

  getAnalyticsTimeseries: (query: Partial<AnalyticsQuery>) => {
    const qs = buildQuery(toQueryRecord(query));
    return request<{ series: TimeSeriesPoint[] }>(`/analytics/timeseries${qs}`);
  },

  getAnalyticsSubscriptions: (minOccurrences?: number, months?: number) => {
    const qs = buildQuery({ min: minOccurrences, months });
    return request<{ subscriptions: RecurringItem[] }>(`/analytics/subscriptions${qs}`);
  },

  getAnalyticsAnomalies: (query: Partial<AnalyticsQuery> & { threshold?: number }) => {
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

  getAnalyticsFunFacts: (query: { date_from?: string; date_to?: string }) => {
    const qs = buildQuery(toQueryRecord(query));
    return request<{
      facts: Array<{
        id: string;
        icon: string;
        title: string;
        value: string;
        description: string;
      }>;
    }>(`/analytics/fun-facts${qs}`);
  },
};
