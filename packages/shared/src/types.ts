import type {
  SourceType,
  TransactionStatus,
  MatchType,
  RuleMatchField,
  RuleMatchType,
  RuleActionType,
  BudgetPeriodType,
  RecurringCadence,
} from './constants';

// ============================================
// Database entities
// ============================================

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
  is_excluded: boolean;
  is_transfer: boolean;
}

// Enriched transaction with metadata joined
export interface TransactionWithMeta extends Transaction {
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
  merchant_id: string | null;
  merchant_name: string | null;
  notes: string | null;
  is_recurring: boolean;
  source_filename: string | null;
  tags: Array<{ id: string; name: string; color: string | null }>;
}

// Legacy category rule (from original schema)
export interface CategoryRule {
  id: string;
  name: string;
  match_type: MatchType;
  pattern: string;
  category: string;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  parent_id: string | null;
  color: string | null;
  icon: string | null;
  sort_order: number;
  created_at: string;
  is_transfer: boolean;
}

export interface CategoryWithChildren extends Category {
  children: CategoryWithChildren[];
  transaction_count?: number;
}

// Alias for tree display
export type CategoryTree = CategoryWithChildren;

export interface Merchant {
  id: string;
  canonical_name: string;
  patterns: string[]; // Stored as JSON in DB
  website: string | null;
  logo_url: string | null;
  created_at: string;
}

export interface TransactionMeta {
  transaction_id: string;
  category_id: string | null;
  merchant_id: string | null;
  notes: string | null;
  is_recurring: boolean;
  recurring_id: string | null;
  updated_at: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string | null;
  created_at: string;
}

export interface TransactionTag {
  transaction_id: string;
  tag_id: string;
  created_at: string;
}

export interface Rule {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
  match_field: RuleMatchField;
  match_type: RuleMatchType;
  match_value: string;
  match_value_secondary: string | null;
  action_type: RuleActionType;
  action_value: string;
  created_at: string;
  updated_at: string;
}

