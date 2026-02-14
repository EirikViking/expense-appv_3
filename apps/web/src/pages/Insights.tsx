import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type {
  AnalyticsCompareResponse,
  AnalyticsSummary,
  CategoryBreakdown,
  MerchantBreakdown,
  RecurringItem,
  TimeSeriesPoint,
  TransactionWithMeta,
} from '@expense/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCompactCurrency, getMonthRange, getPreviousMonthRange } from '@/lib/utils';
import { Calendar, RefreshCw, Sparkles, Wand2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { clearLastDateRange, loadLastDateRange, saveLastDateRange } from '@/lib/date-range-store';
import { useNavigate } from 'react-router-dom';
import { SmartDateInput } from '@/components/SmartDateInput';
import { validateDateRange } from '@/lib/date-input';
import { localizeCategoryName } from '@/lib/category-localization';
import { useAuth } from '@/context/AuthContext';

type Lang = 'en' | 'nb';

type InsightCopy = {
  title: string;
  subtitle: string;
  greetingPrefix: string;
  highlightsTitle: string;
  highlightsSubtitle: string;
  funFactTitle: string;
  noHighlights: string;
  fortuneTitle: string;
  patternsTitle: string;
  dramaTitle: string;
  subsTitle: string;
  refresh: string;
  customRange: string;
  applyRange: string;
  cancel: string;
  from: string;
  to: string;
  leaderboardTitle: string;
  leaderboardHint: string;
  topCategories: string;
};

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function pick<T>(arr: T[], seed: number): T {
  const idx = Math.abs(seed) % Math.max(1, arr.length);
  return arr[idx] ?? arr[0]!;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}

function getLang(resolved: string | undefined): Lang {
  return resolved === 'nb' ? 'nb' : 'en';
}

function fmtPct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getPreviousRange(dateFrom: string, dateTo: string): { from: string; to: string } {
  const from = new Date(`${dateFrom}T00:00:00`);
  const to = new Date(`${dateTo}T00:00:00`);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to < from) {
    return { from: dateFrom, to: dateTo };
  }

  const days = Math.floor((to.getTime() - from.getTime()) / 86400000) + 1;
  const prevTo = new Date(from);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - (days - 1));

  return { from: toIsoDate(prevFrom), to: toIsoDate(prevTo) };
}

function getTopCategory(categories: CategoryBreakdown[]) {
  const c = [...categories].sort((a, b) => Math.abs(b.total || 0) - Math.abs(a.total || 0))[0];
  return c ? { id: c.category_id, name: c.category_name || 'Uncategorized', total: c.total || 0 } : null;
}

function getTopMerchant(merchants: MerchantBreakdown[]) {
  const m = [...merchants].sort((a, b) => Math.abs(b.total || 0) - Math.abs(a.total || 0))[0];
  return m ? { id: m.merchant_id, name: m.merchant_name || 'Unknown', total: m.total || 0, count: m.count || 0 } : null;
}

function getTopSpendDay(timeseries: TimeSeriesPoint[]) {
  const p = [...timeseries].sort((a, b) => Math.abs((b.expenses || 0) - (a.expenses || 0)))[0];
  return p ? { date: p.date, amount: p.expenses || 0 } : null;
}

export function getMerchantLeaderboardTitle(lang: Lang): string {
  return lang === 'nb' ? 'Topp brukersteder' : 'Top merchants';
}

function getCopy(lang: Lang): InsightCopy {
  if (lang === 'nb') {
    return {
      title: 'Innsikt',
      subtitle: 'Et levende sammendrag av vanene dine.',
      greetingPrefix: 'Hei',
      highlightsTitle: 'Høydepunkter',
      highlightsSubtitle: 'Det viktigste i perioden, kort forklart.',
      funFactTitle: 'Nyttig fun fact',
      noHighlights: 'Ingen høydepunkter enda for valgt periode.',
      fortuneTitle: 'Forbruks-horoskop',
      patternsTitle: 'Mønster-radar',
      dramaTitle: 'Daily drama',
      subsTitle: 'Abonnements-gremlins',
      refresh: 'Ny tolkning',
      customRange: 'Egendefinert periode',
      applyRange: 'Bruk periode',
      cancel: 'Avbryt',
      from: 'Fra',
      to: 'Til',
      leaderboardTitle: 'Leaderboard (helt uoffisielt)',
      leaderboardHint: 'Klikk en rad for drilldown til transaksjoner med samme periode og utgiftstype.',
      topCategories: 'Topp kategorier',
    };
  }

  return {
    title: 'Insights',
    subtitle: 'A lively summary of your spending habits.',
    greetingPrefix: 'Hi',
    highlightsTitle: 'Highlights',
    highlightsSubtitle: 'The most important things in this period, quickly explained.',
    funFactTitle: 'Useful fun fact',
    noHighlights: 'No highlights yet for this period.',
    fortuneTitle: 'Spending horoscope',
    patternsTitle: 'Pattern radar',
    dramaTitle: 'Daily drama',
    subsTitle: 'Subscription gremlins',
    refresh: 'New angle',
    customRange: 'Custom range',
    applyRange: 'Apply range',
    cancel: 'Cancel',
    from: 'From',
    to: 'To',
    leaderboardTitle: 'Leaderboard (unofficial)',
    leaderboardHint: 'Click a row to drill down to transactions with the same date range and flow type.',
    topCategories: 'Top categories',
  };
}

