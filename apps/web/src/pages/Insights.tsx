import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type {
  AnalyticsCompareResponse,
  AnalyticsSummary,
  CategoryBreakdown,
  MerchantBreakdown,
  RecurringItem,
  TimeSeriesPoint,
  TransactionWithMeta,
  BudgetTrackingPeriod,
} from '@expense/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCompactCurrency, getMonthRange, getPreviousMonthRange } from '@/lib/utils';
import { Brain, Calendar, RefreshCw, Sparkles, Target, Trophy, Wand2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { clearLastDateRange, loadLastDateRange, saveLastDateRange } from '@/lib/date-range-store';
import { useNavigate } from 'react-router-dom';
import { SmartDateInput } from '@/components/SmartDateInput';
import { validateDateRange } from '@/lib/date-input';
import { localizeCategoryName } from '@/lib/category-localization';
import { useAuth } from '@/context/AuthContext';
import { makePageCacheKey, readPageCache, writePageCache } from '@/lib/page-data-cache';

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
  quizTitle: string;
  quizSubtitle: string;
  quizProgress: string;
  quizScore: string;
  quizPerfect: string;
  quizGood: string;
  quizTryAgain: string;
  quizShowData: string;
  quizShuffle: string;
  wisdomTitle: string;
  wisdomSubtitle: string;
  missionTitle: string;
  praiseTitle: string;
};

type QuizQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  drilldown?:
    | { type: 'category'; categoryId?: string | null }
    | { type: 'merchant'; merchantId?: string | null; merchantName?: string | null }
    | { type: 'day'; date: string }
    | { type: 'period' };
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

