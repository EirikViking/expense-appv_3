import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type { AnalyticsSummary, CategoryBreakdown, MerchantBreakdown, RecurringItem } from '@expense/shared';
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

type Lang = 'en' | 'nb';

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

function getTopCategory(categories: CategoryBreakdown[]) {
  const c = [...categories].sort((a, b) => (b.total || 0) - (a.total || 0))[0];
  return c ? { id: c.category_id, name: c.category_name || 'Uncategorized', total: c.total || 0 } : null;
}

function getTopMerchant(merchants: MerchantBreakdown[]) {
  const m = [...merchants].sort((a, b) => (b.total || 0) - (a.total || 0))[0];
  return m ? { name: m.merchant_name || 'Unknown', total: m.total || 0, count: m.count || 0 } : null;
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
  const groceriesShare = expenses > 0 ? clamp01((groceries?.total ?? 0) / expenses) : 0;

  const copy = {
    nb: {
      title: 'Innsikt: AI-hub',
      subtitle: 'Et lite underholdningssenter for forbruket ditt. Delvis klokt. Delvis kaos.',
      fortuneTitle: 'Forbruks-horoskop',
      patternsTitle: 'Mønster-radar',
      dramaTitle: 'Dagens drama',
      subsTitle: 'Abonnements-gremlins',
      refresh: 'Nytt påfunn',
      customRange: 'Egendefinert periode',
      applyRange: 'Bruk periode',
      cancel: 'Avbryt',
      from: 'Fra',
      to: 'Til',
      ok: 'OK',
    },
    en: {
      title: 'Insights: AI hub',
      subtitle: 'A tiny entertainment center for your spending. Part wise. Part chaos.',
      fortuneTitle: 'Spending horoscope',
      patternsTitle: 'Pattern radar',
      dramaTitle: 'Today’s drama',
      subsTitle: 'Subscription gremlins',
      refresh: 'New nonsense',
      customRange: 'Custom range',
      applyRange: 'Apply range',
      cancel: 'Cancel',
      from: 'From',
      to: 'To',
      ok: 'OK',
    },
  }[lang];

  const fortuneTemplates =
    lang === 'nb'
      ? [
          `Stjernene sier: netto forbruk er ${formatCompactCurrency(net)}. Du kan fortsatt skylde på “inflasjon”.`,
          `Dagens spådom: ${topCat ? `${topCat.name} prøver å bli en livsstil` : 'kategoriene er i skjul'}.`,
          `Orakelet ser en sterk energi rundt ${topMerchant ? topMerchant.name : 'ukjente kjøpmenn'}… og den energien koster penger.`,
          groceriesShare > 0.22
            ? `Dagligvarer tar ${fmtPct(groceriesShare)} av utgiftene. Du lever enten sunt eller veldig optimistisk.`
            : `Dagligvarer er ${fmtPct(groceriesShare)} av utgiftene. Enten er du effektiv, eller så spiser du minner.`,
        ]
      : [
          `The stars say: net spend is ${formatCompactCurrency(net)}. You may still blame “inflation”.`,
          `Today’s prophecy: ${topCat ? `${topCat.name} is trying to become a lifestyle` : 'your categories are hiding'}.`,
          `The oracle sees a strong aura around ${topMerchant ? topMerchant.name : 'unknown merchants'}… and that aura is expensive.`,
          groceriesShare > 0.22
            ? `Groceries are ${fmtPct(groceriesShare)} of expenses. Either very healthy or very hopeful.`
            : `Groceries are ${fmtPct(groceriesShare)} of expenses. Either efficient or living on vibes.`,
        ];

  const dramaTemplates =
    lang === 'nb'
      ? [
          topMerchant
            ? `${topMerchant.name} dukker opp ${topMerchant.count} ganger. Dette er ikke et mønster. Dette er en saga.`
            : `En mystisk kjøpmann har gjort et innhogg i økonomien. Identiteten er ukjent, men intensiteten er ekte.`,
          subscriptions.length > 0
            ? `Du har ${subscriptions.length} abonnement(er). Små beløp som samarbeider i hemmelighet.`
            : `Ingen abonnementer oppdaget. Enten er du fri… eller så er de forkledd.`,
          income > 0 && expenses > 0
            ? `Inntekt eksisterer. Utgifter eksisterer. Balansen? Vi ser den ikke akkurat nå.`
            : `Dagens drama: “Tall”. De kommer i mange former.`,
        ]
      : [
          topMerchant
            ? `${topMerchant.name} shows up ${topMerchant.count} times. This is not a pattern. This is a saga.`
            : `A mysterious merchant has made a dent. Identity unknown, intensity real.`,
          subscriptions.length > 0
            ? `You have ${subscriptions.length} subscription(s). Small numbers collaborating in secret.`
            : `No subscriptions detected. Either you’re free… or they’re disguised.`,
          income > 0 && expenses > 0
            ? `Income exists. Expenses exist. Balance? We’re searching.`
            : `Today’s drama: “numbers”. They come in many shapes.`,
        ];

  const patterns: Array<{ label: string; value?: string; tone?: 'good' | 'warn' | 'info' }> = [];
  if (topCat) patterns.push({ label: lang === 'nb' ? 'Største kategori' : 'Top category', value: `${topCat.name} • ${formatCompactCurrency(topCat.total)}`, tone: 'info' });
  if (topMerchant) patterns.push({ label: lang === 'nb' ? 'Største kjøpmann' : 'Top merchant', value: `${topMerchant.name} • ${formatCompactCurrency(topMerchant.total)}`, tone: 'info' });
  if (expenses > 0) patterns.push({ label: lang === 'nb' ? 'Dagligvarer-andel' : 'Groceries share', value: fmtPct(groceriesShare), tone: groceriesShare > 0.25 ? 'warn' : 'good' });
  patterns.push({ label: lang === 'nb' ? 'Utgifter' : 'Expenses', value: formatCompactCurrency(expenses), tone: 'info' });
  patterns.push({ label: lang === 'nb' ? 'Inntekter' : 'Income', value: formatCompactCurrency(income), tone: 'info' });

  return {
    copy,
    fortune: pick(fortuneTemplates, seed),
    drama: pick(dramaTemplates, seed + 7),
    patterns,
  };
}