function makeHubCards(opts: {
  lang: Lang;
  seed: number;
  summary: AnalyticsSummary | null;
  categories: CategoryBreakdown[];
  merchants: MerchantBreakdown[];
  subscriptions: RecurringItem[];
}) {
  const { lang, seed, summary, categories, merchants, subscriptions } = opts;
  const expenses = summary?.total_expenses ?? 0;
  const income = summary?.total_income ?? 0;
  const net = summary?.net ?? 0;

  const topCat = getTopCategory(categories);
  const topMerchant = getTopMerchant(merchants);

  const groceries = categories.find((c) => c.category_id === 'cat_food_groceries');
  const groceriesShare = expenses > 0 ? clamp01((Math.abs(groceries?.total ?? 0)) / Math.abs(expenses)) : 0;

  const fortuneTemplates =
    lang === 'nb'
      ? [
          `Stjernene sier: netto er ${formatCompactCurrency(net)}.`,
          `Dagens spådom: ${topCat ? `${topCat.name} prøver å bli en livsstil` : 'kategoriene holder seg skjult'}.`,
          `Orakelet ser en sterk energi rundt ${topMerchant ? topMerchant.name : 'ukjente brukersteder'} og den energien koster penger.`,
          groceriesShare > 0.22
            ? `Dagligvarer er ${fmtPct(groceriesShare)} av utgiftene.`
            : `Dagligvarer er ${fmtPct(groceriesShare)} av utgiftene. Effektivt.`,
        ]
      : [
          `The stars say your net is ${formatCompactCurrency(net)}.`,
          `Today’s prophecy: ${topCat ? `${topCat.name} is trying to become a lifestyle` : 'your categories are hiding'}.`,
          `The oracle sees strong energy around ${topMerchant ? topMerchant.name : 'unknown merchants'} and that energy is expensive.`,
          groceriesShare > 0.22
            ? `Groceries are ${fmtPct(groceriesShare)} of expenses.`
            : `Groceries are ${fmtPct(groceriesShare)} of expenses. Efficient.`,
        ];

  const dramaTemplates =
    lang === 'nb'
      ? [
          topMerchant
            ? `${topMerchant.name} dukker opp ${topMerchant.count} ganger. Dette er ikke et mønster. Dette er en saga.`
            : 'Et mystisk brukersted har satt spor i økonomien.',
          subscriptions.length > 0
            ? `Du har ${subscriptions.length} abonnement(er). Små beløp som samarbeider i hemmelighet.`
            : 'Ingen abonnementer oppdaget. Enten fri, eller veldig godt skjult.',
          income > 0 && expenses > 0
            ? 'Inntekt finnes. Utgifter finnes. Balansen vurderes fortsatt.'
            : 'Dagens drama: tallene lever sitt eget liv.',
        ]
      : [
          topMerchant
            ? `${topMerchant.name} appears ${topMerchant.count} times. This is not a pattern. This is a saga.`
            : 'A mysterious merchant has left a trace in your budget.',
          subscriptions.length > 0
            ? `You have ${subscriptions.length} subscription(s). Small numbers collaborating in secret.`
            : 'No subscriptions detected. Either freedom, or excellent disguise.',
          income > 0 && expenses > 0
            ? 'Income exists. Expenses exist. Balance is under review.'
            : 'Today’s drama: numbers doing their own thing.',
        ];

  const patterns: Array<{ label: string; value?: string; tone?: 'good' | 'warn' | 'info' }> = [];
  if (topCat) patterns.push({ label: lang === 'nb' ? 'Største kategori' : 'Top category', value: `${topCat.name} • ${formatCompactCurrency(topCat.total)}`, tone: 'info' });
  if (topMerchant) patterns.push({ label: lang === 'nb' ? 'Største brukersted' : 'Top merchant', value: `${topMerchant.name} • ${formatCompactCurrency(topMerchant.total)}`, tone: 'info' });
  if (expenses > 0) patterns.push({ label: lang === 'nb' ? 'Dagligvarer-andel' : 'Groceries share', value: fmtPct(groceriesShare), tone: groceriesShare > 0.25 ? 'warn' : 'good' });
  patterns.push({ label: lang === 'nb' ? 'Utgifter' : 'Expenses', value: formatCompactCurrency(expenses), tone: 'info' });
  patterns.push({ label: lang === 'nb' ? 'Inntekt' : 'Income', value: formatCompactCurrency(income), tone: 'info' });

  return {
    fortune: pick(fortuneTemplates, seed),
    drama: pick(dramaTemplates, seed + 7),
    patterns,
  };
}

