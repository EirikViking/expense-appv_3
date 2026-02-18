import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import nb from './locales/nb.json';

export type SupportedLanguage = 'en' | 'nb';

const STORAGE_KEY = 'expense_language';

function normalizeNavigatorLang(lang: string): SupportedLanguage {
  const lower = (lang || '').toLowerCase();
  // Treat all Norwegian variants as Bokmal for now.
  if (lower.startsWith('nb') || lower.startsWith('no') || lower.startsWith('nn')) return 'nb';
  return 'en';
}

export function detectInitialLanguage(): SupportedLanguage {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'nb') return stored;
  } catch {
    // ignore
  }
  const navigatorLang =
    typeof navigator !== 'undefined' && typeof navigator.language === 'string'
      ? navigator.language
      : 'en';
  return normalizeNavigatorLang(navigatorLang);
}

export async function setLanguage(lang: SupportedLanguage): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // ignore
  }
  await i18n.changeLanguage(lang);
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      nb: { translation: nb },
    },
    lng: detectInitialLanguage(),
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnNull: false,
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('i18n init failed', err);
  });

export default i18n;
