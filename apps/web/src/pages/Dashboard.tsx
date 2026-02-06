import { useMemo, useState, useEffect } from 'react';
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
  TrendingUp,
  CreditCard,
  Clock,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  Tag,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import {
  formatCurrency,
  formatCompactCurrency,
  formatPercentage,
  formatDateShort,
  getMonthRange,
  getPreviousMonthRange,
  getYearToDateRange,
} from '@/lib/utils';
import type {
  CategoryBreakdown,
  MerchantBreakdown,
  TimeSeriesPoint,
  AnomalyItem,
  TransactionStatus,
  AnalyticsOverview,
} from '@expense/shared';
import { TransactionsDrilldownDialog } from '@/components/TransactionsDrilldownDialog';

export function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [categories, setCategories] = useState<CategoryBreakdown[]>([]);
  const [merchants, setMerchants] = useState<MerchantBreakdown[]>([]);
  const [timeseries, setTimeseries] = useState<TimeSeriesPoint[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyItem[]>([]);
  const [showCategoryDetails, setShowCategoryDetails] = useState(false);

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCategoryId = searchParams.get('category_id') || '';

  const defaultRange = useMemo(() => getMonthRange(), []);
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

  const updateSearch = (fn: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(searchParams);
    fn(next);
    setSearchParams(next, { replace: false });
  };

  // Drilldown state
  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const [drilldownTitle, setDrilldownTitle] = useState('');
  const [drilldownSubtitle, setDrilldownSubtitle] = useState('');
  const [drilldownCategory, setDrilldownCategory] = useState<string | undefined>();
  const [drilldownMerchantId, setDrilldownMerchantId] = useState<string | undefined>();
  const [drilldownMerchantName, setDrilldownMerchantName] = useState<string | undefined>();
  const [drilldownDateFrom, setDrilldownDateFrom] = useState<string | undefined>();
  const [drilldownDateTo, setDrilldownDateTo] = useState<string | undefined>();
  const [drilldownStatus, setDrilldownStatus] = useState<TransactionStatus | undefined>();
  const [drilldownMinAmount, setDrilldownMinAmount] = useState<number | undefined>();
  const [drilldownMaxAmount, setDrilldownMaxAmount] = useState<number | undefined>();

  const openKPIDrilldown = (title: string, opts: { status?: TransactionStatus, min?: number, max?: number }) => {
    setDrilldownTitle(title);
    setDrilldownSubtitle(`${overview?.period.start} - ${overview?.period.end}`);
    setDrilldownStatus(opts.status);
    setDrilldownMinAmount(opts.min);
    setDrilldownMaxAmount(opts.max);
    setDrilldownCategory(undefined);
    setDrilldownMerchantId(undefined);
    setDrilldownMerchantName(undefined);
    setDrilldownDateFrom(overview?.period.start);
    setDrilldownDateTo(overview?.period.end);
    setDrilldownOpen(true);
  };

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [overviewRes, categoriesRes, merchantsRes, timeseriesRes, anomaliesRes] =
          await Promise.all([
            api.getAnalyticsOverview({
              date_from: dateFrom,
              date_to: dateTo,
              status: statusFilter || undefined,
              include_transfers: !excludeTransfers,
            }),
            api.getAnalyticsByCategory({
              date_from: dateFrom,
              date_to: dateTo,
              status: statusFilter || undefined,
              include_transfers: !excludeTransfers,
            }),
            api.getAnalyticsByMerchant({
              date_from: dateFrom,
              date_to: dateTo,
              limit: 8,
              status: statusFilter || undefined,
              include_transfers: !excludeTransfers,
              category_id: selectedCategoryId || undefined,
            }),
            api.getAnalyticsTimeseries({
              date_from: dateFrom,
              date_to: dateTo,
              status: statusFilter || undefined,
              granularity: 'day',
              include_transfers: !excludeTransfers,
            }),
            api.getAnalyticsAnomalies({
              date_from: dateFrom,
              date_to: dateTo,
              status: statusFilter || undefined,
              include_transfers: !excludeTransfers,
            }),
          ]);

        setOverview(overviewRes);
        setCategories(categoriesRes.categories);
        setMerchants(merchantsRes.merchants);
        setTimeseries(timeseriesRes.series);
        setAnomalies(anomaliesRes.anomalies.slice(0, 5));
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [excludeTransfers, selectedCategoryId, dateFrom, dateTo, statusFilter]);

  const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280'];
  const categorizedCount = categories.filter((cat) => cat.category_id).length;
  const hasCategorization = categorizedCount > 0;

  const selectedCategory = selectedCategoryId
    ? categories.find((c) => c.category_id === selectedCategoryId) || null
    : null;

  const groceries = categories.find((c) => c.category_id === 'cat_food_groceries') || null;
  const groceriesSpend = groceries ? Math.abs(groceries.total) : 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
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
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <div className="text-sm text-gray-500">
            {overview?.period.start} - {overview?.period.end}
          </div>
          {selectedCategory && (
            <div className="mt-1 text-sm">
              <button
                type="button"
                className="text-blue-600 hover:underline"
                onClick={() => {
                  updateSearch((next) => next.delete('category_id'));
                }}
              >
                All categories
              </button>
              <span className="text-gray-400 mx-2">/</span>
              <span className="font-medium">{selectedCategory.category_name}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              className="px-2 py-1 text-xs font-medium rounded border border-gray-200 hover:bg-gray-50"
              onClick={() => {
                const r = getMonthRange();
                updateSearch((next) => {
                  next.set('date_from', r.start);
                  next.set('date_to', r.end);
                });
              }}
            >
              This month
            </button>
            <button
              type="button"
              className="px-2 py-1 text-xs font-medium rounded border border-gray-200 hover:bg-gray-50"
              onClick={() => {
                const r = getPreviousMonthRange();
                updateSearch((next) => {
                  next.set('date_from', r.start);
                  next.set('date_to', r.end);
                });
              }}
            >
              Last month
            </button>
            <button
              type="button"
              className="px-2 py-1 text-xs font-medium rounded border border-gray-200 hover:bg-gray-50"
              onClick={() => {
                const r = getYearToDateRange();
                updateSearch((next) => {
                  next.set('date_from', r.start);
                  next.set('date_to', r.end);
                });
              }}
            >
              Year to date
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <span className="text-gray-500">From</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  updateSearch((next) => {
                    if (e.target.value) next.set('date_from', e.target.value);
                    else next.delete('date_from');
                  });
                }}
                className="h-9 px-2 rounded border border-gray-300"
              />
              <span className="text-gray-500">To</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  updateSearch((next) => {
                    if (e.target.value) next.set('date_to', e.target.value);
                    else next.delete('date_to');
                  });
                }}
                className="h-9 px-2 rounded border border-gray-300"
              />
            </div>

            <div className="flex items-center gap-2 text-sm text-gray-700">
              <span className="text-gray-500">Status</span>
              <select
                value={statusFilter}
                onChange={(e) => {
                  const v = e.target.value;
                  updateSearch((next) => {
                    if (v) next.set('status', v);
                    else next.delete('status');
                  });
                }}
                className="h-9 px-2 rounded border border-gray-300"
              >
                <option value="">All</option>
                <option value="booked">Booked</option>
                <option value="pending">Pending</option>
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
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
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Exclude transfers
            </label>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card
          className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          onClick={() => openKPIDrilldown(excludeTransfers ? 'Net Spend' : 'Net Cashflow', {})}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{excludeTransfers ? 'Net Spend' : 'Net Cashflow'}</CardTitle>
            <CreditCard className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {excludeTransfers
                ? formatCurrency(overview?.net_spend || 0, true)
                : formatCurrency(overview?.net_cashflow || 0, true)}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {excludeTransfers ? 'Transfers excluded' : 'Cashflow view (transfers included)'}
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          onClick={() => openKPIDrilldown('Expenses', { max: 0 })}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expenses</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(overview?.expenses || 0)}</div>
            <p className="text-xs text-gray-500 mt-1">Absolute sum of spending</p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          onClick={() => openKPIDrilldown('Income', { min: 0 })}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Income</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(overview?.income || 0)}</div>
            <p className="text-xs text-gray-500 mt-1">Transfers do not count as income</p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          onClick={() => {
            const qs = new URLSearchParams();
            qs.set('date_from', dateFrom);
            qs.set('date_to', dateTo);
            qs.set('include_transfers', '1');
            if (statusFilter) qs.set('status', statusFilter);
            navigate(`/transactions?${qs.toString()}`);
          }}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transfers</CardTitle>
            <ArrowRight className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(overview?.transfers.total || 0)}</div>
            <p className="text-xs text-gray-500 mt-1">
              In {formatCurrency(overview?.transfers.in || 0)} / Out {formatCurrency(overview?.transfers.out || 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick shortcuts */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card
          className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          onClick={() => {
            const qs = new URLSearchParams();
            qs.set('date_from', dateFrom);
            qs.set('date_to', dateTo);
            qs.set('include_transfers', excludeTransfers ? '0' : '1');
            if (statusFilter) qs.set('status', statusFilter);
            qs.set('category_id', 'cat_food_groceries');
            navigate(`/transactions?${qs.toString()}`);
          }}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Groceries spend</CardTitle>
            <Tag className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(groceriesSpend)}</div>
            <p className="text-xs text-gray-500 mt-1">
              One click drilldown to transactions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Spending Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Spending Trend</CardTitle>
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
                      setDrilldownTitle(`Transactions: ${formatDateShort(point.date)}`);
                      setDrilldownSubtitle('');
                      setDrilldownCategory(undefined);
                      setDrilldownMerchantId(undefined);
                      setDrilldownMerchantName(undefined);
                      setDrilldownOpen(true);
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDateShort}
                    className="text-xs"
                  />
                  <YAxis tickFormatter={formatCompactCurrency} className="text-xs" />
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value))}
                    labelFormatter={formatDateShort}
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="expenses"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={false}
                    name="Expenses"
                  />
                  <Line
                    type="monotone"
                    dataKey="income"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={false}
                    name="Income"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[300px] items-center justify-center text-gray-500">
                No data for this period
              </div>
            )}
          </CardContent>
        </Card>

        {/* Category Breakdown */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Spending by Category</CardTitle>
              <button
                type="button"
                onClick={() => setShowCategoryDetails((prev) => !prev)}
                className="text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                {showCategoryDetails ? 'Skjul detaljer' : 'Vis detaljer'}
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Click a category to drill down into merchants.
            </p>
          </CardHeader>
          <CardContent>
            {showCategoryDetails && hasCategorization ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={categories.slice(0, 8).map(c => ({ ...c, name: c.category_name }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="total"
                    nameKey="name"
                    label={({ name, percent }) =>
                      (percent ?? 0) > 0.05 ? `${name} ${((percent ?? 0) * 100).toFixed(0)}%` : ''
                    }
                    labelLine={false}
                    className="cursor-pointer outline-none"
                  >
                    {categories.slice(0, 8).map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.category_color || COLORS[index % COLORS.length]}
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => {
                          updateSearch((next) => {
                            if (entry.category_id) {
                              next.set('category_id', entry.category_id);
                            } else {
                              next.delete('category_id');
                            }
                          });
                        }}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value))}
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[300px] items-center justify-center text-gray-500">
                {hasCategorization ? 'Bruk "Vis detaljer" for a se oversikt' : 'Ingen kategoriserte transaksjoner enda'}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Top Merchants */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{selectedCategory ? 'Merchants in Category' : 'Top Merchants'}</CardTitle>
            <Link to="/transactions" className="text-sm text-blue-500 hover:underline flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {merchants.length > 0 ? (
              <div className="space-y-4">
                {merchants.map((merchant, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 p-2 rounded-lg transition-colors"
                    onClick={() => {
                      const qs = new URLSearchParams();
                      qs.set('date_from', dateFrom);
                      qs.set('date_to', dateTo);
                      qs.set('include_transfers', excludeTransfers ? '0' : '1');
                      if (statusFilter) qs.set('status', statusFilter);
                      if (selectedCategoryId) qs.set('category_id', selectedCategoryId);
                      if (merchant.merchant_id) qs.set('merchant_id', merchant.merchant_id);
                      else qs.set('merchant_name', merchant.merchant_name);
                      navigate(`/transactions?${qs.toString()}`);
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-medium dark:bg-gray-800">
                        {i + 1}
                      </div>
                      <div>
                        <p className="font-medium">{merchant.merchant_name}</p>
                        <p className="text-xs text-gray-500">{merchant.count} transactions</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{formatCurrency(merchant.total)}</p>
                      {merchant.trend !== 0 && (
                        <p className={`text-xs ${merchant.trend > 0 ? 'text-red-500' : 'text-green-500'}`}>
                          {formatPercentage(merchant.trend)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">No merchant data</p>
            )}
          </CardContent>
        </Card>

        {/* Anomalies */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Unusual Spending
            </CardTitle>
          </CardHeader>
          <CardContent>
            {anomalies.length > 0 ? (
              <div className="space-y-3">
                {anomalies.map((anomaly, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-900">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{anomaly.description}</p>
                      <p className="text-xs text-gray-500">{anomaly.reason}</p>
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
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">No unusual spending detected</p>
            )}
          </CardContent>
        </Card>
      </div>

      <TransactionsDrilldownDialog
        open={drilldownOpen}
        onOpenChange={setDrilldownOpen}
        title={drilldownTitle}
        subtitle={drilldownSubtitle}
        dateFrom={drilldownDateFrom}
        dateTo={drilldownDateTo}
        categoryId={drilldownCategory}
        merchantId={drilldownMerchantId}
        merchantName={drilldownMerchantName}
        status={drilldownStatus}
        minAmount={drilldownMinAmount}
        maxAmount={drilldownMaxAmount}
      />
    </div>
  );
}