type Highlight = {
  id: string;
  emoji: string;
  title: string;
  value: string;
  detail: string;
};

function buildHighlights(args: {
  lang: Lang;
  categories: CategoryBreakdown[];
  merchants: MerchantBreakdown[];
  timeseries: TimeSeriesPoint[];
  largestExpenseTx: TransactionWithMeta | null;
  compare: AnalyticsCompareResponse | null;
  currentLanguage: string;
}): Highlight[] {
  const { lang, categories, merchants, timeseries, largestExpenseTx, compare, currentLanguage } = args;
  const out: Highlight[] = [];

  const topCategory = getTopCategory(categories);
  if (topCategory) {
    out.push({
      id: 'top-category',
      emoji: '📦',
      title: lang === 'nb' ? 'Største kategori' : 'Top category',
      value: localizeCategoryName(topCategory.name, currentLanguage),
      detail: formatCompactCurrency(topCategory.total),
    });
  }

  if (largestExpenseTx) {
    out.push({
      id: 'largest-purchase',
      emoji: '🧾',
      title: lang === 'nb' ? 'Største enkeltkjøp' : 'Largest single purchase',
      value: largestExpenseTx.description,
      detail: formatCompactCurrency(Math.abs(largestExpenseTx.amount)),
    });
  }

  const topMerchant = getTopMerchant(merchants);
  if (topMerchant) {
    out.push({
      id: 'top-merchant',
      emoji: '🏪',
      title: lang === 'nb' ? 'Mest brukte brukersted' : 'Most used merchant',
      value: topMerchant.name,
      detail: lang === 'nb' ? `${topMerchant.count} kjøp` : `${topMerchant.count} purchases`,
    });
  }

  const topDay = getTopSpendDay(timeseries);
  if (topDay) {
    out.push({
      id: 'top-day',
      emoji: '📅',
      title: lang === 'nb' ? 'Dag med høyest forbruk' : 'Highest-spend day',
      value: topDay.date,
      detail: formatCompactCurrency(Math.abs(topDay.amount)),
    });
  }

  if (compare) {
    const pct = compare.change_percentage.expenses;
    const delta = compare.change.expenses;
    const up = delta > 0;
    out.push({
      id: 'period-change',
      emoji: up ? '📈' : '📉',
      title: lang === 'nb' ? 'Endring mot forrige periode' : 'Change vs previous period',
      value: `${up ? '+' : ''}${pct.toFixed(1)}%`,
      detail: `${up ? '+' : ''}${formatCompactCurrency(delta)}`,
    });
  }

  return out.slice(0, 6);
}

function buildFunFact(args: {
  lang: Lang;
  categories: CategoryBreakdown[];
  currentLanguage: string;
}): string {
  const { lang, categories, currentLanguage } = args;
  const topCategory = getTopCategory(categories);
  if (!topCategory) {
    return lang === 'nb'
      ? 'Kategoriser flere transaksjoner for å få mer presise tips.'
      : 'Categorize more transactions to unlock sharper tips.';
  }

  const saving = Math.abs(topCategory.total) * 0.1;
  const categoryName = localizeCategoryName(topCategory.name, currentLanguage);
  return lang === 'nb'
    ? `Hvis du kutter ${categoryName} med 10 %, sparer du omtrent ${formatCompactCurrency(saving)} i samme periode.`
    : `If you cut ${categoryName} by 10%, you save about ${formatCompactCurrency(saving)} in the same period.`;
}

