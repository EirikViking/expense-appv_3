import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { applyTheme, getInitialTheme, type ThemeMode } from '@/lib/theme';
import { useTranslation } from 'react-i18next';

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<ThemeMode>('night');

  useEffect(() => {
    const initial = getInitialTheme();
    setMode(initial);
    applyTheme(initial);
  }, []);

  const toggle = () => {
    const next: ThemeMode = mode === 'night' ? 'day' : 'night';
    setMode(next);
    applyTheme(next);
  };

  const Icon = mode === 'night' ? Moon : Sun;
  const title = mode === 'night' ? t('theme.night') : t('theme.day');

  return (
    <button
      type="button"
      onClick={toggle}
      title={title}
      aria-label={t('theme.toggle')}
      className={cn(
        'inline-flex items-center justify-center rounded-md border border-white/15 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white transition-colors',
        compact ? 'h-8 w-8' : 'h-9 w-9'
      )}
    >
      <Icon className={cn('h-4 w-4', compact ? 'h-4 w-4' : 'h-4.5 w-4.5')} />
    </button>
  );
}

