import { useTranslation } from 'react-i18next';
import { setLanguage, type SupportedLanguage } from '@/i18n';
import { cn } from '@/lib/utils';

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { i18n } = useTranslation();
  const resolved = (i18n.resolvedLanguage || i18n.language || 'en').toLowerCase();
  const current: SupportedLanguage =
    resolved.startsWith('nb') || resolved.startsWith('no') || resolved.startsWith('nn') ? 'nb' : 'en';

  const set = (lang: SupportedLanguage) => {
    void setLanguage(lang);
  };

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-md border border-white/15 bg-white/5 text-white shadow-sm',
        compact ? 'h-8' : 'h-9'
      )}
    >
      <button
        type="button"
        onClick={() => set('en')}
        aria-pressed={current === 'en'}
        className={cn(
          'px-2 text-xs font-semibold rounded-l-md',
          compact ? 'h-8' : 'h-9',
          current === 'en' ? 'bg-white/15 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'
        )}
        title="EN"
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => set('nb')}
        aria-pressed={current === 'nb'}
        className={cn(
          'px-2 text-xs font-semibold rounded-r-md',
          compact ? 'h-8' : 'h-9',
          current === 'nb' ? 'bg-white/15 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'
        )}
        title="NO"
      >
        NO
      </button>
    </div>
  );
}
