import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';

type FeatureFlagsContextValue = {
  showBudgets: boolean;
  setShowBudgets: (value: boolean) => void;
};

const FeatureFlagsContext = createContext<FeatureFlagsContextValue | null>(null);
const SHOW_BUDGETS_STORAGE_PREFIX = 'expense.flags.showBudgets';
const DEFAULT_SHOW_BUDGETS = true;

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user, actorUser } = useAuth();
  const [showBudgets, setShowBudgetsState] = useState(DEFAULT_SHOW_BUDGETS);

  const ownerId = actorUser?.id || user?.id || 'anon';
  const storageKey = `${SHOW_BUDGETS_STORAGE_PREFIX}:${ownerId}`;

  useEffect(() => {
    if (!isAuthenticated || typeof window === 'undefined') {
      setShowBudgetsState(DEFAULT_SHOW_BUDGETS);
      return;
    }

    try {
      const raw = window.localStorage.getItem(storageKey);
      setShowBudgetsState(raw == null ? DEFAULT_SHOW_BUDGETS : raw === '1');
    } catch {
      setShowBudgetsState(DEFAULT_SHOW_BUDGETS);
    }
  }, [isAuthenticated, storageKey]);

  const setShowBudgets = useCallback(
    (value: boolean) => {
      setShowBudgetsState(value);
      if (!isAuthenticated || typeof window === 'undefined') return;
      try {
        window.localStorage.setItem(storageKey, value ? '1' : '0');
      } catch {
        // Ignore storage failures and keep in-memory state.
      }
    },
    [isAuthenticated, storageKey],
  );

  const value = useMemo(
    () => ({
      showBudgets,
      setShowBudgets,
    }),
    [showBudgets, setShowBudgets],
  );

  return (
    <FeatureFlagsContext.Provider value={value}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags() {
  const context = useContext(FeatureFlagsContext);
  if (!context) {
    throw new Error('useFeatureFlags must be used within a FeatureFlagsProvider');
  }
  return context;
}