export function InsightsPage() {
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const lang = getLang(i18n.resolvedLanguage);
  const currentLanguage = i18n.resolvedLanguage || i18n.language;
  const copy = getCopy(lang);

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [categories, setCategories] = useState<CategoryBreakdown[]>([]);
  const [merchants, setMerchants] = useState<MerchantBreakdown[]>([]);
  const [subscriptions, setSubscriptions] = useState<RecurringItem[]>([]);
  const [timeseries, setTimeseries] = useState<TimeSeriesPoint[]>([]);
  const [largestExpenseTx, setLargestExpenseTx] = useState<TransactionWithMeta | null>(null);
  const [compare, setCompare] = useState<AnalyticsCompareResponse | null>(null);

  const initialRange = useMemo(() => loadLastDateRange() ?? getMonthRange(), []);
  const [dateFrom, setDateFrom] = useState(initialRange.start);
  const [dateTo, setDateTo] = useState(initialRange.end);
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [customDateFromError, setCustomDateFromError] = useState<string | null>(null);
  const [customDateToError, setCustomDateToError] = useState<string | null>(null);
  const [customRangeError, setCustomRangeError] = useState<string | null>(null);

  const [seed, setSeed] = useState(0);

  const loadData = async () => {
    setLoading(true);
    const prev = getPreviousRange(dateFrom, dateTo);

    try {
      const results = await Promise.allSettled([
        api.getAnalyticsSummary({ date_from: dateFrom, date_to: dateTo }),
        api.getAnalyticsByCategory({ date_from: dateFrom, date_to: dateTo }),
        api.getAnalyticsByMerchant({ date_from: dateFrom, date_to: dateTo, limit: 12 }),
        api.getAnalyticsSubscriptions(),
        api.getAnalyticsTimeseries({ date_from: dateFrom, date_to: dateTo, granularity: 'day', include_transfers: false }),
        api.getTransactions({
          date_from: dateFrom,
          date_to: dateTo,
          flow_type: 'expense',
          include_transfers: false,
          limit: 1,
          sort_by: 'amount_abs',
          sort_order: 'desc',
        }),
        api.getAnalyticsCompare({
          current_start: dateFrom,
          current_end: dateTo,
          previous_start: prev.from,
          previous_end: prev.to,
        }),
      ]);

      const [summaryRes, byCatRes, byMerchRes, subsRes, timeseriesRes, largestRes, compareRes] = results;
      if (summaryRes.status === 'fulfilled') setSummary(summaryRes.value);
      if (byCatRes.status === 'fulfilled') setCategories(byCatRes.value.categories);
      if (byMerchRes.status === 'fulfilled') setMerchants(byMerchRes.value.merchants);
      if (subsRes.status === 'fulfilled') setSubscriptions(subsRes.value.subscriptions);
      if (timeseriesRes.status === 'fulfilled') setTimeseries(timeseriesRes.value.series);
      if (largestRes.status === 'fulfilled') setLargestExpenseTx(largestRes.value.transactions[0] ?? null);
      if (compareRes.status === 'fulfilled') setCompare(compareRes.value);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (dateFrom && dateTo) saveLastDateRange({ start: dateFrom, end: dateTo });
    else if (!dateFrom && !dateTo) clearLastDateRange();
  }, [dateFrom, dateTo]);

  const hub = useMemo(() => {
    const baseSeed = hashString(`${dateFrom}|${dateTo}|${summary?.total_expenses ?? 0}|${seed}`);
    return makeHubCards({ lang, seed: baseSeed, summary, categories, merchants, subscriptions });
  }, [lang, dateFrom, dateTo, summary, categories, merchants, subscriptions, seed]);

  const highlights = useMemo(
    () =>
      buildHighlights({
        lang,
        categories,
        merchants,
        timeseries,
        largestExpenseTx,
        compare,
        currentLanguage,
      }),
    [lang, categories, merchants, timeseries, largestExpenseTx, compare, currentLanguage]
  );

  const funFact = useMemo(
    () => buildFunFact({ lang, categories, currentLanguage }),
    [lang, categories, currentLanguage]
  );

  const applyCustomRange = () => {
    if (!customDateFrom || !customDateTo) return;
    if (!validateDateRange(customDateFrom, customDateTo)) {
      setCustomRangeError(lang === 'nb' ? 'Fra kan ikke være etter Til.' : 'From cannot be after To.');
      return;
    }
    setDateFrom(customDateFrom);
    setDateTo(customDateTo);
    setShowCustomRange(false);
    setCustomRangeError(null);
  };

  const createBaseDrilldownQuery = () => {
    const qs = new URLSearchParams();
    qs.set('date_from', dateFrom);
    qs.set('date_to', dateTo);
    qs.set('flow_type', 'expense');
    return qs;
  };

  const openCategoryDrilldown = (categoryId?: string | null) => {
    const qs = createBaseDrilldownQuery();
    if (categoryId) qs.set('category_id', categoryId);
    navigate(`/transactions?${qs.toString()}`);
  };

  const openMerchantDrilldown = (merchant: MerchantBreakdown) => {
    const qs = createBaseDrilldownQuery();
    if (merchant.merchant_id) qs.set('merchant_id', merchant.merchant_id);
    else if (merchant.merchant_name) qs.set('merchant_name', merchant.merchant_name);
    navigate(`/transactions?${qs.toString()}`);
  };

  const openDramaDrilldown = () => {
    const topMerchant = merchants[0];
    if (topMerchant) {
      openMerchantDrilldown(topMerchant);
      return;
    }

    const topCategory = categories.find((c) => c.category_id);
    if (topCategory?.category_id) {
      openCategoryDrilldown(topCategory.category_id);
      return;
    }

    navigate(`/transactions?${createBaseDrilldownQuery().toString()}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-display">{copy.title}</h1>
          <p className="mt-1 text-sm text-white/70">{copy.subtitle}</p>
          {user?.name?.trim() && (
            <p className="mt-2 text-sm text-cyan-100/90">
              {copy.greetingPrefix} {user.name}, {lang === 'nb' ? 'her er perioden din.' : "here's your period."}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          onClick={() => setSeed((s) => s + 1)}
          className="gap-2"
          title={copy.refresh}
        >
          <Wand2 className="h-4 w-4" />
          {copy.refresh}
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const r = getMonthRange();
                setDateFrom(r.start);
                setDateTo(r.end);
              }}
              className="gap-2"
            >
              <Calendar className="h-4 w-4" />
              {lang === 'nb' ? 'Denne måneden' : 'This month'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const r = getPreviousMonthRange();
                setDateFrom(r.start);
                setDateTo(r.end);
              }}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              {lang === 'nb' ? 'Forrige måned' : 'Last month'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setShowCustomRange((v) => {
                  const next = !v;
                  if (next) {
                    setCustomDateFrom(dateFrom);
                    setCustomDateTo(dateTo);
                    setCustomRangeError(null);
                  }
                  return next;
                })
              }
            >
              {copy.customRange}
            </Button>

            <div className="ml-auto text-xs text-white/60">
              {dateFrom} → {dateTo}
            </div>
          </div>

          {showCustomRange && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-white/70 mb-1">{copy.from}</label>
                <SmartDateInput
                  value={customDateFrom}
                  ariaLabel={copy.from}
                  invalidFormatMessage={lang === 'nb' ? 'Ugyldig datoformat.' : 'Invalid date format.'}
                  invalidDateMessage={lang === 'nb' ? 'Ugyldig dato.' : 'Invalid date.'}
                  onChange={setCustomDateFrom}
                  onErrorChange={setCustomDateFromError}
                />
                {customDateFromError && <p className="mt-1 text-xs text-red-300">{customDateFromError}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-white/70 mb-1">{copy.to}</label>
                <SmartDateInput
                  value={customDateTo}
                  ariaLabel={copy.to}
                  invalidFormatMessage={lang === 'nb' ? 'Ugyldig datoformat.' : 'Invalid date format.'}
                  invalidDateMessage={lang === 'nb' ? 'Ugyldig dato.' : 'Invalid date.'}
                  onChange={setCustomDateTo}
                  onErrorChange={setCustomDateToError}
                />
                {customDateToError && <p className="mt-1 text-xs text-red-300">{customDateToError}</p>}
              </div>
              <div className="flex items-end gap-2">
                <Button onClick={applyCustomRange} disabled={!customDateFrom || !customDateTo}>
                  {copy.applyRange}
                </Button>
                <Button variant="outline" onClick={() => setShowCustomRange(false)}>
                  {copy.cancel}
                </Button>
              </div>
              {customRangeError && (
                <p className="sm:col-span-3 text-sm text-red-300">{customRangeError}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{copy.highlightsTitle}</CardTitle>
          <p className="text-xs text-white/60">{copy.highlightsSubtitle}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="mt-2 h-5 w-full" />
                  <Skeleton className="mt-2 h-4 w-24" />
                </div>
              ))}
            </div>
          ) : highlights.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {highlights.map((h) => (
                <div key={h.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <p className="text-xs text-white/60">{h.emoji} {h.title}</p>
                  <p className="mt-1 text-sm font-semibold text-white">{h.value}</p>
                  <p className="mt-1 text-xs text-cyan-100/90">{h.detail}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-white/70">{copy.noHighlights}</p>
          )}

          <div className="rounded-lg border border-fuchsia-300/20 bg-fuchsia-500/10 p-3">
            <p className="text-xs font-semibold text-fuchsia-100">{copy.funFactTitle}</p>
            <p className="mt-1 text-sm text-fuchsia-50">{funFact}</p>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-40" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="card-3d">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-200" />
                {copy.fortuneTitle}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-white/85 leading-relaxed">{hub.fortune}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant="secondary">{lang === 'nb' ? 'Delvis presis' : 'Semi-accurate'}</Badge>
                <Badge variant="secondary">{lang === 'nb' ? 'Helt uskyldig' : 'Harmless'}</Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="card-3d">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-cyan-200" />
                {copy.patternsTitle}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {hub.patterns.map((p) => (
                <div key={p.label} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-white/75">{p.label}</span>
                  <span className="text-sm font-semibold text-white">{p.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="card-3d">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-fuchsia-200" />
                {copy.dramaTitle}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-white/85 leading-relaxed">{hub.drama}</p>
              <p className="mt-2 text-xs text-white/60">
                {lang === 'nb'
                  ? 'Klikk for å se transaksjonene bak historien.'
                  : 'Click to inspect the transactions behind this story.'}
              </p>
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={openDramaDrilldown}>
                {lang === 'nb' ? 'Se transaksjonene bak dramaet' : 'View transactions behind this drama'}
              </Button>
              <div className="mt-4">
                <p className="text-xs font-semibold text-white/70">{copy.subsTitle}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {subscriptions.slice(0, 6).map((s) => (
                    <Badge key={s.merchant_name} variant="outline" className="text-xs">
                      {s.merchant_name}
                    </Badge>
                  ))}
                  {subscriptions.length === 0 && (
                    <span className="text-xs text-white/55">
                      {lang === 'nb' ? 'Ingen oppdaget (eller veldig godt skjult).' : 'None detected (or very well hidden).'}
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{copy.leaderboardTitle}</CardTitle>
          <p className="text-xs text-white/60">{copy.leaderboardHint}</p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-white/70 mb-2">{copy.topCategories}</p>
            <div className="space-y-2">
              {categories.slice(0, 8).map((c) => (
                <button
                  key={c.category_id || c.category_name || 'uncategorized'}
                  type="button"
                  className="w-full flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left transition-colors hover:bg-white/10"
                  onClick={() => openCategoryDrilldown(c.category_id)}
                  title={lang === 'nb' ? 'Vis transaksjoner for kategori' : 'View transactions for category'}
                >
                  <span className="text-sm text-white/80">
                    {localizeCategoryName(c.category_name || (lang === 'nb' ? 'Ukategorisert' : 'Uncategorized'), currentLanguage)}
                  </span>
                  <span className="text-sm font-semibold text-white">{formatCompactCurrency(c.total || 0)}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-white/70 mb-2">{getMerchantLeaderboardTitle(lang)}</p>
            <div className="space-y-2">
              {merchants.slice(0, 8).map((m) => (
                <button
                  key={(m.merchant_id || 'null') + (m.merchant_name || '')}
                  type="button"
                  className="w-full flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left transition-colors hover:bg-white/10"
                  onClick={() => openMerchantDrilldown(m)}
                  title={lang === 'nb' ? 'Vis transaksjoner for brukersted' : 'View transactions for merchant'}
                >
                  <span className="text-sm text-white/80">{m.merchant_name || 'Unknown'}</span>
                  <span className="text-sm font-semibold text-white">{formatCompactCurrency(m.total || 0)}</span>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
