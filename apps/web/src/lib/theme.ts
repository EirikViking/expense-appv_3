export type ThemeMode = 'night' | 'day';

const STORAGE_KEY = 'expense_theme_mode';

export function getInitialTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'night' || stored === 'day') return stored;
  } catch {
    // ignore
  }

  // Default: follow system, but store a concrete mode so the toggle is deterministic.
  const prefersDark =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'night' : 'day';
}

export function applyTheme(mode: ThemeMode): void {
  document.documentElement.dataset.theme = mode;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}

