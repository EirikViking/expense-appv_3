import { useTranslation } from 'react-i18next';
import { setLanguage, type SupportedLanguage } from '@/i18n';
import { cn } from '@/lib/utils';

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { i18n } = useTranslation();
  const current = (i18n.resolvedLanguage || i18n.language || 'en') as SupportedLanguage;

  const set = (lang: SupportedLanguage) => {
    void setLanguage(lang);
  };

  return (
    <div className={cn('inline-flex items-center rounded-md border border-gray-200 bg-white', compact ? 'h-8' : 'h-9')}>
      <button
        type="button"
        onClick={() => set('en')}
        aria-pressed={current === 'en'}
        className={cn(
          'px-2 text-xs font-semibold rounded-l-md',
          compact ? 'h-8' : 'h-9',
          current === 'en' ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50'
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
          current === 'nb' ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50'
        )}
        title="NO"
      >
        NO
      </button>
    </div>
  );
}

