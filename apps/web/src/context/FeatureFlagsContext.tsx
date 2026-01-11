import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const SHOW_BUDGETS_KEY = 'show_budgets';

type FeatureFlagsContextValue = {
  showBudgets: boolean;
  setShowBudgets: (value: boolean) => void;
};

const FeatureFlagsContext = createContext<FeatureFlagsContextValue | null>(null);

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const [showBudgets, setShowBudgets] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem(SHOW_BUDGETS_KEY);
    return stored !== 'false';
  });

  useEffect(() => {
    localStorage.setItem(SHOW_BUDGETS_KEY, String(showBudgets));
  }, [showBudgets]);

  const value = useMemo(() => ({ showBudgets, setShowBudgets }), [showBudgets]);

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
