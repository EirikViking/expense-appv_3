import { useState, useEffect } from 'react';
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
  Legend,
  AreaChart,
  Area,
} from 'recharts';
import { api } from '@/lib/api';
import type {
  AnalyticsSummary,
  CategoryBreakdown,
  MerchantBreakdown,
  TimeSeriesPoint,
  RecurringItem,
  AnalyticsCompareResponse,
} from '@expense/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { TransactionsDrilldownDialog } from '@/components/TransactionsDrilldownDialog';
import {
  formatCurrency,
  formatCompactCurrency,
  formatDateShort,
  formatDateLocal,
  getMonthRange,
  getPreviousMonthRange,
  cn,
} from '@/lib/utils';
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  RefreshCw,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
} from 'lucide-react';

export function InsightsPage() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [categories, setCategories] = useState<CategoryBreakdown[]>([]);
  const [merchants, setMerchants] = useState<MerchantBreakdown[]>([]);
  const [timeseries, setTimeseries] = useState<TimeSeriesPoint[]>([]);
  const [subscriptions, setSubscriptions] = useState<RecurringItem[]>([]);
  const [comparison, setComparison] = useState<AnalyticsCompareResponse | null>(null);

  // Date range selection
  const [dateFrom, setDateFrom] = useState(getMonthRange().start);
  const [dateTo, setDateTo] = useState(getMonthRange().end);
  const [granularity, setGranularity] = useState<'day' | 'week' | 'month'>('day');
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');

  // Drilldown dialog state
  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const [drilldownTitle, setDrilldownTitle] = useState('');
  const [drilldownSubtitle, setDrilldownSubtitle] = useState('');
  const [drilldownMerchantId, setDrilldownMerchantId] = useState<string | undefined>();
  const [drilldownCategoryId, setDrilldownCategoryId] = useState<string | undefined>();
  const [drilldownStatus, setDrilldownStatus] = useState<string | undefined>();
  const [drilldownMinAmount, setDrilldownMinAmount] = useState<number | undefined>();
  const [drilldownMaxAmount, setDrilldownMaxAmount] = useState<number | undefined>();

  const openKPIDrilldown = (title: string, opts: { status?: string, min?: number, max?: number } = {}) => {
    setDrilldownTitle(title);
    setDrilldownSubtitle(`${dateFrom} - ${dateTo}`);
    setDrilldownStatus(opts.status);
    setDrilldownMinAmount(opts.min);
    setDrilldownMaxAmount(opts.max);
    setDrilldownMerchantId(undefined);
    setDrilldownMerchantName(undefined);
    setDrilldownCategoryId(undefined);
    setDrilldownOpen(true);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const prevRange = getPreviousMonthRange();

      const endpointNames = ['summary', 'by-category', 'by-merchant', 'timeseries', 'subscriptions', 'compare'];

      const results = await Promise.allSettled([
        api.getAnalyticsSummary({ date_from: dateFrom, date_to: dateTo }),
        api.getAnalyticsByCategory({ date_from: dateFrom, date_to: dateTo }),
        api.getAnalyticsByMerchant({ date_from: dateFrom, date_to: dateTo, limit: 10 }),
        api.getAnalyticsTimeseries({ date_from: dateFrom, date_to: dateTo, granularity }),
        api.getAnalyticsSubscriptions(),
        api.getAnalyticsCompare({
          previous_start: prevRange.start,
          previous_end: prevRange.end,
          current_start: dateFrom,
          current_end: dateTo,
        }),
      ]);

      const [summaryRes, categoriesRes, merchantsRes, timeseriesRes, subsRes, compareRes] = results;

      // Set state only for fulfilled results, normalizing response shapes
      if (summaryRes.status === 'fulfilled') {
        // Handle both { summary: obj } and direct obj response shapes
        const raw = summaryRes.value as any;
        const normalized = raw?.summary ?? raw;
        setSummary(normalized);
      }
      if (categoriesRes.status === 'fulfilled') {
        const cats = (categoriesRes.value as any)?.categories;
        setCategories(Array.isArray(cats) ? cats : []);
      }
      if (merchantsRes.status === 'fulfilled') {
        const merchs = (merchantsRes.value as any)?.merchants;
        setMerchants(Array.isArray(merchs) ? merchs : []);
      }
      if (timeseriesRes.status === 'fulfilled') {
        const series = (timeseriesRes.value as any)?.series;
        setTimeseries(Array.isArray(series) ? series : []);
      }
      if (subsRes.status === 'fulfilled') {
        const subs = (subsRes.value as any)?.subscriptions;
        setSubscriptions(Array.isArray(subs) ? subs : []);
      }
      if (compareRes.status === 'fulfilled') {
        setComparison(compareRes.value);
      }

      // Log failed endpoints (non-blocking)
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(
            `[Insights] /analytics/${endpointNames[index]} failed:`,
            result.reason?.message || result.reason
          );
        }
      });
    } catch (err) {
      console.error('Failed to load insights:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [dateFrom, dateTo, granularity]);

  const setPresetRange = (preset: 'thisMonth' | 'lastMonth' | 'last3Months' | 'thisYear') => {
    const now = new Date();
    let start: string, end: string;

    switch (preset) {
      case 'thisMonth':
        ({ start, end } = getMonthRange());
        setGranularity('day');
        break;
      case 'lastMonth':
        ({ start, end } = getPreviousMonthRange());
        setGranularity('day');
        break;
      case 'last3Months':
        start = formatDateLocal(new Date(now.getFullYear(), now.getMonth() - 2, 1));
        end = formatDateLocal(new Date(now.getFullYear(), now.getMonth() + 1, 0));
        setGranularity('week');
        break;
      case 'thisYear':
        start = `${now.getFullYear()}-01-01`;
        end = `${now.getFullYear()}-12-31`;
        setGranularity('month');
        break;
    }

    setDateFrom(start!);
    setDateTo(end!);
    setShowCustomRange(false);
  };

  const applyCustomRange = () => {
    if (customDateFrom && customDateTo) {
      setDateFrom(customDateFrom);
      setDateTo(customDateTo);
      setShowCustomRange(false);
      // Auto-select granularity based on range
      const days = Math.ceil((new Date(customDateTo).getTime() - new Date(customDateFrom).getTime()) / (1000 * 60 * 60 * 24));
      if (days > 90) {
        setGranularity('month');
      } else if (days > 31) {
        setGranularity('week');
      } else {
        setGranularity('day');
      }
    }
  };

  const [drilldownMerchantName, setDrilldownMerchantName] = useState<string | undefined>();

  const openMerchantDrilldown = (merchant: MerchantBreakdown) => {
    setDrilldownTitle(`Transactions: ${merchant.merchant_name}`);
    setDrilldownSubtitle(`${merchant.count} transactions totaling ${formatCurrency(merchant.total)}`);
    setDrilldownMerchantId(merchant.merchant_id ?? undefined);

    // Pass name if ID is missing, or even if it is present to be safe, 
    // but the backend will prioritize ID if both are sent (or AND them).
    // Actually, if we have ID, we SHOULD only use ID. 
    // If we don't have ID, we use Name.
    // The backend logic I wrote ANDs them if both are present.
    // So usually we should pass one or the other if we want "either/or" behavior?
    // Wait, the backend logic I added does:
    // if (merchant_id) ...
    // if (merchant_name) ...
    // So if both are passed, it checks BOTH.
    // So we should only pass name if id is undefined.

    if (!merchant.merchant_id) {
      setDrilldownMerchantName(merchant.merchant_name);
    } else {
      setDrilldownMerchantName(undefined);
    }

    setDrilldownCategoryId(undefined);
    setDrilldownOpen(true);
  };

  const openCategoryDrilldown = (category: CategoryBreakdown) => {
    setDrilldownTitle(`Transactions: ${category.category_name}`);
    setDrilldownSubtitle(`${category.count} transactions totaling ${formatCurrency(category.total)}`);
    setDrilldownCategoryId(category.category_id ?? undefined);
    setDrilldownMerchantId(undefined);
    setDrilldownMerchantName(undefined);
    setDrilldownOpen(true);
  };

  const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280'];

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Insights</h1>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-24 w-full" />
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

  // Safely compute monthly subscription total
  const safeSubscriptions = Array.isArray(subscriptions) ? subscriptions : [];
  const monthlySubTotal = safeSubscriptions.reduce((sum, s) => {
    if (s?.frequency === 'monthly') return sum + (s?.amount ?? 0);
    if (s?.frequency === 'yearly') return sum + ((s?.amount ?? 0) / 12);
    return sum;
  }, 0);

  // Safe arrays for rendering
  const safeCategories = Array.isArray(categories) ? categories : [];
  const safeMerchants = Array.isArray(merchants) ? merchants : [];
  const safeTimeseries = Array.isArray(timeseries) ? timeseries : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold">Insights</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1">
            <Button
              variant={dateFrom === getMonthRange().start && !showCustomRange ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPresetRange('thisMonth')}
            >
              This Month
            </Button>
            <Button
              variant={dateFrom === getPreviousMonthRange().start && !showCustomRange ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPresetRange('lastMonth')}
            >
              Last Month
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPresetRange('last3Months')}
            >
              3 Months
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPresetRange('thisYear')}
            >
              This Year
            </Button>
            <Button
              variant={showCustomRange ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setShowCustomRange(!showCustomRange);
                if (!customDateFrom) setCustomDateFrom(dateFrom);
                if (!customDateTo) setCustomDateTo(dateTo);
              }}
            >
              <Calendar className="h-4 w-4 mr-1" />
              Custom
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={loadData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Custom Date Range Panel */}
      {showCustomRange && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[150px]">
                <label className="text-sm font-medium text-gray-700 mb-1 block">From</label>
                <Input
                  type="date"
                  value={customDateFrom}
                  onChange={(e) => setCustomDateFrom(e.target.value)}
                  className="bg-white"
                />
              </div>
              <div className="flex-1 min-w-[150px]">
                <label className="text-sm font-medium text-gray-700 mb-1 block">To</label>
                <Input
                  type="date"
                  value={customDateTo}
                  onChange={(e) => setCustomDateTo(e.target.value)}
                  className="bg-white"
                />
              </div>
              <Button onClick={applyCustomRange} disabled={!customDateFrom || !customDateTo}>
                Apply Range
              </Button>
              <Button variant="ghost" onClick={() => setShowCustomRange(false)}>
                Cancel
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Current range: {dateFrom} to {dateTo}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Period Comparison */}
      {comparison && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card
            className="cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => openKPIDrilldown('Total Expenses', { max: 0 })}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Expenses</p>
                  <p className="text-2xl font-bold">
                    {formatCurrency(comparison?.current?.total_expenses ?? 0)}
                  </p>
                </div>
                <div className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-full text-sm',
                  (comparison?.change_percentage?.expenses ?? 0) > 0
                    ? 'bg-red-100 text-red-700'
                    : 'bg-green-100 text-green-700'
                )}>
                  {(comparison?.change_percentage?.expenses ?? 0) > 0 ? (
                    <ArrowUpRight className="h-4 w-4" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4" />
                  )}
                  {Math.abs(comparison?.change_percentage?.expenses ?? 0).toFixed(1)}%
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                vs {formatCurrency(comparison?.previous?.total_expenses ?? 0)} last period
              </p>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => openKPIDrilldown('Total Income', { min: 0 })}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Income</p>
                  <p className="text-2xl font-bold text-green-600">
                    {formatCurrency(comparison?.current?.total_income ?? 0)}
                  </p>
                </div>
                <div className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-full text-sm',
                  (comparison?.change_percentage?.income ?? 0) > 0
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                )}>
                  {(comparison?.change_percentage?.income ?? 0) > 0 ? (
                    <ArrowUpRight className="h-4 w-4" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4" />
                  )}
                  {Math.abs(comparison?.change_percentage?.income ?? 0).toFixed(1)}%
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                vs {formatCurrency(comparison?.previous?.total_income ?? 0)} last period
              </p>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => openKPIDrilldown('Net Savings')}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Net Savings</p>
                  <p className={cn(
                    'text-2xl font-bold',
                    (comparison?.current?.net ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'
                  )}>
                    {formatCurrency(comparison?.current?.net ?? 0, true)}
                  </p>
                </div>
                <div className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-full text-sm',
                  (comparison?.change_percentage?.net ?? 0) > 0
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                )}>
                  {(comparison?.change_percentage?.net ?? 0) > 0 ? (
                    <ArrowUpRight className="h-4 w-4" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4" />
                  )}
                  {Math.abs(comparison?.change_percentage?.net ?? 0).toFixed(1)}%
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                vs {formatCurrency(comparison?.previous?.net ?? 0, true)} last period
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Spending Over Time */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Spending Over Time</CardTitle>
            <div className="flex gap-1">
              {(['day', 'week', 'month'] as const).map((g) => (
                <Button
                  key={g}
                  variant={granularity === g ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setGranularity(g)}
                >
                  {g.charAt(0).toUpperCase() + g.slice(1)}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {safeTimeseries.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={safeTimeseries}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
                <XAxis dataKey="date" tickFormatter={formatDateShort} className="text-xs" />
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
                <Legend />
                <Area
                  type="monotone"
                  dataKey="expenses"
                  stackId="1"
                  stroke="#ef4444"
                  fill="#fecaca"
                  name="Expenses"
                />
                <Area
                  type="monotone"
                  dataKey="income"
                  stackId="2"
                  stroke="#22c55e"
                  fill="#bbf7d0"
                  name="Income"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[300px] items-center justify-center text-gray-500">
              No data for this period
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Category Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Spending by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {safeCategories.length > 0 ? (
              <div className="flex flex-col lg:flex-row items-center gap-4">
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={safeCategories.slice(0, 8).map(c => ({ ...c, name: c.category_name }))}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="total"
                      nameKey="name"
                    >
                      {safeCategories.slice(0, 8).map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.category_color || COLORS[index % COLORS.length]}
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
                <div className="space-y-2 w-full lg:w-auto">
                  {safeCategories.slice(0, 6).map((cat, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-100 p-2 rounded-lg transition-colors -mx-2"
                      onClick={() => openCategoryDrilldown(cat)}
                    >
                      <div
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: cat.category_color || COLORS[i % COLORS.length] }}
                      />
                      <span className="flex-1 truncate">{cat.category_name}</span>
                      <span className="font-medium">{formatCurrency(cat.total)}</span>
                      <span className="text-gray-400 text-xs">{cat.percentage.toFixed(0)}%</span>
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex h-[250px] items-center justify-center text-gray-500">
                No categorized transactions
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Merchants */}
        <Card>
          <CardHeader>
            <CardTitle>Top Merchants</CardTitle>
          </CardHeader>
          <CardContent>
            {safeMerchants.length > 0 ? (
              <div className="space-y-2">
                {safeMerchants.slice(0, 8).map((merchant, i) => {
                  const maxTotal = safeMerchants[0]?.total || 1;
                  const barWidth = (merchant.total / maxTotal) * 100;
                  return (
                    <div
                      key={i}
                      className="cursor-pointer hover:bg-gray-100 p-2 rounded-lg transition-colors -mx-2"
                      onClick={() => openMerchantDrilldown(merchant)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium truncate flex-1">{merchant.merchant_name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-600">{formatCurrency(merchant.total)}</span>
                          <Badge variant="outline" className="text-xs">{merchant.count}x</Badge>
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        </div>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-[250px] items-center justify-center text-gray-500">
                No merchant data
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Subscriptions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Detected Subscriptions
            </CardTitle>
            <Badge variant="secondary">
              ~{formatCurrency(monthlySubTotal)}/month
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {safeSubscriptions.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {safeSubscriptions.map((sub, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => openMerchantDrilldown({
                    merchant_id: sub.merchant_id,
                    merchant_name: sub.merchant_name,
                    total: sub.amount * sub.transaction_ids.length, // Approx total
                    count: sub.transaction_ids.length,
                    avg: sub.amount,
                    trend: 0
                  })}
                >
                  <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <CreditCard className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{sub.merchant_name}</p>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <span>{formatCurrency(sub.amount)}</span>
                      <span>•</span>
                      <span>{sub.frequency}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {sub.transaction_ids.length}x
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">
              No recurring transactions detected yet
            </p>
          )}
        </CardContent>
      </Card>

      {/* Transactions Drilldown Dialog */}
      <TransactionsDrilldownDialog
        open={drilldownOpen}
        onOpenChange={setDrilldownOpen}
        title={drilldownTitle}
        subtitle={drilldownSubtitle}
        dateFrom={dateFrom}
        dateTo={dateTo}
        merchantId={drilldownMerchantId}
        merchantName={drilldownMerchantName}
        categoryId={drilldownCategoryId}
        status={drilldownStatus}
        minAmount={drilldownMinAmount}
        maxAmount={drilldownMaxAmount}
      />
    </div>
  );
}
