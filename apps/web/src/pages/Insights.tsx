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
import {
  formatCurrency,
  formatCompactCurrency,
  formatDateShort,
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

  const loadData = async () => {
    setLoading(true);
    try {
      const prevRange = getPreviousMonthRange();

      const [summaryRes, categoriesRes, merchantsRes, timeseriesRes, subsRes, compareRes] =
        await Promise.all([
          api.getAnalyticsSummary({ date_from: dateFrom, date_to: dateTo }),
          api.getAnalyticsByCategory({ date_from: dateFrom, date_to: dateTo }),
          api.getAnalyticsByMerchant({ date_from: dateFrom, date_to: dateTo, limit: 10 }),
          api.getAnalyticsTimeseries({ date_from: dateFrom, date_to: dateTo, granularity }),
          api.getAnalyticsSubscriptions(),
          api.getAnalyticsCompare({
            date_from_1: prevRange.start,
            date_to_1: prevRange.end,
            date_from_2: dateFrom,
            date_to_2: dateTo,
          }),
        ]);

      setSummary(summaryRes);
      setCategories(categoriesRes.categories);
      setMerchants(merchantsRes.merchants);
      setTimeseries(timeseriesRes.series);
      setSubscriptions(subsRes.subscriptions);
      setComparison(compareRes);
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
        start = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().split('T')[0];
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
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

  const monthlySubTotal = subscriptions.reduce((sum, s) => {
    if (s.estimated_cadence === 'monthly') return sum + s.estimated_amount;
    if (s.estimated_cadence === 'yearly') return sum + s.estimated_amount / 12;
    return sum;
  }, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold">Insights</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1">
            <Button
              variant={dateFrom === getMonthRange().start ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPresetRange('thisMonth')}
            >
              This Month
            </Button>
            <Button
              variant={dateFrom === getPreviousMonthRange().start ? 'default' : 'outline'}
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
          </div>
          <Button variant="ghost" size="sm" onClick={loadData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Period Comparison */}
      {comparison && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Expenses</p>
                  <p className="text-2xl font-bold">
                    {formatCurrency(comparison.period2.total_expenses)}
                  </p>
                </div>
                <div className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-full text-sm',
                  comparison.change.expenses_change > 0
                    ? 'bg-red-100 text-red-700'
                    : 'bg-green-100 text-green-700'
                )}>
                  {comparison.change.expenses_change > 0 ? (
                    <ArrowUpRight className="h-4 w-4" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4" />
                  )}
                  {Math.abs(comparison.change.expenses_change).toFixed(1)}%
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                vs {formatCurrency(comparison.period1.total_expenses)} last period
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Income</p>
                  <p className="text-2xl font-bold text-green-600">
                    {formatCurrency(comparison.period2.total_income)}
                  </p>
                </div>
                <div className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-full text-sm',
                  comparison.change.income_change > 0
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                )}>
                  {comparison.change.income_change > 0 ? (
                    <ArrowUpRight className="h-4 w-4" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4" />
                  )}
                  {Math.abs(comparison.change.income_change).toFixed(1)}%
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                vs {formatCurrency(comparison.period1.total_income)} last period
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Net Savings</p>
                  <p className={cn(
                    'text-2xl font-bold',
                    comparison.period2.net >= 0 ? 'text-green-600' : 'text-red-600'
                  )}>
                    {formatCurrency(comparison.period2.net, true)}
                  </p>
                </div>
                <div className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-full text-sm',
                  (comparison.change.net_change ?? 0) > 0
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                )}>
                  {(comparison.change.net_change ?? 0) > 0 ? (
                    <ArrowUpRight className="h-4 w-4" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4" />
                  )}
                  {comparison.change.net_change !== null
                    ? `${Math.abs(comparison.change.net_change).toFixed(1)}%`
                    : 'N/A'}
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                vs {formatCurrency(comparison.period1.net, true)} last period
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
          {timeseries.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={timeseries}>
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
            {categories.length > 0 ? (
              <div className="flex flex-col lg:flex-row items-center gap-4">
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={categories.slice(0, 8).map(c => ({ ...c, name: c.category_name }))}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="total"
                      nameKey="name"
                    >
                      {categories.slice(0, 8).map((entry, index) => (
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
                  {categories.slice(0, 6).map((cat, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: cat.category_color || COLORS[i % COLORS.length] }}
                      />
                      <span className="flex-1 truncate">{cat.category_name}</span>
                      <span className="font-medium">{formatCurrency(cat.total)}</span>
                      <span className="text-gray-400 text-xs">{cat.percentage.toFixed(0)}%</span>
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
            {merchants.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={merchants.slice(0, 8)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
                  <XAxis type="number" tickFormatter={formatCompactCurrency} className="text-xs" />
                  <YAxis
                    type="category"
                    dataKey="merchant_name"
                    width={100}
                    className="text-xs"
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value))}
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="total" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
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
          {subscriptions.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {subscriptions.map((sub, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50"
                >
                  <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <CreditCard className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{sub.merchant_name || sub.description}</p>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <span>{formatCurrency(sub.estimated_amount)}</span>
                      <span>•</span>
                      <span>{sub.estimated_cadence}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {sub.occurrence_count}x
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
    </div>
  );
}
