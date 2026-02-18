import { useMemo, useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';
import {
  TrendingDown,
  Clock,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  Tag,
  Info,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import {
  formatCurrency,
  formatCompactCurrency,
  formatPercentage,
  formatDate,
  formatDateShort,
  formatDateLocal,
  formatMonth,
  getMonthRange,
  getPreviousMonthRange,
  getYearToDateRange,
  cn,
} from '@/lib/utils';
import type {
  CategoryBreakdown,
  Category,
  MerchantBreakdown,
  TimeSeriesPoint,
  AnomalyItem,
  FlowType,
  TransactionStatus,
  AnalyticsOverview,
  BudgetTrackingPeriod,
} from '@expense/shared';
import { CATEGORY_IDS } from '@expense/shared';
import { TransactionsDrilldownDialog } from '@/components/TransactionsDrilldownDialog';
import { ChartTooltip } from '@/components/charts/ChartTooltip';
import { useTranslation } from 'react-i18next';
import { clearLastDateRange, loadLastDateRange, saveLastDateRange } from '@/lib/date-range-store';
import { localizeCategoryName } from '@/lib/category-localization';
import { darkenHexColor, getCategoryChartColor } from '@/lib/category-chart-colors';
import { useAuth } from '@/context/AuthContext';
import { makePageCacheKey, readPageCache, writePageCache } from '@/lib/page-data-cache';
import { SpendingConstellation } from '@/components/dashboard/SpendingConstellation';
import { computeSpendingMomentum } from '@/lib/dashboard-momentum';

export function DashboardPage() {
  const DASHBOARD_CACHE_TTL_MS = 30_000;
  const DASHBOARD_MERCHANTS_CACHE_TTL_MS = 30_000;
  const DASHBOARD_TREND_CACHE_TTL_MS = 45_000;
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const currentLanguage = i18n.resolvedLanguage || i18n.language;
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadingMerchants, setLoadingMerchants] = useState(true);
  const [loadingAnomalies, setLoadingAnomalies] = useState(true);
  const [loadingTrend, setLoadingTrend] = useState(true);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [categories, setCategories] = useState<CategoryBreakdown[]>([]);
  const [merchants, setMerchants] = useState<MerchantBreakdown[]>([]);
  const [merchantComparisonPeriod, setMerchantComparisonPeriod] = useState<{
    current_start: string;
    current_end: string;
    previous_start: string;
    previous_end: string;
  } | null>(null);
  const [timeseries, setTimeseries] = useState<TimeSeriesPoint[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyItem[]>([]);
  const [trendSeries, setTrendSeries] = useState<TimeSeriesPoint[]>([]);
  const [budgetTracking, setBudgetTracking] = useState<BudgetTrackingPeriod[]>([]);
  const [budgetsEnabled, setBudgetsEnabled] = useState(false);
  const [trendMonths, setTrendMonths] = useState<3 | 6 | 12>(12);
  const [trendCategoryId, setTrendCategoryId] = useState<string>(CATEGORY_IDS.groceries);
  const [flatCategories, setFlatCategories] = useState<Category[]>([]);
  // Default ON: this is the main value of the dashboard for most users.
  const [showCategoryDetails, setShowCategoryDetails] = useState(true);
  const baseRequestIdRef = useRef(0);
  const merchantRequestIdRef = useRef(0);
  const trendRequestIdRef = useRef(0);

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCategoryId = searchParams.get('category_id') || '';
  const userId = user?.id || 'anonymous';

  const defaultRange = useMemo(() => {
    const stored = loadLastDateRange();
    return stored ?? getYearToDateRange();
  }, []);
  const dateFrom = searchParams.get('date_from') || defaultRange.start;
  const dateTo = searchParams.get('date_to') || defaultRange.end;
  const statusFilter = (() => {
    const s = searchParams.get('status');
    return s === 'booked' || s === 'pending' ? (s as TransactionStatus) : '';
  })();
  const excludeTransfers = (() => {
    const v = searchParams.get('include_transfers');
    return !(v === '1' || v === 'true');
  })();

  const trailingMonthsRange = (months: number) => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    const date_from = formatDateLocal(start);
    const date_to = formatDateLocal(now);
    return { date_from, date_to };
  };

  const formatYearMonth = (ym: string) => {
    if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, (m || 1) - 1, 1);
    // Keep it short and locale-aware (nb-NO will render Norwegian month names).
    return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  };

  const selectableCategories = useMemo(() => {
    return flatCategories
      .filter((c) => !Boolean((c as any).is_transfer))
      .filter((c) => !String(c.id).startsWith('cat_income'))
      .filter((c) => c.id !== CATEGORY_IDS.transfers);
  }, [flatCategories]);

  const trendCategoryName = useMemo(() => {
    const name = selectableCategories.find((c) => c.id === trendCategoryId)?.name || t('dashboard.groceries');
    return localizeCategoryName(name, currentLanguage);
  }, [selectableCategories, trendCategoryId, t, currentLanguage]);

  const trendTotal = useMemo(() => {
    return trendSeries.reduce((sum, point) => sum + (point.expenses ?? 0), 0);
  }, [trendSeries]);

  const trendTotalCount = useMemo(() => {
    return trendSeries.reduce((sum, point) => sum + (point.count ?? 0), 0);
  }, [trendSeries]);

  const updateSearch = (fn: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(searchParams);
    fn(next);
    setSearchParams(next, { replace: false });
  };

  // Remember the last selected date range for next visit (unless URL pins it).
  useEffect(() => {
    if (dateFrom && dateTo) saveLastDateRange({ start: dateFrom, end: dateTo });
    else if (!dateFrom && !dateTo) clearLastDateRange();
  }, [dateFrom, dateTo]);

  // Drilldown state
  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const [drilldownTitle, setDrilldownTitle] = useState('');
  const [drilldownSubtitle, setDrilldownSubtitle] = useState('');
  const [drilldownCategory, setDrilldownCategory] = useState<string | undefined>();
  const [drilldownMerchantId, setDrilldownMerchantId] = useState<string | undefined>();
  const [drilldownMerchantName, setDrilldownMerchantName] = useState<string | undefined>();
  const [drilldownTransactionId, setDrilldownTransactionId] = useState<string | undefined>();
  const [drilldownDateFrom, setDrilldownDateFrom] = useState<string | undefined>();
  const [drilldownDateTo, setDrilldownDateTo] = useState<string | undefined>();
  const [drilldownStatus, setDrilldownStatus] = useState<TransactionStatus | undefined>();
  const [drilldownFlowType, setDrilldownFlowType] = useState<FlowType | undefined>();
  const [drilldownIncludeTransfers, setDrilldownIncludeTransfers] = useState<boolean | undefined>();
  const [drilldownMinAmount, setDrilldownMinAmount] = useState<number | undefined>();
  const [drilldownMaxAmount, setDrilldownMaxAmount] = useState<number | undefined>();

  const openKPIDrilldown = (title: string, opts: { status?: TransactionStatus, flowType?: FlowType } = {}) => {
    setDrilldownTitle(title);
    setDrilldownSubtitle(`${overview?.period.start ?? dateFrom} - ${overview?.period.end ?? dateTo}`);
    setDrilldownStatus(opts.status);
    setDrilldownFlowType(opts.flowType);
    setDrilldownIncludeTransfers(!excludeTransfers);
    setDrilldownMinAmount(undefined);
    setDrilldownMaxAmount(undefined);
    setDrilldownCategory(undefined);
    setDrilldownMerchantId(undefined);
    setDrilldownMerchantName(undefined);
    setDrilldownTransactionId(undefined);
    setDrilldownDateFrom(overview?.period.start);
    setDrilldownDateTo(overview?.period.end);
    setDrilldownOpen(true);
  };

  const openMonthDrilldown = (ym: string) => {
    if (!/^\d{4}-\d{2}$/.test(ym)) return;
    const [yy, mm] = ym.split('-').map((v) => Number(v));
    if (!Number.isFinite(yy) || !Number.isFinite(mm)) return;

    const monthIndex = mm - 1;
    const start = `${ym}-01`;
    const end = formatDateLocal(new Date(yy, monthIndex + 1, 0));

    setDrilldownTitle(`${trendCategoryName}: ${formatYearMonth(ym)}`);
    setDrilldownSubtitle(`${start} - ${end}`);
    setDrilldownCategory(trendCategoryId);
    setDrilldownMerchantId(undefined);
    setDrilldownMerchantName(undefined);
    setDrilldownTransactionId(undefined);
    setDrilldownDateFrom(start);
    setDrilldownDateTo(end);
    setDrilldownStatus(statusFilter ? (statusFilter as TransactionStatus) : undefined);
    setDrilldownFlowType('expense');
    setDrilldownIncludeTransfers(false);
    setDrilldownMinAmount(undefined);
    setDrilldownMaxAmount(undefined);
    setDrilldownOpen(true);
  };

  useEffect(() => {
    api
      .getCategoriesFlat()
      .then((res) => setFlatCategories(Array.isArray((res as any)?.categories) ? (res as any).categories : []))
      .catch(() => setFlatCategories([]));
  }, []);

  useEffect(() => {
    const requestId = ++baseRequestIdRef.current;
    const hasLoadedOnce = Boolean(overview);
    const baseCacheKey = makePageCacheKey('dashboard:base', {
      userId,
      dateFrom,
      dateTo,
      status: statusFilter || '',
      includeTransfers: !excludeTransfers,
    });
    const cached = readPageCache<{
      overview: AnalyticsOverview | null;
      categories: CategoryBreakdown[];
      timeseries: TimeSeriesPoint[];
      anomalies: AnomalyItem[];
      budgetTracking: BudgetTrackingPeriod[];
      budgetsEnabled: boolean;
    }>(baseCacheKey);
    if (cached) {
      setOverview(cached.overview);
      setCategories(cached.categories);
      setTimeseries(cached.timeseries);
      setAnomalies(cached.anomalies);
      setBudgetTracking(cached.budgetTracking);
      setBudgetsEnabled(cached.budgetsEnabled);
      setLoading(false);
      setIsRefreshing(false);
      setLoadingAnomalies(false);
    }
    if (hasLoadedOnce) setIsRefreshing(true);
    else setLoading(true);

    async function loadBaseData() {
      setLoadingAnomalies(true);
      try {
        const overviewPromise = api.getAnalyticsOverview({
          date_from: dateFrom,
          date_to: dateTo,
          status: statusFilter || undefined,
          include_transfers: !excludeTransfers,
        });
        const categoriesPromise = api.getAnalyticsByCategory({
          date_from: dateFrom,
          date_to: dateTo,
          status: statusFilter || undefined,
          include_transfers: !excludeTransfers,
        });
        const timeseriesPromise = api.getAnalyticsTimeseries({
          date_from: dateFrom,
          date_to: dateTo,
          status: statusFilter || undefined,
          granularity: 'day',
          include_transfers: !excludeTransfers,
        });
        const budgetTrackingPromise = api.getBudgetTracking();
        const anomaliesPromise = api.getAnalyticsAnomalies({
          date_from: dateFrom,
          date_to: dateTo,
          status: statusFilter || undefined,
          include_transfers: !excludeTransfers,
        });

        const overviewRes = await overviewPromise;

        if (requestId !== baseRequestIdRef.current) return;
        setOverview(overviewRes);
        setLoading(false);
        setIsRefreshing(false);
        const [categoriesRes, timeseriesRes, budgetTrackingRes, anomaliesRes] =
          await Promise.allSettled([categoriesPromise, timeseriesPromise, budgetTrackingPromise, anomaliesPromise]);

        if (requestId !== baseRequestIdRef.current) return;

        if (categoriesRes.status === 'fulfilled') {
          setCategories(categoriesRes.value.categories);
        }
        if (timeseriesRes.status === 'fulfilled') {
          setTimeseries(timeseriesRes.value.series);
        }
        if (budgetTrackingRes.status === 'fulfilled') {
          setBudgetTracking(budgetTrackingRes.value.periods || []);
          setBudgetsEnabled(Boolean(budgetTrackingRes.value.enabled));
        }
        if (anomaliesRes.status === 'fulfilled') {
          setAnomalies(anomaliesRes.value.anomalies.slice(0, 5));
        }

        writePageCache(
          baseCacheKey,
          {
            overview: overviewRes,
            categories: categoriesRes.status === 'fulfilled' ? categoriesRes.value.categories : categories,
            timeseries: timeseriesRes.status === 'fulfilled' ? timeseriesRes.value.series : timeseries,
            anomalies: anomaliesRes.status === 'fulfilled' ? anomaliesRes.value.anomalies.slice(0, 5) : anomalies,
            budgetTracking: budgetTrackingRes.status === 'fulfilled' ? (budgetTrackingRes.value.periods || []) : budgetTracking,
            budgetsEnabled: budgetTrackingRes.status === 'fulfilled' ? Boolean(budgetTrackingRes.value.enabled) : budgetsEnabled,
          },
          DASHBOARD_CACHE_TTL_MS
        );
      } catch (err) {
        if (requestId !== baseRequestIdRef.current) return;
        console.error('Failed to load dashboard data:', err);
      } finally {
        if (requestId === baseRequestIdRef.current) {
          setLoading(false);
          setIsRefreshing(false);
          setLoadingAnomalies(false);
        }
      }
    }

    void loadBaseData();
  }, [excludeTransfers, dateFrom, dateTo, statusFilter, userId]);

  useEffect(() => {
    const requestId = ++merchantRequestIdRef.current;
    const merchantsCacheKey = makePageCacheKey('dashboard:merchants', {
      userId,
      dateFrom,
      dateTo,
      status: statusFilter || '',
      includeTransfers: !excludeTransfers,
      selectedCategoryId,
    });
    const cached = readPageCache<{
      merchants: MerchantBreakdown[];
      comparison_period: {
        current_start: string;
        current_end: string;
        previous_start: string;
        previous_end: string;
      } | null;
    }>(merchantsCacheKey);
    if (cached) {
      setMerchants(cached.merchants);
      setMerchantComparisonPeriod(cached.comparison_period);
      setLoadingMerchants(false);
    }
    setLoadingMerchants(true);

    async function loadMerchants() {
      try {
        const merchantsRes = await api.getAnalyticsByMerchant({
          date_from: dateFrom,
          date_to: dateTo,
          limit: 12,
          status: statusFilter || undefined,
          include_transfers: !excludeTransfers,
          category_id: selectedCategoryId || undefined,
        });
        if (requestId !== merchantRequestIdRef.current) return;
        setMerchants(merchantsRes.merchants);
        setMerchantComparisonPeriod(merchantsRes.comparison_period ?? null);
        writePageCache(
          merchantsCacheKey,
          { merchants: merchantsRes.merchants, comparison_period: merchantsRes.comparison_period ?? null },
          DASHBOARD_MERCHANTS_CACHE_TTL_MS
        );
      } catch (err) {
        if (requestId !== merchantRequestIdRef.current) return;
        console.error('Failed to load dashboard merchants:', err);
      } finally {
        if (requestId === merchantRequestIdRef.current) {
          setLoadingMerchants(false);
        }
      }
    }

    void loadMerchants();
  }, [excludeTransfers, selectedCategoryId, dateFrom, dateTo, statusFilter, userId]);

  useEffect(() => {
    const requestId = ++trendRequestIdRef.current;
    const trendCacheKey = makePageCacheKey('dashboard:trend', {
      userId,
      trendMonths,
      trendCategoryId,
      status: statusFilter || '',
    });
    const cached = readPageCache<TimeSeriesPoint[]>(trendCacheKey);
    if (cached) {
      setTrendSeries(cached);
      setLoadingTrend(false);
    }
    setLoadingTrend(true);

    async function loadTrend() {
      try {
        const trendRes = await api.getAnalyticsTimeseries({
          ...trailingMonthsRange(trendMonths),
          status: statusFilter || undefined,
          granularity: 'month',
          include_transfers: false,
          category_id: trendCategoryId,
        });
        if (requestId !== trendRequestIdRef.current) return;
        setTrendSeries(trendRes.series);
        writePageCache(trendCacheKey, trendRes.series, DASHBOARD_TREND_CACHE_TTL_MS);
      } catch (err) {
        if (requestId !== trendRequestIdRef.current) return;
        console.error('Failed to load dashboard trend:', err);
      } finally {
        if (requestId === trendRequestIdRef.current) {
          setLoadingTrend(false);
        }
      }
    }

    void loadTrend();
  }, [trendMonths, trendCategoryId, statusFilter, userId]);

  const categorizedCount = categories.filter((cat) => cat.category_id).length;
  const hasCategorization = categorizedCount > 0;

  const selectedCategory = selectedCategoryId
    ? categories.find((c) => c.category_id === selectedCategoryId) || null
    : null;

  const getSafeTrend = (merchant: MerchantBreakdown): number | null => {
    const prevTotal = Number(merchant.previous_total ?? 0);
    const trend = Number(merchant.trend);
    if (!Number.isFinite(trend) || prevTotal <= 0) return null;
    if (merchant.trend_basis_valid === false) return null;
    const expected = ((Number(merchant.total) - prevTotal) / prevTotal) * 100;
    if (!Number.isFinite(expected)) return null;
    if (Math.abs(expected - trend) > 0.25) return null;
    return trend;
  };

  const topExpenseCategoryTiles = useMemo(() => {
    const rows = categories
      .filter((c) => Boolean(c.category_id))
      .filter((c) => c.category_id !== CATEGORY_IDS.transfers)
      .filter((c) => !String(c.category_id || '').startsWith('cat_income'));

    return [...rows]
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
      .slice(0, 4);
  }, [categories]);

  const constellationItems = useMemo(() => {
    return topExpenseCategoryTiles.slice(0, 6).map((category, index) => {
      const seed = String(category.category_id || category.category_name || index);
      const fill = category.category_color || getCategoryChartColor(seed);
      return {
        id: String(category.category_id || category.category_name || index),
        name: localizeCategoryName(category.category_name, currentLanguage),
        total: Math.abs(category.total),
        count: category.count,
        fill,
        depthFill: darkenHexColor(fill, 0.32),
      };
    });
  }, [topExpenseCategoryTiles, currentLanguage]);

  const momentumEndDate = useMemo(() => {
    const today = formatDateLocal(new Date());
    return dateTo > today ? today : dateTo;
  }, [dateTo]);

  const spendingMomentum = useMemo(
    () => computeSpendingMomentum(timeseries, { start: dateFrom, end: momentumEndDate }),
    [timeseries, dateFrom, momentumEndDate]
  );

  const formatAbsolutePercent = (value: number) => {
    const locale = currentLanguage === 'nb' ? 'nb-NO' : 'en-US';
    const formatted = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(Math.abs(value));
    return `${formatted}%`;
  };

  const momentumText = useMemo(() => {
    if (!spendingMomentum || spendingMomentum.changePct === null) {
      return currentLanguage === 'nb' ? 'For lite historikk ennå' : 'Not enough history yet';
    }

    const pct = formatAbsolutePercent(spendingMomentum.changePct);
    if (spendingMomentum.trend === 'heating') {
      return currentLanguage === 'nb' ? `${pct} opp mot første halvdel` : `${pct} up vs first half`;
    }
    if (spendingMomentum.trend === 'cooling') {
      return currentLanguage === 'nb' ? `${pct} ned mot første halvdel` : `${pct} down vs first half`;
    }
    return currentLanguage === 'nb' ? 'Stabil utvikling i perioden' : 'Stable movement in this period';
  }, [spendingMomentum, currentLanguage]);

  const momentumHelpText = useMemo(() => {
    return currentLanguage === 'nb'
      ? 'Momentum sammenligner total forbruk i andre halvdel av valgt periode mot f\u00F8rste halvdel.'
      : 'Momentum compares total spending in the second half of the selected period against the first half.';
  }, [currentLanguage]);

  const momentumBreakdownText = useMemo(() => {
    if (!spendingMomentum || spendingMomentum.changePct === null) return '';
    if (currentLanguage === 'nb') {
      const firstRange = spendingMomentum
        ? `${formatDate(spendingMomentum.firstFrom)}-${formatDate(spendingMomentum.firstTo)}`
        : '';
      const secondRange = spendingMomentum
        ? `${formatDate(spendingMomentum.secondFrom)}-${formatDate(spendingMomentum.secondTo)}`
        : '';
      return `1. halvdel${firstRange ? ` (${firstRange})` : ''}: ${formatCurrency(spendingMomentum.firstHalf)} | 2. halvdel${secondRange ? ` (${secondRange})` : ''}: ${formatCurrency(spendingMomentum.secondHalf)} | Endring: ${formatCurrency(spendingMomentum.delta, true)}`;
    }
    const firstRange = spendingMomentum
      ? `${spendingMomentum.firstFrom}-${spendingMomentum.firstTo}`
      : '';
    const secondRange = spendingMomentum
      ? `${spendingMomentum.secondFrom}-${spendingMomentum.secondTo}`
      : '';
    return `First half${firstRange ? ` (${firstRange})` : ''}: ${formatCurrency(spendingMomentum.firstHalf)} | Second half${secondRange ? ` (${secondRange})` : ''}: ${formatCurrency(spendingMomentum.secondHalf)} | Change: ${formatCurrency(spendingMomentum.delta, true)}`;
  }, [spendingMomentum, currentLanguage]);

  const topCategoryPieData = useMemo(() => {
    return categories.slice(0, 8).map((category, index) => {
      const seed = String(category.category_id || category.category_name || index);
      const fill = category.category_color || getCategoryChartColor(seed);
      return {
        ...category,
        name: localizeCategoryName(category.category_name, currentLanguage),
        fill,
        depthFill: darkenHexColor(fill, 0.3),
      };
    });
  }, [categories, currentLanguage]);

  const openCategoryDrilldown = (entry: CategoryBreakdown) => {
    const qs = new URLSearchParams();
    qs.set('date_from', dateFrom);
    qs.set('date_to', dateTo);
    qs.set('include_transfers', excludeTransfers ? '0' : '1');
    if (statusFilter) qs.set('status', statusFilter);
    if (entry.category_id) qs.set('category_id', String(entry.category_id));
    qs.set('flow_type', 'expense');
    qs.set('sort_by', 'amount_abs');
    qs.set('sort_order', 'desc');
    navigate(`/transactions?${qs.toString()}`);
  };

  if (loading && !overview) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t('nav.dashboard')}</h1>
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map(i => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardContent className="pt-6">
              <Skeleton className="h-[300px]" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <Skeleton className="h-[300px]" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('nav.dashboard')}</h1>
          <div className="text-sm text-white/60">
            {overview?.period.start ?? dateFrom} - {overview?.period.end ?? dateTo}
          </div>
          {isRefreshing && <div className="text-xs text-white/45">{currentLanguage === 'nb' ? 'Oppdaterer...' : 'Updating...'}</div>}
          {selectedCategory && (
            <div className="mt-1 text-sm">
              <button
                type="button"
                className="text-blue-600 hover:underline"
                onClick={() => {
                  updateSearch((next) => next.delete('category_id'));
                }}
              >
                {t('dashboard.allCategories')}
              </button>
              <span className="text-white/25 mx-2">/</span>
              <span className="font-medium">{localizeCategoryName(selectedCategory.category_name, currentLanguage)}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              className="px-2 py-1 text-xs font-medium rounded border border-white/15 hover:bg-white/10"
              onClick={() => {
                const r = getMonthRange();
                updateSearch((next) => {
                  next.set('date_from', r.start);
                  next.set('date_to', r.end);
                });
              }}
            >
              {t('common.thisMonth')}
            </button>
            <button
              type="button"
              className="px-2 py-1 text-xs font-medium rounded border border-white/15 hover:bg-white/10"
              onClick={() => {
                const r = getPreviousMonthRange();
                updateSearch((next) => {
                  next.set('date_from', r.start);
                  next.set('date_to', r.end);
                });
              }}
            >
              {t('common.lastMonth')}
            </button>
            <button
              type="button"
              className="px-2 py-1 text-xs font-medium rounded border border-white/15 hover:bg-white/10"
              onClick={() => {
                const r = getYearToDateRange();
                updateSearch((next) => {
                  next.set('date_from', r.start);
                  next.set('date_to', r.end);
                });
              }}
            >
              {t('common.yearToDate')}
            </button>
          </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
            <div className="flex items-center gap-2 text-sm text-white/80">
              <span className="text-white/60">{t('common.fromDate')}</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  updateSearch((next) => {
                    if (e.target.value) next.set('date_from', e.target.value);
                    else next.delete('date_from');
                  });
                }}
                className="h-9 px-2 rounded border border-white/15"
              />
              <span className="text-white/60">{t('common.toDate')}</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  updateSearch((next) => {
                    if (e.target.value) next.set('date_to', e.target.value);
                    else next.delete('date_to');
                  });
                }}
                className="h-9 px-2 rounded border border-white/15"
              />
            </div>

            <div className="flex items-center gap-2 text-sm text-white/80">
              <span className="text-white/60">{t('common.status')}</span>
              <select
                value={statusFilter}
                onChange={(e) => {
                  const v = e.target.value;
                  updateSearch((next) => {
                    if (v) next.set('status', v);
                    else next.delete('status');
                  });
                }}
                className="h-9 px-2 rounded border border-white/15"
              >
                <option value="">{t('common.all')}</option>
                <option value="booked">{t('common.booked')}</option>
                <option value="pending">{t('common.pending')}</option>
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm text-white/80">
              <input
                type="checkbox"
                checked={excludeTransfers}
                onChange={(e) => {
                  const checked = e.target.checked;
                  updateSearch((next) => {
                    if (checked) next.delete('include_transfers');
                    else next.set('include_transfers', '1');
                  });
                }}
                className="h-4 w-4 rounded border-white/15 text-cyan-300 focus:ring-cyan-300/60"
              />
              {t('common.excludeTransfers')}
            </label>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card
          className="cursor-pointer hover:bg-white/5 transition-colors"
          onClick={() => openKPIDrilldown(t('dashboard.spending'), { flowType: 'expense' })}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('dashboard.spending')}</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(overview?.expenses || 0)}</div>
            <p className="text-xs text-white/60 mt-1">
              {excludeTransfers ? t('dashboard.transfersExcluded') : t('dashboard.transfersIncluded')}
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:bg-white/5 transition-colors"
          onClick={() => {
            const qs = new URLSearchParams();
            qs.set('date_from', dateFrom);
            qs.set('date_to', dateTo);
            qs.set('include_transfers', '1');
            qs.set('flow_type', 'transfer');
            if (statusFilter) qs.set('status', statusFilter);
            navigate(`/transactions?${qs.toString()}`);
          }}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('dashboard.transfers')}</CardTitle>
            <ArrowRight className="h-4 w-4 text-white/60" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(overview?.transfers.total || 0)}</div>
            <p className="text-xs text-white/60 mt-1">
              {t('dashboard.transfersIn')} {formatCurrency(overview?.transfers.in || 0)} / {t('dashboard.transfersOut')} {formatCurrency(overview?.transfers.out || 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {budgetsEnabled && (
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.budgetPulse')}</CardTitle>
          </CardHeader>
          <CardContent>
            {budgetTracking.length === 0 ? (
              <p className="text-sm text-white/65">{t('dashboard.budgetNoTargets')}</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-3">
                {budgetTracking.map((item) => {
                  const pct = Math.round(Math.min(100, Math.max(0, item.progress_ratio * 100)));
                  const label =
                    item.period === 'weekly'
                      ? t('budgetsPage.period.weekly')
                      : item.period === 'monthly'
                        ? t('budgetsPage.period.monthly')
                        : t('budgetsPage.period.yearly');
                  const statusText =
                    item.status === 'on_track'
                      ? t('budgetsPage.status.on_track')
                      : item.status === 'warning'
                        ? t('budgetsPage.status.warning')
                        : t('budgetsPage.status.over_budget');

                  return (
                    <div key={item.period} className="rounded-lg border border-white/12 bg-white/5 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">{label}</p>
                        <span className="text-xs text-white/70">{statusText}</span>
                      </div>
                      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full bg-cyan-300" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-xs text-white/70">
                        {t('budgetsPage.spent')}: {formatCurrency(item.spent_amount)} / {formatCurrency(item.budget_amount)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quick shortcuts */}
      {topExpenseCategoryTiles.length > 0 && (
        <section className="space-y-3" aria-labelledby="top-expense-categories-heading">
          <h2 id="top-expense-categories-heading" className="text-sm font-semibold text-white/70">
            {t('dashboard.topExpenseCards')}
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {topExpenseCategoryTiles.map((cat) => (
              <Card
                key={String(cat.category_id)}
                className="cursor-pointer hover:bg-white/5 transition-colors"
                onClick={() => {
                  const qs = new URLSearchParams();
                  qs.set('date_from', dateFrom);
                  qs.set('date_to', dateTo);
                  if (!excludeTransfers) qs.set('include_transfers', '1');
                  if (statusFilter) qs.set('status', statusFilter);
                  if (cat.category_id) qs.set('category_id', String(cat.category_id));
                  qs.set('flow_type', 'expense');
                  navigate(`/transactions?${qs.toString()}`);
                }}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium truncate">{localizeCategoryName(cat.category_name, currentLanguage)}</CardTitle>
                  <Tag className="h-4 w-4 text-white/60" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(Math.abs(cat.total))}</div>
                  <p className="text-xs text-white/60 mt-1">
                    {cat.count} {t('dashboard.txCountShort')}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {constellationItems.length > 0 && (
        <SpendingConstellation
          title={currentLanguage === 'nb' ? 'Forbruks-konstellasjon' : 'Spending constellation'}
          subtitle={
            currentLanguage === 'nb'
              ? 'Klikk en boble for å åpne transaksjoner i valgt kategori.'
              : 'Click a node to open transactions for that category.'
          }
          emptyLabel={t('dashboard.noCategorizedTransactions')}
          hintLabel={
            currentLanguage === 'nb'
              ? 'Størrelsen viser totalbeløp i perioden. Perfekt for rask sammenligning.'
              : 'Node size shows period totals for quick comparison.'
          }
          momentumTitle={currentLanguage === 'nb' ? 'Momentum' : 'Momentum'}
          momentumText={momentumText}
          momentumHelpText={momentumHelpText}
          momentumBreakdownText={momentumBreakdownText}
          items={constellationItems}
          onSelect={(id) => {
            const selected = topExpenseCategoryTiles.find((category, index) => {
              const categoryId = String(category.category_id || category.category_name || index);
              return categoryId === id;
            });
            if (selected) openCategoryDrilldown(selected);
          }}
        />
      )}

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Spending Trend */}
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.spendingTrend')}</CardTitle>
          </CardHeader>
          <CardContent>
            {timeseries.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart
                  data={timeseries}
                  onClick={(state: any) => {
                    if (state && state.activePayload && state.activePayload.length > 0) {
                      const point = state.activePayload[0].payload as TimeSeriesPoint;
                      setDrilldownDateFrom(point.date);
                      setDrilldownDateTo(point.date);
                      setDrilldownTitle(t('dashboard.transactionsOnDate', { date: formatDateShort(point.date) }));
                      setDrilldownSubtitle('');
                      setDrilldownCategory(undefined);
                      setDrilldownMerchantId(undefined);
                      setDrilldownMerchantName(undefined);
                      setDrilldownTransactionId(undefined);
                      setDrilldownFlowType(undefined);
                      setDrilldownIncludeTransfers(!excludeTransfers);
                      setDrilldownMinAmount(undefined);
                      setDrilldownMaxAmount(undefined);
                      setDrilldownOpen(true);
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-white/10" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDateShort}
                    className="text-xs"
                  />
                  <YAxis tickFormatter={formatCompactCurrency} className="text-xs" />
                  <Tooltip
                    content={(
                      <ChartTooltip
                        valueFormatter={(value) => formatCurrency(value)}
                        labelFormatter={(value) => formatDateShort(String(value))}
                      />
                    )}
                  />
                  <Line
                    type="monotone"
                    dataKey="expenses"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={false}
                    name={t('dashboard.spending')}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[300px] items-center justify-center text-white/60">
                {t('dashboard.noDataForPeriod')}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Category Breakdown */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>{t('dashboard.spendingByCategory')}</CardTitle>
              <button
                type="button"
                onClick={() => setShowCategoryDetails((prev) => !prev)}
                className="text-xs font-medium text-cyan-200/90 hover:text-cyan-100"
              >
                {showCategoryDetails ? t('dashboard.hideDetails') : t('dashboard.showDetails')}
              </button>
            </div>
            <p className="text-xs text-white/60">
              {t('dashboard.categoryDrilldownHint')}
            </p>
          </CardHeader>
          <CardContent>
            {showCategoryDetails && hasCategorization ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <defs>
                    <filter id="categoryPieShadow" x="-30%" y="-30%" width="160%" height="160%">
                      <feDropShadow dx="0" dy="7" stdDeviation="5" floodColor="rgba(0,0,0,0.45)" />
                    </filter>
                  </defs>
                  <Pie
                    data={topCategoryPieData}
                    cx="50%"
                    cy="52%"
                    innerRadius={62}
                    outerRadius={102}
                    dataKey="total"
                    nameKey="name"
                    stroke="none"
                    isAnimationActive={false}
                  >
                    {topCategoryPieData.map((entry, index) => (
                      <Cell key={`cell-depth-${index}`} fill={entry.depthFill} opacity={0.95} />
                    ))}
                  </Pie>
                  <Pie
                    data={topCategoryPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="total"
                    nameKey="name"
                    style={{ filter: 'url(#categoryPieShadow)' }}
                    label={({ name, percent }) =>
                      (percent ?? 0) > 0.05 ? `${name} ${((percent ?? 0) * 100).toFixed(0)}%` : ''
                    }
                    labelLine={false}
                    className="cursor-pointer outline-none"
                  >
                    {topCategoryPieData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.fill}
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => openCategoryDrilldown(entry)}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    content={(
                      <ChartTooltip valueFormatter={(value) => formatCurrency(value)} />
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[300px] items-center justify-center text-white/60">
                {hasCategorization ? t('dashboard.useShowDetailsHint') : t('dashboard.noCategorizedTransactions')}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Groceries trend */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle>{t('dashboard.categoryMonthlyTrend')}</CardTitle>
            <div className="flex items-center gap-2">
              {[3, 6, 12].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setTrendMonths(m as 3 | 6 | 12)}
                className={cn(
                  'px-2 py-1 rounded text-xs font-medium border',
                  trendMonths === m
                      ? 'bg-white/12 text-white border-white/20'
                      : 'bg-transparent text-white/70 border-white/15 hover:bg-white/10 hover:text-white'
                )}
              >
                {m === 3 ? t('dashboard.last3Months') : m === 6 ? t('dashboard.last6Months') : t('dashboard.last12Months')}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <p className="text-xs text-white/60">{t('dashboard.categoryMonthlyTrendHint')}</p>
            <p className="text-xs text-white/80">
              {t('dashboard.monthlyTrendTotal')}: <span className="font-medium text-white">{formatCurrency(trendTotal)}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-xs text-white/60">{t('common.category')}</span>
            <select
              value={trendCategoryId}
              onChange={(e) => setTrendCategoryId(e.target.value)}
              className="h-9 px-2 rounded border border-white/15 bg-white/5 text-sm text-white"
            >
              {selectableCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {localizeCategoryName(c.name, currentLanguage)}
                </option>
              ))}
            </select>
          </div>
        </div>
        </CardHeader>
        <CardContent>
          {loadingTrend && trendSeries.length === 0 ? (
            <div className="space-y-3">
              <Skeleton className="h-[200px] w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : trendSeries.length > 0 ? (
            <div className="space-y-4">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart
                  data={trendSeries.map((p) => ({ month: p.date, spend: p.expenses, count: p.count }))}
                  onClick={(e: any) => {
                    const label = e?.activeLabel;
                    if (typeof label === 'string') openMonthDrilldown(label);
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-white/10" />
                  <XAxis dataKey="month" tickFormatter={formatYearMonth} className="text-xs" />
                  <YAxis tickFormatter={formatCompactCurrency} className="text-xs" />
                  <Tooltip
                    content={(
                      <ChartTooltip
                        valueFormatter={(value) => formatCurrency(value)}
                        labelFormatter={(value) => formatYearMonth(String(value))}
                      />
                    )}
                  />
                  <Line
                    type="monotone"
                    dataKey="spend"
                    stroke="#f87171"
                    strokeWidth={2}
                    dot={false}
                    name={trendCategoryName}
                  />
                </LineChart>
              </ResponsiveContainer>

              {/* Exact monthly table (same data as chart). Click a month to drill down. */}
              <div className="rounded-lg border border-white/12 overflow-hidden">
                <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-white/5 text-xs font-medium text-white/70">
                  <div className="col-span-6">{t('dashboard.month')}</div>
                  <div className="col-span-4 text-right">{t('dashboard.spent')}</div>
                  <div className="col-span-2 text-right">{t('dashboard.txCountShort')}</div>
                </div>
                <div className="divide-y divide-white/10">
                  {[...trendSeries].slice().reverse().map((p) => (
                    <button
                      key={p.date}
                      type="button"
                      className="w-full text-left grid grid-cols-12 gap-2 px-3 py-2 hover:bg-white/5 transition-colors"
                      onClick={() => openMonthDrilldown(p.date)}
                      title={t('dashboard.clickToDrilldown')}
                    >
                      <div className="col-span-6 text-sm">{formatMonth(p.date)}</div>
                      <div className="col-span-4 text-sm text-right font-medium">{formatCurrency(p.expenses)}</div>
                      <div className="col-span-2 text-sm text-right text-white/60">{p.count}</div>
                    </button>
                  ))}
                  <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-white/5">
                    <div className="col-span-6 text-sm font-medium text-white/80">{t('common.total')}</div>
                    <div className="col-span-4 text-sm text-right font-semibold text-white">{formatCurrency(trendTotal)}</div>
                    <div className="col-span-2 text-sm text-right text-white/70">{trendTotalCount}</div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-[260px] items-center justify-center text-white/60">
              {t('dashboard.noGroceriesData')}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bottom row */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Top Merchants */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <span>{selectedCategory ? t('dashboard.merchantsInCategory') : t('dashboard.topMerchants')}</span>
                <span
                  className="inline-flex text-white/60 cursor-help"
                  title={
                    merchantComparisonPeriod
                      ? t('dashboard.topMerchantsTrendHintWithPeriod', {
                          from: merchantComparisonPeriod.previous_start,
                          to: merchantComparisonPeriod.previous_end,
                        })
                      : t('dashboard.topMerchantsTrendHint')
                  }
                  aria-label={
                    merchantComparisonPeriod
                      ? t('dashboard.topMerchantsTrendHintWithPeriod', {
                          from: merchantComparisonPeriod.previous_start,
                          to: merchantComparisonPeriod.previous_end,
                        })
                      : t('dashboard.topMerchantsTrendHint')
                  }
                  tabIndex={0}
                >
                  <Info className="h-3.5 w-3.5" />
                </span>
              </CardTitle>
              <p className="mt-1 text-xs text-white/60">
                {merchantComparisonPeriod
                  ? t('dashboard.topMerchantsTrendHintWithPeriod', {
                      from: merchantComparisonPeriod.previous_start,
                      to: merchantComparisonPeriod.previous_end,
                    })
                  : t('dashboard.topMerchantsTrendHint')}
              </p>
            </div>
            <Link to="/transactions" className="text-sm text-blue-500 hover:underline flex items-center gap-1">
              {t('dashboard.viewAll')} <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {loadingMerchants && merchants.length === 0 ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : merchants.length > 0 ? (
              <div className="space-y-4">
                {merchants.map((merchant, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between cursor-pointer hover:bg-white/5 p-2 rounded-lg transition-colors"
                    onClick={() => {
                      const qs = new URLSearchParams();
                      qs.set('date_from', dateFrom);
                      qs.set('date_to', dateTo);
                      qs.set('include_transfers', excludeTransfers ? '0' : '1');
                      if (statusFilter) qs.set('status', statusFilter);
                      if (selectedCategoryId) qs.set('category_id', selectedCategoryId);
                      qs.set('flow_type', 'expense');
                      // Use merchant_name filter so backend can apply the same unknown-merchant semantics.
                      if (merchant.merchant_name) {
                        qs.set('merchant_name', merchant.merchant_name);
                      }
                      navigate(`/transactions?${qs.toString()}`);
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-medium ">
                        {i + 1}
                      </div>
                      <div>
                        <p className="font-medium">{merchant.merchant_name}</p>
                        <p className="text-xs text-white/60">{merchant.count} transactions</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{formatCurrency(merchant.total)}</p>
                      {getSafeTrend(merchant) !== null && (
                        <p className={`text-xs ${merchant.trend > 0 ? 'text-red-500' : 'text-green-500'}`}>
                          {t('dashboard.trendVsPreviousPeriodWithTotal', {
                            value: formatPercentage(getSafeTrend(merchant) as number),
                            total: formatCurrency(merchant.previous_total || 0),
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-white/60 text-center py-8">{t('dashboard.noMerchantData')}</p>
            )}
          </CardContent>
        </Card>

        {/* Anomalies */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              {t('dashboard.unusualSpending')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingAnomalies && anomalies.length === 0 ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : anomalies.length > 0 ? (
              <div className="space-y-3">
                {anomalies.map((anomaly, i) => (
                  <button
                    key={i}
                    type="button"
                    className="w-full flex items-center justify-between p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-left"
                    onClick={() => {
                      setDrilldownTitle(t('dashboard.unusualSpending'));
                      setDrilldownSubtitle(anomaly.reason);
                      setDrilldownCategory(undefined);
                      setDrilldownMerchantId(undefined);
                      setDrilldownMerchantName(undefined);
                      setDrilldownTransactionId(anomaly.transaction_id);
                      setDrilldownDateFrom(undefined);
                      setDrilldownDateTo(undefined);
                      setDrilldownStatus(undefined);
                      setDrilldownFlowType(undefined);
                      setDrilldownIncludeTransfers(undefined);
                      setDrilldownMinAmount(undefined);
                      setDrilldownMaxAmount(undefined);
                      setDrilldownOpen(true);
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{anomaly.description}</p>
                      <p className="text-xs text-white/60">{anomaly.reason}</p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="font-medium text-red-500">{formatCurrency(anomaly.amount)}</p>
                      <Badge
                        variant={
                          anomaly.severity === 'high' ? 'destructive' :
                            anomaly.severity === 'medium' ? 'warning' : 'secondary'
                        }
                      >
                        {anomaly.severity}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-white/60 text-center py-8">{t('dashboard.noUnusualSpending')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <TransactionsDrilldownDialog
        open={drilldownOpen}
        onOpenChange={setDrilldownOpen}
        title={drilldownTitle}
        subtitle={drilldownSubtitle}
        transactionId={drilldownTransactionId}
        dateFrom={drilldownDateFrom}
        dateTo={drilldownDateTo}
        categoryId={drilldownCategory}
        merchantId={drilldownMerchantId}
        merchantName={drilldownMerchantName}
        status={drilldownStatus}
        flowType={drilldownFlowType}
        includeTransfers={drilldownIncludeTransfers}
        minAmount={drilldownMinAmount}
        maxAmount={drilldownMaxAmount}
      />
    </div>
  );
}