export function InsightsPage() {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const lang = getLang(i18n.resolvedLanguage);

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [categories, setCategories] = useState<CategoryBreakdown[]>([]);
  const [merchants, setMerchants] = useState<MerchantBreakdown[]>([]);
  const [subscriptions, setSubscriptions] = useState<RecurringItem[]>([]);

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
    try {
      const results = await Promise.allSettled([
        api.getAnalyticsSummary({ date_from: dateFrom, date_to: dateTo }),
        api.getAnalyticsByCategory({ date_from: dateFrom, date_to: dateTo }),
        api.getAnalyticsByMerchant({ date_from: dateFrom, date_to: dateTo, limit: 12 }),
        api.getAnalyticsSubscriptions(),
      ]);

      const [summaryRes, byCatRes, byMerchRes, subsRes] = results;
      if (summaryRes.status === 'fulfilled') setSummary(summaryRes.value);
      if (byCatRes.status === 'fulfilled') setCategories(byCatRes.value.categories);
      if (byMerchRes.status === 'fulfilled') setMerchants(byMerchRes.value.merchants);
      if (subsRes.status === 'fulfilled') setSubscriptions(subsRes.value.subscriptions);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  // Remember last selected date range for next visit.
  useEffect(() => {
    if (dateFrom && dateTo) saveLastDateRange({ start: dateFrom, end: dateTo });
    else if (!dateFrom && !dateTo) clearLastDateRange();
  }, [dateFrom, dateTo]);

  const hub = useMemo(() => {
    const baseSeed = hashString(`${dateFrom}|${dateTo}|${summary?.total_expenses ?? 0}|${seed}`);
    return makeHubCards({ lang, seed: baseSeed, summary, categories, merchants, subscriptions });
  }, [lang, dateFrom, dateTo, summary, categories, merchants, subscriptions, seed]);

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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-display">{hub.copy.title}</h1>
          <p className="mt-1 text-sm text-white/70">{hub.copy.subtitle}</p>
        </div>
        <Button
          variant="outline"
          onClick={() => setSeed((s) => s + 1)}
          className="gap-2"
          title={hub.copy.refresh}
        >
          <Wand2 className="h-4 w-4" />
          {hub.copy.refresh}
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
              {hub.copy.customRange}
            </Button>

            <div className="ml-auto text-xs text-white/60">
              {dateFrom} → {dateTo}
            </div>
          </div>

          {showCustomRange && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-white/70 mb-1">{hub.copy.from}</label>
                <SmartDateInput
                  value={customDateFrom}
                  ariaLabel={hub.copy.from}
                  invalidFormatMessage={lang === 'nb' ? 'Ugyldig datoformat.' : 'Invalid date format.'}
                  invalidDateMessage={lang === 'nb' ? 'Ugyldig dato.' : 'Invalid date.'}
                  onChange={setCustomDateFrom}
                  onErrorChange={setCustomDateFromError}
                />
                {customDateFromError && <p className="mt-1 text-xs text-red-300">{customDateFromError}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-white/70 mb-1">{hub.copy.to}</label>
                <SmartDateInput
                  value={customDateTo}
                  ariaLabel={hub.copy.to}
                  invalidFormatMessage={lang === 'nb' ? 'Ugyldig datoformat.' : 'Invalid date format.'}
                  invalidDateMessage={lang === 'nb' ? 'Ugyldig dato.' : 'Invalid date.'}
                  onChange={setCustomDateTo}
                  onErrorChange={setCustomDateToError}
                />
                {customDateToError && <p className="mt-1 text-xs text-red-300">{customDateToError}</p>}
              </div>
              <div className="flex items-end gap-2">
                <Button onClick={applyCustomRange} disabled={!customDateFrom || !customDateTo}>
                  {hub.copy.applyRange}
                </Button>
                <Button variant="outline" onClick={() => setShowCustomRange(false)}>
                  {hub.copy.cancel}
                </Button>
              </div>
              {customRangeError && (
                <p className="sm:col-span-3 text-sm text-red-300">{customRangeError}</p>
              )}
            </div>
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
                {hub.copy.fortuneTitle}
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
                {hub.copy.patternsTitle}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {hub.patterns.map((p) => (
                <div key={p.label} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-white/75">{p.label}</span>
                  <span className="text-sm font-semibold text-white">{p.value}</span>
                </div>
              ))}
              <p className="mt-3 text-xs text-white/55">
                {lang === 'nb'
                  ? 'Tips: Klikk “Nytt påfunn” for å få en annen tolkning av de samme tallene.'
                  : 'Tip: Click “New nonsense” for a different interpretation of the same numbers.'}
              </p>
            </CardContent>
          </Card>

          <Card className="card-3d">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-fuchsia-200" />
                {hub.copy.dramaTitle}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-white/85 leading-relaxed">{hub.drama}</p>
              <div className="mt-4">
                <p className="text-xs font-semibold text-white/70">{hub.copy.subsTitle}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {subscriptions.slice(0, 6).map((s) => (
                    <Badge key={s.merchant_name} variant="outline" className="text-xs">
                      {s.merchant_name}
                    </Badge>
                  ))}
                  {subscriptions.length === 0 && (
                    <span className="text-xs text-white/55">
                      {lang === 'nb' ? 'Ingen oppdaget (eller de gjemmer seg).' : 'None detected (or they hide well).'}
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
          <CardTitle>{lang === 'nb' ? 'Leaderboard (helt uoffisielt)' : 'Leaderboard (unofficial)'}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-white/70 mb-2">{lang === 'nb' ? 'Topp kategorier' : 'Top categories'}</p>
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
                    {localizeCategoryName(c.category_name || (lang === 'nb' ? 'Ukategorisert' : 'Uncategorized'), lang)}
                  </span>
                  <span className="text-sm font-semibold text-white">{formatCompactCurrency(c.total || 0)}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-white/70 mb-2">{lang === 'nb' ? 'Topp kjøpmenn' : 'Top merchants'}</p>
            <div className="space-y-2">
              {merchants.slice(0, 8).map((m) => (
                <button
                  key={(m.merchant_id || 'null') + (m.merchant_name || '')}
                  type="button"
                  className="w-full flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left transition-colors hover:bg-white/10"
                  onClick={() => openMerchantDrilldown(m)}
                  title={lang === 'nb' ? 'Vis transaksjoner for kjopmann' : 'View transactions for merchant'}
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
