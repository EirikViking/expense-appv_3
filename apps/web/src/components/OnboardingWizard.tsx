import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Sparkles, Upload, Volume2, VolumeX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const SOUND_PREF_KEY = 'expense.onboarding.sound.enabled';

type OnboardingWizardProps = {
  open: boolean;
  name?: string;
  onDismiss: () => void;
  onComplete: () => Promise<void>;
  onGoToUpload: () => void;
};

export function OnboardingWizard({
  open,
  name,
  onDismiss,
  onComplete,
  onGoToUpload,
}: OnboardingWizardProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(0);
  }, [open]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      setSoundEnabled(window.localStorage.getItem(SOUND_PREF_KEY) === '1');
    } catch {
      setSoundEnabled(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  const playClickTone = () => {
    if (!soundEnabled || reducedMotion || typeof window === 'undefined') return;
    try {
      const AudioContextCtor = window.AudioContext;
      if (!AudioContextCtor) return;
      const ctx = new AudioContextCtor();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.028, ctx.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
      osc.onended = () => {
        void ctx.close();
      };
    } catch {
      // Ignore audio failures and keep interaction uninterrupted.
    }
  };

  const setSoundPreference = (value: boolean) => {
    setSoundEnabled(value);
    try {
      window.localStorage.setItem(SOUND_PREF_KEY, value ? '1' : '0');
    } catch {
      // no-op
    }
  };

  const finish = async (goToUpload: boolean) => {
    if (submitting) return;
    playClickTone();
    setSubmitting(true);
    try {
      await onComplete();
      if (goToUpload) {
        onGoToUpload();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const cards = useMemo(
    () => [
      {
        icon: Sparkles,
        title: t('onboarding.featureClarityTitle'),
        body: t('onboarding.featureClarityBody'),
      },
      {
        icon: Upload,
        title: t('onboarding.featureUploadTitle'),
        body: t('onboarding.featureUploadBody'),
      },
      {
        icon: BarChart3,
        title: t('onboarding.featureInsightsTitle'),
        body: t('onboarding.featureInsightsBody'),
      },
    ],
    [t]
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onDismiss();
        }
      }}
    >
      <DialogContent className="max-w-2xl overflow-hidden border-white/20 bg-slate-950/75 p-0">
        <div className="relative">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
              className={cn(
                'absolute -left-24 -top-24 h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl',
                !reducedMotion && 'animate-floatSlower'
              )}
            />
            <div
              className={cn(
                'absolute -right-28 top-10 h-72 w-72 rounded-full bg-fuchsia-400/20 blur-3xl',
                !reducedMotion && 'animate-floatSlow'
              )}
            />
            <div
              className={cn(
                'absolute bottom-[-120px] left-1/4 h-80 w-80 rounded-full bg-emerald-300/15 blur-3xl',
                !reducedMotion && 'animate-float'
              )}
            />
          </div>

          <div className="relative space-y-4 p-6 sm:p-7">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {[0, 1].map((dot) => (
                  <span
                    key={dot}
                    className={cn(
                      'h-2.5 rounded-full transition-all',
                      step === dot ? 'w-7 bg-cyan-300' : 'w-2.5 bg-white/35'
                    )}
                    aria-hidden="true"
                  />
                ))}
                <span className="text-xs text-white/70">{t('onboarding.stepCounter', { current: step + 1, total: 2 })}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = !soundEnabled;
                  setSoundPreference(next);
                  if (next) playClickTone();
                }}
                className="inline-flex items-center gap-2 rounded-md border border-white/20 bg-white/5 px-2.5 py-1.5 text-xs text-white/85 transition hover:bg-white/10"
                aria-label={t('onboarding.soundToggleAria')}
              >
                {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                <span>{soundEnabled ? t('onboarding.soundOn') : t('onboarding.soundOff')}</span>
              </button>
            </div>

            <div
              className={cn(
                'min-h-[320px] rounded-2xl border border-white/15 bg-white/[0.03] p-4 sm:p-5',
                !reducedMotion && 'animate-onboarding-step-in'
              )}
              key={`step-${step}`}
            >
              {step === 0 ? (
                <div className="space-y-5">
                  <DialogHeader className="text-left">
                    <DialogTitle className="text-2xl text-display text-white">
                      {name ? t('onboarding.titleWithName', { name }) : t('onboarding.title')}
                    </DialogTitle>
                    <DialogDescription className="text-white/80">
                      {t('onboarding.wizardIntro')}
                    </DialogDescription>
                  </DialogHeader>

                  <div className="grid gap-3 sm:grid-cols-3">
                    {cards.map(({ icon: Icon, title, body }) => (
                      <div
                        key={title}
                        className="rounded-xl border border-white/15 bg-slate-900/55 p-3.5 transition duration-200 hover:-translate-y-0.5 hover:bg-slate-900/70"
                      >
                        <div className="mb-2 inline-flex rounded-lg bg-cyan-300/15 p-2 text-cyan-200">
                          <Icon className="h-4 w-4" />
                        </div>
                        <p className="text-sm font-semibold text-white">{title}</p>
                        <p className="mt-1 text-xs leading-relaxed text-white/70">{body}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  <DialogHeader className="text-left">
                    <DialogTitle className="text-2xl text-display text-white">{t('onboarding.stepTwoTitle')}</DialogTitle>
                    <DialogDescription className="text-white/80">
                      {t('onboarding.stepTwoSubtitle')}
                    </DialogDescription>
                  </DialogHeader>

                  <ol className="space-y-2.5 rounded-xl border border-white/15 bg-slate-900/45 p-4 text-sm text-white/85">
                    <li>{t('onboarding.wizardStepExport')}</li>
                    <li>{t('onboarding.wizardStepImport')}</li>
                    <li>{t('onboarding.wizardStepReview')}</li>
                    <li>{t('onboarding.wizardStepRules')}</li>
                  </ol>
                </div>
              )}
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-2">
                {step === 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      playClickTone();
                      setStep(0);
                    }}
                    disabled={submitting}
                  >
                    {t('onboarding.back')}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  className="text-white/80 hover:text-white"
                  onClick={() => {
                    void finish(false);
                  }}
                  disabled={submitting}
                >
                  {t('onboarding.skip')}
                </Button>
              </div>

              {step === 0 ? (
                <Button
                  type="button"
                  onClick={() => {
                    playClickTone();
                    setStep(1);
                  }}
                  disabled={submitting}
                >
                  {t('onboarding.next')}
                </Button>
              ) : (
                <Button type="button" onClick={() => void finish(true)} disabled={submitting}>
                  {t('onboarding.goToUpload')}
                </Button>
              )}
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
