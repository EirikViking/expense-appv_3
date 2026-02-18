import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, getInitialTheme } from './theme';

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

describe('theme', () => {
  beforeEach(() => {
    const storage = makeStorage();
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('document', { documentElement: { dataset: {} as Record<string, string> } });
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false }),
    });
  });

  it('persists and applies selected theme mode', () => {
    applyTheme('day');
    expect((document as any).documentElement.dataset.theme).toBe('day');
    expect(localStorage.getItem('expense_theme_mode')).toBe('day');
  });

  it('reads persisted theme mode first', () => {
    localStorage.setItem('expense_theme_mode', 'night');
    expect(getInitialTheme()).toBe('night');
  });
});