function getBudgetScheduleDelta(item: BudgetTrackingPeriod) {
  if (!Number.isFinite(item.budget_amount) || item.budget_amount <= 0) return null;
  if (!Number.isFinite(item.days_total) || item.days_total <= 0) return null;
  if (!Number.isFinite(item.days_elapsed) || item.days_elapsed <= 0) return null;

  const elapsedRatio = clamp01(item.days_elapsed / item.days_total);
  const expectedSpentSoFar = item.budget_amount * elapsedRatio;
  const delta = expectedSpentSoFar - item.spent_amount;

  return {
    expectedSpentSoFar,
    delta,
    direction: delta >= 0 ? ('ahead' as const) : ('behind' as const),
  };
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
      quizTitle: 'Forbruksquiz',
      quizSubtitle: 'Tre raske sp\u00f8rsm\u00e5l om perioden din.',
      quizProgress: 'Besvart',
      quizScore: 'Poeng',
      quizPerfect: 'Perfekt! Du kjenner forbruket ditt imponerende godt.',
      quizGood: 'Sterkt levert. Du har god kontroll p\u00e5 tallene.',
      quizTryAgain: 'God start. Ta en ny runde og l\u00e5s opp flere detaljer.',
      quizShowData: 'Se datagrunnlag',
      quizShuffle: 'Ny quiz',
      wisdomTitle: 'AI-coach med glimt i \u00f8yet',
      wisdomSubtitle: 'Mikror\u00e5d laget fra dine faktiske tall i perioden.',
      missionTitle: 'Ukens mini-oppdrag',
      praiseTitle: 'Ros fra coachen',
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
    quizTitle: 'Spending quiz',
    quizSubtitle: 'Three quick questions based on your current period.',
    quizProgress: 'Answered',
    quizScore: 'Score',
    quizPerfect: 'Perfect. You know your own spending surprisingly well.',
    quizGood: 'Strong work. You clearly track your numbers.',
    quizTryAgain: 'Nice start. Run another round to sharpen your instincts.',
    quizShowData: 'Show data behind answer',
    quizShuffle: 'New quiz',
    wisdomTitle: 'AI coach with personality',
    wisdomSubtitle: 'Micro-advice generated from your real period data.',
    missionTitle: 'Mini mission of the week',
    praiseTitle: 'Coach applause',
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
  drilldown?:
    | { type: 'category'; categoryId?: string | null }
    | { type: 'merchant'; merchantId?: string | null; merchantName?: string | null }
    | { type: 'day'; date: string }
    | { type: 'transaction'; transactionId: string }
    | { type: 'period' };
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
      emoji: '\u{1F4E6}',
      title: lang === 'nb' ? 'Største kategori' : 'Top category',
      value: localizeCategoryName(topCategory.name, currentLanguage),
      detail: formatCompactCurrency(topCategory.total),
      drilldown: { type: 'category', categoryId: topCategory.id },
    });
  }

  if (largestExpenseTx) {
    out.push({
      id: 'largest-purchase',
      emoji: '\u{1F9FE}',
      title: lang === 'nb' ? 'Største enkeltkjøp' : 'Largest single purchase',
      value: largestExpenseTx.description,
      detail: formatCompactCurrency(Math.abs(largestExpenseTx.amount)),
      drilldown: { type: 'transaction', transactionId: largestExpenseTx.id },
    });
  }

  const topMerchant = getTopMerchant(merchants);
  if (topMerchant) {
    out.push({
      id: 'top-merchant',
      emoji: '\u{1F3EA}',
      title: lang === 'nb' ? 'Mest brukte brukersted' : 'Most used merchant',
      value: topMerchant.name,
      detail: lang === 'nb' ? `${topMerchant.count} kjøp` : `${topMerchant.count} purchases`,
      drilldown: { type: 'merchant', merchantId: topMerchant.id, merchantName: topMerchant.name },
    });
  }

  const topDay = getTopSpendDay(timeseries);
  if (topDay) {
    out.push({
      id: 'top-day',
      emoji: '\u{1F4C5}',
      title: lang === 'nb' ? 'Dag med høyest forbruk' : 'Highest-spend day',
      value: topDay.date,
      detail: formatCompactCurrency(Math.abs(topDay.amount)),
      drilldown: { type: 'day', date: topDay.date },
    });
  }

  if (compare) {
    const pct = compare.change_percentage.expenses;
    const delta = compare.change.expenses;
    const up = delta > 0;
    out.push({
      id: 'period-change',
      emoji: up ? '\u{1F4C8}' : '\u{1F4C9}',
      title: lang === 'nb' ? 'Endring mot forrige periode' : 'Change vs previous period',
      value: `${up ? '+' : ''}${pct.toFixed(1)}%`,
      detail: `${up ? '+' : ''}${formatCompactCurrency(delta)}`,
      drilldown: { type: 'period' },
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

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

export function buildSpendingQuiz(args: {
  lang: Lang;
  currentLanguage: string;
  summary: AnalyticsSummary | null;
  categories: CategoryBreakdown[];
  merchants: MerchantBreakdown[];
  timeseries: TimeSeriesPoint[];
}): QuizQuestion[] {
  const { lang, currentLanguage, summary, categories, merchants, timeseries } = args;
  const questions: QuizQuestion[] = [];
  const totalExpenses = Math.abs(summary?.total_expenses ?? 0);
  const topCategory = getTopCategory(categories);
  const topMerchant = getTopMerchant(merchants);
  const topDay = getTopSpendDay(timeseries);

  if (topCategory && totalExpenses > 0) {
    const localizedCategory = localizeCategoryName(topCategory.name, currentLanguage);
    const exactPct = Math.max(1, Math.round((Math.abs(topCategory.total) / totalExpenses) * 100));
    const nearLow = Math.max(1, exactPct - 7);
    const nearHigh = Math.min(95, exactPct + 9);
    const options = uniqueStrings([`${nearLow}%`, `${exactPct}%`, `${nearHigh}%`]);
    const correctIndex = options.indexOf(`${exactPct}%`);
    if (options.length >= 3 && correctIndex >= 0) {
      questions.push({
        id: 'quiz-top-category-share',
        prompt:
          lang === 'nb'
            ? `Hvor stor andel av forbruket gikk til ${localizedCategory}?`
            : `How much of your spending went to ${localizedCategory}?`,
        options,
        correctIndex,
        explanation:
          lang === 'nb'
            ? `${localizedCategory} tok ${exactPct}% av perioden. Det er en tydelig driver.`
            : `${localizedCategory} represented ${exactPct}% of this period. It is a clear driver.`,
        drilldown: { type: 'category', categoryId: topCategory.id },
      });
    }
  }

  if (topMerchant) {
    const decoys = merchants
      .map((m) => m.merchant_name || (lang === 'nb' ? 'Ukjent brukersted' : 'Unknown merchant'))
      .filter((name) => name !== topMerchant.name)
      .slice(0, 2);
    const options = uniqueStrings([topMerchant.name, ...decoys]);
    if (options.length >= 3) {
      const correctIndex = options.indexOf(topMerchant.name);
      questions.push({
        id: 'quiz-top-merchant',
        prompt:
          lang === 'nb'
            ? 'Hvilket brukersted dukket opp oftest i perioden?'
            : 'Which merchant appeared most often in this period?',
        options,
        correctIndex,
        explanation:
          lang === 'nb'
            ? `${topMerchant.name} dukket opp ${topMerchant.count} ganger i perioden.`
            : `${topMerchant.name} appeared ${topMerchant.count} times in this period.`,
        drilldown: { type: 'merchant', merchantId: topMerchant.id, merchantName: topMerchant.name },
      });
    }
  }

  if (topDay) {
    const allDates = uniqueStrings(timeseries.map((p) => p.date).filter(Boolean));
    const nearDates = allDates.filter((d) => d !== topDay.date).slice(0, 2);
    const options = uniqueStrings([topDay.date, ...nearDates]);
    if (options.length >= 3) {
      const correctIndex = options.indexOf(topDay.date);
      questions.push({
        id: 'quiz-top-day',
        prompt:
          lang === 'nb'
            ? 'Hvilken dag hadde h\u00f8yest forbruk?'
            : 'Which day had the highest spending?',
        options,
        correctIndex,
        explanation:
          lang === 'nb'
            ? `${topDay.date} var toppdagen med ${formatCompactCurrency(Math.abs(topDay.amount))}.`
            : `${topDay.date} was the peak day with ${formatCompactCurrency(Math.abs(topDay.amount))}.`,
        drilldown: { type: 'day', date: topDay.date },
      });
    }
  }

  return questions.slice(0, 3);
}

export function buildCoachWisdom(args: {
  lang: Lang;
  summary: AnalyticsSummary | null;
  compare: AnalyticsCompareResponse | null;
  categories: CategoryBreakdown[];
  merchants: MerchantBreakdown[];
  currentLanguage: string;
}): { praise: string; mission: string; bullets: string[] } {
  const { lang, summary, compare, categories, merchants, currentLanguage } = args;
  const totalExpenses = Math.abs(summary?.total_expenses ?? 0);
  const expenseDelta = compare?.change.expenses ?? 0;
  const expensePct = compare?.change_percentage.expenses ?? 0;
  const topCategory = getTopCategory(categories);
  const topMerchant = getTopMerchant(merchants);

  const praise =
    expenseDelta < 0
      ? lang === 'nb'
        ? `Sterkt jobbet! Forbruket er ned ${formatCompactCurrency(Math.abs(expenseDelta))} (${Math.abs(expensePct).toFixed(1)}%).`
        : `Great work! Spending is down ${formatCompactCurrency(Math.abs(expenseDelta))} (${Math.abs(expensePct).toFixed(1)}%).`
      : expenseDelta === 0
        ? lang === 'nb'
          ? 'Stabilt og kontrollert. Du holder samme forbruksniv\u00e5 som forrige periode.'
          : 'Stable and controlled. You kept spending flat versus the previous period.'
        : lang === 'nb'
          ? 'Bra innsats med oversikt. N\u00e5 handler det om \u00e5 finjustere de st\u00f8rste postene.'
          : 'Solid visibility. Next step is tightening the largest spending buckets.';

  const mission =
    topCategory
      ? lang === 'nb'
        ? `Sett et mini-m\u00e5l: kutt ${localizeCategoryName(topCategory.name, currentLanguage)} med 5% neste periode.`
        : `Set a mini goal: reduce ${localizeCategoryName(topCategory.name, currentLanguage)} by 5% next period.`
      : lang === 'nb'
        ? 'Sett et mini-m\u00e5l: kategoriser de 10 siste transaksjonene for bedre innsikt.'
        : 'Set a mini goal: categorize your latest 10 transactions for sharper insight.';

  const bullets: string[] = [];
  if (topCategory && totalExpenses > 0) {
    const share = Math.round((Math.abs(topCategory.total) / totalExpenses) * 100);
    bullets.push(
      lang === 'nb'
        ? `${localizeCategoryName(topCategory.name, currentLanguage)} utgj\u00f8r ${share}% av forbruket ditt.`
        : `${localizeCategoryName(topCategory.name, currentLanguage)} represents ${share}% of your spending.`
    );
  }
  if (topMerchant) {
    bullets.push(
      lang === 'nb'
        ? `${topMerchant.name} er p\u00e5 toppen med ${topMerchant.count} kj\u00f8p.`
        : `${topMerchant.name} leads with ${topMerchant.count} purchases.`
    );
  }
  bullets.push(
    lang === 'nb'
      ? 'Tips: bruk drilldown i h\u00f8ydepunkter for \u00e5 handle p\u00e5 de st\u00f8rste postene f\u00f8rst.'
      : 'Tip: use highlight drilldowns to act on your largest spend first.'
  );

  return { praise, mission, bullets };
}

export function InsightsPage() {
  const INSIGHTS_CACHE_TTL_MS = 30_000;
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
  const [budgetTracking, setBudgetTracking] = useState<BudgetTrackingPeriod[]>([]);
  const [budgetsEnabled, setBudgetsEnabled] = useState(false);

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
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const requestIdRef = useRef(0);

  const loadData = async () => {
    const requestId = ++requestIdRef.current;
    const cacheKey = makePageCacheKey('insights:page', {
      userId: user?.id || 'anonymous',
      dateFrom,
      dateTo,
    });
    const cached = readPageCache<{
      summary: AnalyticsSummary | null;
      categories: CategoryBreakdown[];
      merchants: MerchantBreakdown[];
      subscriptions: RecurringItem[];
      timeseries: TimeSeriesPoint[];
      largestExpenseTx: TransactionWithMeta | null;
      compare: AnalyticsCompareResponse | null;
      budgetTracking: BudgetTrackingPeriod[];
      budgetsEnabled: boolean;
    }>(cacheKey);
    if (cached) {
      setSummary(cached.summary);
      setCategories(cached.categories);
      setMerchants(cached.merchants);
      setSubscriptions(cached.subscriptions);
      setTimeseries(cached.timeseries);
      setLargestExpenseTx(cached.largestExpenseTx);
      setCompare(cached.compare);
      setBudgetTracking(cached.budgetTracking);
      setBudgetsEnabled(cached.budgetsEnabled);
      setLoading(false);
    }
    setLoading(true);
    const prev = getPreviousRange(dateFrom, dateTo);

    try {
      const summaryPromise = api.getAnalyticsSummary({ date_from: dateFrom, date_to: dateTo });
      const byCategoryPromise = api.getAnalyticsByCategory({ date_from: dateFrom, date_to: dateTo });
      const timeseriesPromise = api.getAnalyticsTimeseries({ date_from: dateFrom, date_to: dateTo, granularity: 'day', include_transfers: false });
      const comparePromise = api.getAnalyticsCompare({
        current_start: dateFrom,
        current_end: dateTo,
        previous_start: prev.from,
        previous_end: prev.to,
      });

      const byMerchantPromise = api.getAnalyticsByMerchant({ date_from: dateFrom, date_to: dateTo, limit: 12 });
      const subsPromise = api.getAnalyticsSubscriptions();
      const largestPromise = api.getTransactions({
        date_from: dateFrom,
        date_to: dateTo,
        flow_type: 'expense',
        include_transfers: false,
        limit: 1,
        sort_by: 'amount_abs',
        sort_order: 'desc',
      });
      const budgetTrackingPromise = api.getBudgetTracking();

      const coreResults = await Promise.allSettled([
        summaryPromise,
        byCategoryPromise,
        timeseriesPromise,
        comparePromise,
      ]);

      if (requestId !== requestIdRef.current) return;

      const [summaryRes, byCatRes, timeseriesRes, compareRes] = coreResults;
      if (summaryRes.status === 'fulfilled') setSummary(summaryRes.value);
      if (byCatRes.status === 'fulfilled') setCategories(byCatRes.value.categories);
      if (timeseriesRes.status === 'fulfilled') setTimeseries(timeseriesRes.value.series);
      if (compareRes.status === 'fulfilled') setCompare(compareRes.value);
      setLoading(false);

      const secondaryResults = await Promise.allSettled([
        byMerchantPromise,
        subsPromise,
        largestPromise,
        budgetTrackingPromise,
      ]);

      if (requestId !== requestIdRef.current) return;

      const [byMerchRes, subsRes, largestRes, budgetTrackingRes] = secondaryResults;
      if (byMerchRes.status === 'fulfilled') setMerchants(byMerchRes.value.merchants);
      if (subsRes.status === 'fulfilled') setSubscriptions(subsRes.value.subscriptions);
      if (largestRes.status === 'fulfilled') setLargestExpenseTx(largestRes.value.transactions[0] ?? null);
      if (budgetTrackingRes.status === 'fulfilled') {
        setBudgetTracking(budgetTrackingRes.value.periods || []);
        setBudgetsEnabled(Boolean(budgetTrackingRes.value.enabled));
      }

      writePageCache(
        cacheKey,
        {
          summary: summaryRes.status === 'fulfilled' ? summaryRes.value : summary,
          categories: byCatRes.status === 'fulfilled' ? byCatRes.value.categories : categories,
          merchants: byMerchRes.status === 'fulfilled' ? byMerchRes.value.merchants : merchants,
          subscriptions: subsRes.status === 'fulfilled' ? subsRes.value.subscriptions : subscriptions,
          timeseries: timeseriesRes.status === 'fulfilled' ? timeseriesRes.value.series : timeseries,
          largestExpenseTx: largestRes.status === 'fulfilled' ? (largestRes.value.transactions[0] ?? null) : largestExpenseTx,
          compare: compareRes.status === 'fulfilled' ? compareRes.value : compare,
          budgetTracking: budgetTrackingRes.status === 'fulfilled' ? (budgetTrackingRes.value.periods || []) : budgetTracking,
          budgetsEnabled: budgetTrackingRes.status === 'fulfilled' ? Boolean(budgetTrackingRes.value.enabled) : budgetsEnabled,
        },
        INSIGHTS_CACHE_TTL_MS
      );
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, user?.id]);

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

  const quiz = useMemo(
    () =>
      buildSpendingQuiz({
        lang,
        currentLanguage,
        summary,
        categories,
        merchants,
        timeseries,
      }),
    [lang, currentLanguage, summary, categories, merchants, timeseries]
  );

  const coach = useMemo(
    () => buildCoachWisdom({ lang, summary, compare, categories, merchants, currentLanguage }),
    [lang, summary, compare, categories, merchants, currentLanguage]
  );

  const quizAnsweredCount = useMemo(
    () => quiz.filter((q) => quizAnswers[q.id] !== undefined).length,
    [quiz, quizAnswers]
  );
  const quizScore = useMemo(
    () => quiz.filter((q) => quizAnswers[q.id] === q.correctIndex).length,
    [quiz, quizAnswers]
  );

  useEffect(() => {
    setQuizAnswers({});
  }, [dateFrom, dateTo, seed]);

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
    if (merchant.merchant_name) qs.set('merchant_name', merchant.merchant_name);
    else if (merchant.merchant_id) qs.set('merchant_id', merchant.merchant_id);
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

  const openDrilldown = (drilldown: Highlight['drilldown']) => {
    if (!drilldown) return;

    if (drilldown.type === 'category') {
      openCategoryDrilldown(drilldown.categoryId);
      return;
    }

    if (drilldown.type === 'merchant') {
      openMerchantDrilldown({
        merchant_id: drilldown.merchantId ?? null,
        merchant_name: drilldown.merchantName ?? '',
        total: 0,
        count: 0,
        avg: 0,
        trend: 0,
      });
      return;
    }

    if (drilldown.type === 'day') {
      const qs = createBaseDrilldownQuery();
      qs.set('date_from', drilldown.date);
      qs.set('date_to', drilldown.date);
      navigate(`/transactions?${qs.toString()}`);
      return;
    }

    if (drilldown.type === 'transaction') {
      const qs = new URLSearchParams();
      qs.set('transaction_id', drilldown.transactionId);
      navigate(`/transactions?${qs.toString()}`);
      return;
    }

    navigate(`/transactions?${createBaseDrilldownQuery().toString()}`);
  };

  const openHighlightDrilldown = (highlight: Highlight) => {
    openDrilldown(highlight.drilldown);
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

      {budgetsEnabled && (
        <Card>
          <CardHeader>
            <CardTitle>{lang === 'nb' ? 'Budsjettkompass' : 'Budget compass'}</CardTitle>
          </CardHeader>
          <CardContent>
            {budgetTracking.length === 0 ? (
              <p className="text-sm text-white/70">
                {lang === 'nb'
                  ? 'Budsjett er aktivert, men ingen periodegrenser er satt ennå.'
                  : 'Budgeting is enabled, but no period limits are set yet.'}
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {budgetTracking.map((item) => {
                  const label =
                    item.period === 'weekly'
                      ? lang === 'nb' ? 'Uke' : 'Week'
                      : item.period === 'monthly'
                        ? lang === 'nb' ? 'M\u00e5ned' : 'Month'
                        : lang === 'nb' ? '\u00c5r' : 'Year';
                  const schedule = item.period === 'yearly' ? getBudgetScheduleDelta(item) : null;
                  const statusLabel =
                    item.status === 'on_track'
                      ? lang === 'nb' ? 'I rute' : 'On track'
                      : item.status === 'warning'
                        ? lang === 'nb' ? 'Følg med' : 'Watchlist'
                        : lang === 'nb' ? 'Over' : 'Over';
                  return (
                    <button
                      key={item.period}
                      type="button"
                      className="rounded-lg border border-white/10 bg-white/5 p-3 text-left hover:bg-white/10 transition-colors"
                      onClick={() => navigate('/budgets')}
                    >
                      <p className="text-xs text-white/60">{label}</p>
                      <p className="mt-1 text-sm font-semibold text-white">
                        {formatCompactCurrency(item.spent_amount)} / {formatCompactCurrency(item.budget_amount)}
                      </p>
                      <p className="mt-1 text-xs text-cyan-100/90">{statusLabel}</p>
                      {schedule && (
                        <p className="mt-1 text-xs text-white/70">
                          {lang === 'nb'
                            ? `Skjema hittil: ${formatCompactCurrency(schedule.expectedSpentSoFar)} - ${schedule.direction === 'ahead' ? 'Foran skjema' : 'Bak skjema'}: ${formatCompactCurrency(Math.abs(schedule.delta))}`
                            : `Expected by now: ${formatCompactCurrency(schedule.expectedSpentSoFar)} - ${schedule.direction === 'ahead' ? 'Ahead of schedule' : 'Behind schedule'}: ${formatCompactCurrency(Math.abs(schedule.delta))}`}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
                <button
                  key={h.id}
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/5 p-3 text-left transition-colors hover:bg-white/10"
                  onClick={() => openHighlightDrilldown(h)}
                >
                  <p className="text-xs text-white/60">{h.emoji} {h.title}</p>
                  <p className="mt-1 text-sm font-semibold text-white">{h.value}</p>
                  <p className="mt-1 text-xs text-cyan-100/90">{h.detail}</p>
                </button>
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

      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-20 top-12 h-48 w-48 rounded-full bg-cyan-300/20 blur-3xl animate-floatSlow" />
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-fuchsia-300/20 blur-3xl animate-float" />
          <div className="absolute bottom-0 left-1/3 h-44 w-44 rounded-full bg-emerald-300/10 blur-3xl animate-floatSlower" />
        </div>
        <CardHeader className="relative">
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-cyan-200" />
            {copy.quizTitle}
          </CardTitle>
          <p className="text-xs text-white/70">{copy.quizSubtitle}</p>
        </CardHeader>
        <CardContent className="relative grid grid-cols-1 xl:grid-cols-3 gap-4">
          {loading ? (
            <>
              <div className="xl:col-span-2 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="mt-3 h-9 w-full" />
                    <Skeleton className="mt-2 h-9 w-full" />
                    <Skeleton className="mt-2 h-9 w-full" />
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            </>
          ) : (
            <>
              <div className="xl:col-span-2 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">
                    {copy.quizProgress}: {quizAnsweredCount}/{quiz.length}
                  </Badge>
                  <Badge variant="secondary">
                    {copy.quizScore}: {quizScore}/{quiz.length}
                  </Badge>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="ml-auto"
                    onClick={() => {
                      setQuizAnswers({});
                      setSeed((s) => s + 1);
                    }}
                  >
                    {copy.quizShuffle}
                  </Button>
                </div>

                {quiz.map((q, index) => {
                  const selected = quizAnswers[q.id];
                  const answered = selected !== undefined;
                  return (
                    <div key={q.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <p className="text-xs text-white/60">
                        {lang === 'nb' ? 'Sp\u00f8rsm\u00e5l' : 'Question'} {index + 1}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-white">{q.prompt}</p>
                      <div className="mt-3 grid gap-2">
                        {q.options.map((option, optIndex) => {
                          const isCorrect = optIndex === q.correctIndex;
                          const isSelected = selected === optIndex;
                          const stateClass = answered
                            ? isCorrect
                              ? 'border-emerald-300/40 bg-emerald-400/15 text-emerald-100'
                              : isSelected
                                ? 'border-rose-300/40 bg-rose-400/15 text-rose-100'
                                : 'border-white/10 bg-white/5 text-white/70'
                            : 'border-white/15 bg-white/5 text-white hover:bg-white/10';
                          return (
                            <button
                              key={`${q.id}-${option}`}
                              type="button"
                              className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${stateClass}`}
                              disabled={answered}
                              onClick={() => setQuizAnswers((prev) => ({ ...prev, [q.id]: optIndex }))}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>
                      {answered && (
                        <div className="mt-3 rounded-lg border border-cyan-200/20 bg-cyan-500/10 p-3">
                          <p className="text-xs text-cyan-100/90">{q.explanation}</p>
                          {q.drilldown && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="mt-2"
                              onClick={() => openDrilldown(q.drilldown as Highlight['drilldown'])}
                            >
                              {copy.quizShowData}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-emerald-200/20 bg-emerald-500/10 p-4">
                  <p className="text-xs font-semibold text-emerald-100 flex items-center gap-2">
                    <Trophy className="h-4 w-4" />
                    {copy.praiseTitle}
                  </p>
                  <p className="mt-2 text-sm text-emerald-50">{coach.praise}</p>
                </div>

                <div className="rounded-xl border border-fuchsia-200/20 bg-fuchsia-500/10 p-4">
                  <p className="text-xs font-semibold text-fuchsia-100">{copy.wisdomTitle}</p>
                  <p className="mt-1 text-xs text-fuchsia-100/80">{copy.wisdomSubtitle}</p>
                  <ul className="mt-3 space-y-2 text-sm text-fuchsia-50">
                    {coach.bullets.map((bullet) => (
                      <li key={bullet} className="leading-relaxed">• {bullet}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl border border-cyan-200/20 bg-cyan-500/10 p-4">
                  <p className="text-xs font-semibold text-cyan-100 flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    {copy.missionTitle}
                  </p>
                  <p className="mt-2 text-sm text-cyan-50">{coach.mission}</p>
                </div>

                {quiz.length > 0 && quizAnsweredCount === quiz.length && (
                  <div className="rounded-xl border border-amber-200/20 bg-amber-500/10 p-4">
                    <p className="text-sm text-amber-50 font-medium">
                      {quizScore === quiz.length ? copy.quizPerfect : quizScore >= Math.ceil(quiz.length / 2) ? copy.quizGood : copy.quizTryAgain}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
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