export interface Budget {
  id: string;
  name: string;
  period_type: BudgetPeriodType;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BudgetItem {
  id: string;
  budget_id: string;
  category_id: string;
  amount: number;
  created_at: string;
}

export interface BudgetWithItems extends Budget {
  items: Array<BudgetItem & { category_name: string; spent: number }>;
}

// Simplified budget for display with calculated spent
export interface BudgetWithSpent {
  id: string;
  name: string;
  amount: number;
  spent: number;
  period: BudgetPeriodType;
  category_id: string | null;
  start_date: string | null;
  end_date: string | null;
}

export interface Recurring {
  id: string;
  name: string;
  merchant_id: string | null;
  category_id: string | null;
  amount_expected: number | null;
  amount_min: number | null;
  amount_max: number | null;
  cadence: RecurringCadence;
  day_of_month: number | null;
  pattern: Record<string, unknown>;
  is_active: boolean;
  is_subscription: boolean;
  last_occurrence: string | null;
  next_expected: string | null;
  created_at: string;
  updated_at: string;
}

export interface TransactionSplit {
  id: string;
  parent_transaction_id: string;
  amount: number;
  category_id: string | null;
  description: string | null;
  created_at: string;
}

// ============================================
// API request types
// ============================================

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

// Manual transaction create
export interface CreateTransactionRequest {
  date: string;
  amount: number;
  description: string;
  category_id?: string | null;
  merchant_id?: string | null;
  notes?: string | null;
}

// Category CRUD
export interface CreateCategoryRequest {
  name: string;
  parent_id?: string | null;
  color?: string | null;
  icon?: string | null;
  sort_order?: number;
}

export interface UpdateCategoryRequest {
  name?: string;
  parent_id?: string | null;
  color?: string | null;
  icon?: string | null;
  sort_order?: number;
}

// Tag CRUD
export interface CreateTagRequest {
  name: string;
  color?: string | null;
}

export interface UpdateTagRequest {
  name?: string;
  color?: string | null;
}

// Merchant CRUD
export interface CreateMerchantRequest {
  canonical_name: string;
  patterns?: string[];
  website?: string | null;
}

export interface UpdateMerchantRequest {
  canonical_name?: string;
  patterns?: string[];
  website?: string | null;
}

// Rule CRUD
export interface CreateRuleRequest {
  name: string;
  priority?: number;
  enabled?: boolean;
  match_field: RuleMatchField;
  match_type: RuleMatchType;
  match_value: string;
  match_value_secondary?: string | null;
  action_type: RuleActionType;
  action_value: string;
}

export interface UpdateRuleRequest {
  name?: string;
  priority?: number;
  enabled?: boolean;
  match_field?: RuleMatchField;
  match_type?: RuleMatchType;
  match_value?: string;
  match_value_secondary?: string | null;
  action_type?: RuleActionType;
  action_value?: string;
}

// Transaction meta update
export interface UpdateTransactionMetaRequest {
  category_id?: string | null;
  merchant_id?: string | null;
  notes?: string | null;
  tag_ids?: string[];
}

// Transaction split
export interface CreateSplitRequest {
  splits: Array<{
    amount: number;
    category_id?: string | null;
    description?: string | null;
  }>;
}

// Budget CRUD
export interface CreateBudgetRequest {
  name: string;
  amount: number;
  period: BudgetPeriodType;
  category_id?: string;
  start_date?: string;
  end_date?: string;
}

export interface UpdateBudgetRequest {
  name?: string;
  amount?: number;
  period?: BudgetPeriodType;
  category_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

// Recurring CRUD
export interface CreateRecurringRequest {
  name: string;
  merchant_id?: string | null;
  category_id?: string | null;
  amount_expected?: number | null;
  amount_min?: number | null;
  amount_max?: number | null;
  cadence: RecurringCadence;
  day_of_month?: number | null;
  is_subscription?: boolean;
}

export interface UpdateRecurringRequest {
  name?: string;
  merchant_id?: string | null;
  category_id?: string | null;
  amount_expected?: number | null;
  amount_min?: number | null;
  amount_max?: number | null;
  cadence?: RecurringCadence;
  day_of_month?: number | null;
  is_active?: boolean;
  is_subscription?: boolean;
}

// Apply rules request
export interface ApplyRulesRequest {
  transaction_ids?: string[]; // Apply to specific transactions
  all?: boolean; // Apply to all transactions
  batch_size?: number;
}

// ============================================
// API response types
// ============================================

export interface LoginResponse {
  success: boolean;
  token?: string;
}

export interface IngestResponse {
  inserted: number;
  skipped_duplicates: number;
  skipped_invalid: number;
  file_duplicate: boolean;
  /**
   * For PDF parsing: summary of skipped lines by reason
   * This helps users understand why some lines weren't parsed as transactions
   */
  skipped_lines_summary?: {
    header: number;
    section_marker: number;
    page_number: number;
    no_date: number;
    no_amount: number;
    parse_failed: number;
    excluded_pattern: number;
  };
}

export interface TransactionsResponse {
  transactions: TransactionWithMeta[];
  total: number;
  page: number;
  page_size: number;
}

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
  environment: string;
  version_id: string;
}

export interface ErrorResponse {
  error: string;
  details?: string;
}

export interface CategoriesResponse {
  categories: Category[];
  tree: CategoryTree[];
}

export interface TagsResponse {
  tags: Tag[];
}

export interface MerchantsResponse {
  merchants: Merchant[];
  total: number;
}

export interface RulesResponse {
  rules: Rule[];
}

export interface BudgetsResponse {
  budgets: BudgetWithSpent[];
}

export interface RecurringResponse {
  items: Recurring[];
}

export interface ApplyRulesResponse {
  processed: number;
  updated: number;
  errors: number;
}

// ============================================
// Analytics types
// ============================================

export interface AnalyticsFilters {
  date_from?: string;
  date_to?: string;
  status?: TransactionStatus;
  source_type?: SourceType;
  category_id?: string;
  tag_id?: string;
  merchant_id?: string;
  min_amount?: number;
  max_amount?: number;
  search?: string;
}

export interface AnalyticsSummary {
  total_income: number;
  total_expenses: number;
  net: number;
  pending_count: number;
  pending_amount: number;
  booked_count: number;
  booked_amount: number;
  transaction_count: number;
  avg_transaction: number;
  period: {
    start: string;
    end: string;
  };
}

export interface CategoryBreakdown {
  category_id: string | null;
  category_name: string;
  category_color: string | null;
  parent_id: string | null;
  total: number;
  count: number;
  percentage: number;
  children?: CategoryBreakdown[];
}

export interface MerchantBreakdown {
  merchant_id: string | null;
  merchant_name: string;
  total: number;
  count: number;
  avg: number;
  trend: number; // Percentage change from previous period
}

export interface TimeSeriesPoint {
  date: string;
  income: number;
  expenses: number;
  net: number;
  count: number;
}

export interface SubscriptionDetection {
  merchant_name: string;
  merchant_id: string | null;
  amount: number;
  frequency: RecurringCadence;
  confidence: number;
  last_date: string;
  next_expected: string;
  transaction_ids: string[];
}

// Recurring item for insights display - alias for SubscriptionDetection (what backend returns)
export type RecurringItem = SubscriptionDetection;

export interface AnomalyItem {
  transaction_id: string;
  description: string;
  amount: number;
  date: string;
  reason: string;
  severity: 'low' | 'medium' | 'high';
  z_score?: number;
}

export interface PeriodComparison {
  current: AnalyticsSummary;
  previous: AnalyticsSummary;
  change: {
    income: number;
    expenses: number;
    net: number;
    count: number;
  };
  change_percentage: {
    income: number;
    expenses: number;
    net: number;
    count: number;
  };
}

// ============================================
// Query parameters
// ============================================

export interface TransactionsQuery {
  date_from?: string;
  date_to?: string;
  status?: TransactionStatus;
  source_type?: SourceType;
  category_id?: string;
  tag_id?: string;
  merchant_id?: string;
  merchant_name?: string;
  include_transfers?: boolean;
  min_amount?: number;
  max_amount?: number;
  search?: string;
  limit?: number;
  offset?: number;
  sort_by?: 'date' | 'amount' | 'description';
  sort_order?: 'asc' | 'desc';
}

export interface AnalyticsQuery {
  date_from: string;
  date_to: string;
  status?: TransactionStatus;
  source_type?: SourceType;
  category_id?: string;
  tag_id?: string;
  merchant_id?: string;
  include_transfers?: boolean;
  granularity?: 'day' | 'week' | 'month';
}

export interface CompareQuery {
  date_from_1: string;
  date_to_1: string;
  date_from_2: string;
  date_to_2: string;
}

// ============================================
// Analytics response types
// ============================================

export interface AnalyticsSummaryResponse extends AnalyticsSummary { }

export interface CategoryBreakdownResponse {
  categories: CategoryBreakdown[];
}

export interface MerchantBreakdownResponse {
  merchants: MerchantBreakdown[];
}

export interface TimeSeriesResponse {
  series: TimeSeriesPoint[];
  granularity: 'day' | 'week' | 'month';
}

export interface SubscriptionsResponse {
  subscriptions: RecurringItem[];
}

export interface AnomaliesResponse {
  anomalies: AnomalyItem[];
}

// AnalyticsCompareResponse is an alias for PeriodComparison (what the backend returns)
export type AnalyticsCompareResponse = PeriodComparison;
