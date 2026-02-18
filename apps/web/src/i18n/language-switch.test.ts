import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

describe('language switching', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', makeStorage());
    vi.stubGlobal('navigator', { language: 'en-US' });
  });

  it('switches from EN to NO and back, while persisting the selected language', async () => {
    const mod = await import('./index');

    await mod.setLanguage('nb');
    const first = mod.default.resolvedLanguage || mod.default.language;
    expect(first.toLowerCase().startsWith('nb')).toBe(true);
    expect(localStorage.getItem('expense_language')).toBe('nb');

    await mod.setLanguage('en');
    const second = mod.default.resolvedLanguage || mod.default.language;
    expect(second.toLowerCase().startsWith('en')).toBe(true);
    expect(localStorage.getItem('expense_language')).toBe('en');
  });
});
