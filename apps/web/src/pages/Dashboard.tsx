import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
} from '@/lib/utils';
import type {
  AnalyticsSummary,
  CategoryBreakdown,
  MerchantBreakdown,
  TimeSeriesPoint,
  AnomalyItem,
} from '@expense/shared';

export function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [prevSummary, setPrevSummary] = useState<AnalyticsSummary | null>(null);
  const [categories, setCategories] = useState<CategoryBreakdown[]>([]);
  const [merchants, setMerchants] = useState<MerchantBreakdown[]>([]);
  const [timeseries, setTimeseries] = useState<TimeSeriesPoint[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyItem[]>([]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const currentRange = getMonthRange();
        const prevRange = getPreviousMonthRange();

        const [summaryRes, prevSummaryRes, categoriesRes, merchantsRes, timeseriesRes, anomaliesRes] =
          await Promise.all([
            api.getAnalyticsSummary({ date_from: currentRange.start, date_to: currentRange.end }),
            api.getAnalyticsSummary({ date_from: prevRange.start, date_to: prevRange.end }),
            api.getAnalyticsByCategory({ date_from: currentRange.start, date_to: currentRange.end }),
            api.getAnalyticsByMerchant({ date_from: currentRange.start, date_to: currentRange.end, limit: 5 }),
            api.getAnalyticsTimeseries({ date_from: currentRange.start, date_to: currentRange.end, granularity: 'day' }),
            api.getAnalyticsAnomalies({ date_from: currentRange.start, date_to: currentRange.end }),
          ]);

        setSummary(summaryRes);
        setPrevSummary(prevSummaryRes);
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
  }, []);

  const expenseChange = summary && prevSummary && prevSummary.total_expenses > 0
    ? ((summary.total_expenses - prevSummary.total_expenses) / prevSummary.total_expenses) * 100
    : 0;

  const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280'];

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
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="text-sm text-gray-500">
          {summary?.period.start} - {summary?.period.end}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary?.total_expenses || 0)}</div>
            <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
              {expenseChange !== 0 && (
                <>
                  {expenseChange > 0 ? (
                    <TrendingUp className="h-3 w-3 text-red-500" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-green-500" />
                  )}
                  <span className={expenseChange > 0 ? 'text-red-500' : 'text-green-500'}>
                    {formatPercentage(expenseChange)}
                  </span>
                </>
              )}
              <span>vs last month</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Income</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(summary?.total_income || 0)}</div>
            <p className="text-xs text-gray-500 mt-1">
              Net: {formatCurrency(summary?.net || 0, true)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary?.pending_amount || 0)}</div>
            <p className="text-xs text-gray-500 mt-1">
              {summary?.pending_count || 0} transactions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Booked</CardTitle>
            <CheckCircle className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary?.booked_amount || 0)}</div>
            <p className="text-xs text-gray-500 mt-1">
              {summary?.booked_count || 0} transactions
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
                <LineChart data={timeseries}>
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
            <CardTitle>By Category</CardTitle>
          </CardHeader>
          <CardContent>
            {categories.length > 0 ? (
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
            ) : (
              <div className="flex h-[300px] items-center justify-center text-gray-500">
                No categorized transactions
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
            <CardTitle>Top Merchants</CardTitle>
            <Link to="/transactions" className="text-sm text-blue-500 hover:underline flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {merchants.length > 0 ? (
              <div className="space-y-4">
                {merchants.map((merchant, i) => (
                  <div key={i} className="flex items-center justify-between">
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
    </div>
  );
}
