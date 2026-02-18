import { useEffect, useMemo, useState } from 'react';
import type { BudgetTrackingPeriod } from '@expense/shared';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

function toInputValue(value: number | null | undefined): string {
  return value == null ? '' : String(value);
}

function parseOptionalAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\s+/g, '').replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('invalid');
  }
  return parsed;
}

function periodKey(period: BudgetTrackingPeriod['period']): string {
  if (period === 'weekly') return 'budgetsPage.period.weekly';
  if (period === 'monthly') return 'budgetsPage.period.monthly';
  return 'budgetsPage.period.yearly';
}

function statusKey(status: BudgetTrackingPeriod['status']): string {
  if (status === 'on_track') return 'budgetsPage.status.on_track';
  if (status === 'warning') return 'budgetsPage.status.warning';
  return 'budgetsPage.status.over_budget';
}

function statusVariant(status: BudgetTrackingPeriod['status']): 'default' | 'warning' | 'destructive' {
  if (status === 'on_track') return 'default';
  if (status === 'warning') return 'warning';
  return 'destructive';
}

export function BudgetsPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [weekly, setWeekly] = useState('');
  const [monthly, setMonthly] = useState('');
  const [yearly, setYearly] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ weekly?: string; monthly?: string; yearly?: string }>({});

  const [tracking, setTracking] = useState<BudgetTrackingPeriod[]>([]);

  const configuredCount = useMemo(
    () => [weekly, monthly, yearly].filter((v) => v.trim().length > 0).length,
    [weekly, monthly, yearly],
  );

  const hasOverBudget = useMemo(
    () => tracking.some((item) => item.status === 'over_budget'),
    [tracking],
  );

  const hasWarning = useMemo(
    () => tracking.some((item) => item.status === 'warning'),
    [tracking],
  );

  const allUnderBudget = useMemo(
    () => tracking.length > 0 && tracking.every((item) => item.spent_amount < item.budget_amount),
    [tracking],
  );

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [settingsRes, trackingRes] = await Promise.all([
        api.getBudgetSettings(),
        api.getBudgetTracking(),
      ]);
      setEnabled(settingsRes.settings.enabled);
      setWeekly(toInputValue(settingsRes.settings.weekly_amount));
      setMonthly(toInputValue(settingsRes.settings.monthly_amount));
      setYearly(toInputValue(settingsRes.settings.yearly_amount));
      setTracking(trackingRes.periods || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('budgetsPage.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    const nextErrors: { weekly?: string; monthly?: string; yearly?: string } = {};
    let weeklyAmount: number | null = null;
    let monthlyAmount: number | null = null;
    let yearlyAmount: number | null = null;

    try {
      weeklyAmount = parseOptionalAmount(weekly);
    } catch {
      nextErrors.weekly = t('budgetsPage.invalidAmount');
    }

    try {
      monthlyAmount = parseOptionalAmount(monthly);
    } catch {
      nextErrors.monthly = t('budgetsPage.invalidAmount');
    }

    try {
      yearlyAmount = parseOptionalAmount(yearly);
    } catch {
      nextErrors.yearly = t('budgetsPage.invalidAmount');
    }

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setSaving(false);
      return;
    }

    try {
      await api.updateBudgetSettings({
        enabled,
        weekly_amount: weeklyAmount,
        monthly_amount: monthlyAmount,
        yearly_amount: yearlyAmount,
      });

      const trackingRes = await api.getBudgetTracking();
      setTracking(trackingRes.periods || []);
      setSuccess(t('budgetsPage.saved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('budgetsPage.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const persistEnabled = async (nextEnabled: boolean) => {
    const previous = enabled;
    setEnabled(nextEnabled);
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api.updateBudgetSettings({ enabled: nextEnabled });
      const trackingRes = await api.getBudgetTracking();
      setTracking(trackingRes.periods || []);
      setSuccess(t('budgetsPage.saved'));
    } catch (err) {
      setEnabled(previous);
      setError(err instanceof Error ? err.message : t('budgetsPage.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">{t('budgetsPage.title')}</h1>
        <p className="text-sm text-white/70 mt-1">{t('budgetsPage.description')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('budgetsPage.toggleTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="inline-flex items-center gap-3">
            <input
              type="checkbox"
              checked={enabled}
              disabled={saving || loading}
              onChange={(e) => {
                void persistEnabled(e.target.checked);
              }}
              className="h-4 w-4 rounded border-white/20 bg-white/5"
            />
            <span className="font-medium">
              {enabled ? t('budgetsPage.enabled') : t('budgetsPage.disabled')}
            </span>
          </label>

          <p className="text-xs text-white/65">{t('budgetsPage.toggleHelp')}</p>

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-white/85 mb-1">{t('budgetsPage.weekly')}</label>
              <input
                value={weekly}
                onChange={(e) => setWeekly(e.target.value)}
                placeholder={t('budgetsPage.optionalAmount')}
                className="h-10 w-full rounded-md border border-white/15 bg-white/5 px-3 text-sm"
                inputMode="decimal"
              />
              {fieldErrors.weekly && <p className="text-xs text-red-300 mt-1">{fieldErrors.weekly}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-white/85 mb-1">{t('budgetsPage.monthly')}</label>
              <input
                value={monthly}
                onChange={(e) => setMonthly(e.target.value)}
                placeholder={t('budgetsPage.optionalAmount')}
                className="h-10 w-full rounded-md border border-white/15 bg-white/5 px-3 text-sm"
                inputMode="decimal"
              />
              {fieldErrors.monthly && <p className="text-xs text-red-300 mt-1">{fieldErrors.monthly}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-white/85 mb-1">{t('budgetsPage.yearly')}</label>
              <input
                value={yearly}
                onChange={(e) => setYearly(e.target.value)}
                placeholder={t('budgetsPage.optionalAmount')}
                className="h-10 w-full rounded-md border border-white/15 bg-white/5 px-3 text-sm"
                inputMode="decimal"
              />
              {fieldErrors.yearly && <p className="text-xs text-red-300 mt-1">{fieldErrors.yearly}</p>}
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Button onClick={save} disabled={saving || loading}>
              {saving ? t('budgetsPage.saving') : t('budgetsPage.save')}
            </Button>
            <span className="text-xs text-white/60">
              {t('budgetsPage.configuredCount', { count: configuredCount })}
            </span>
            {success && <span className="text-xs text-emerald-300">{success}</span>}
          </div>

          {error && (
            <div className="rounded-md border border-red-300/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('budgetsPage.trackingTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-white/60">{t('budgetsPage.loading')}</p>
          ) : !enabled ? (
            <p className="text-sm text-white/65">{t('budgetsPage.disabledHint')}</p>
          ) : tracking.length === 0 ? (
            <p className="text-sm text-white/65">{t('budgetsPage.trackingEmpty')}</p>
          ) : (
            <div className="space-y-3">
              {hasOverBudget ? (
                <div className="rounded-md border border-red-300/35 bg-red-500/15 px-3 py-2 text-sm text-red-100">
                  {t('budgetsPage.feedback.overBudget')}
                </div>
              ) : hasWarning ? (
                <div className="rounded-md border border-amber-300/35 bg-amber-500/15 px-3 py-2 text-sm text-amber-100">
                  {t('budgetsPage.feedback.warning')}
                </div>
              ) : allUnderBudget ? (
                <div className="rounded-md border border-emerald-300/35 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-100">
                  {t('budgetsPage.feedback.underBudget')}
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {tracking.map((item) => {
                  const progressPct = Math.min(100, Math.max(0, item.progress_ratio * 100));
                  return (
                    <div key={item.period} className="rounded-lg border border-white/15 bg-white/5 p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold">{t(periodKey(item.period))}</p>
                        <Badge variant={statusVariant(item.status)}>{t(statusKey(item.status))}</Badge>
                      </div>

                      <div className="space-y-1 text-sm">
                        <p>{t('budgetsPage.budget')}: <span className="font-medium">{formatCurrency(item.budget_amount)}</span></p>
                        <p>{t('budgetsPage.spent')}: <span className="font-medium">{formatCurrency(item.spent_amount)}</span></p>
                        <p>{t('budgetsPage.remaining')}: <span className="font-medium">{formatCurrency(item.remaining_amount)}</span></p>
                        <p>{t('budgetsPage.projected')}: <span className="font-medium">{formatCurrency(item.projected_spent)}</span></p>
                      </div>

                      <div className="space-y-1">
                        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full bg-cyan-300 transition-all"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                        <p className="text-xs text-white/60">
                          {Math.round(progressPct)}% • {t('budgetsPage.daysLeft', { count: item.days_remaining })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
