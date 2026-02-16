import { createContext, useContext, useMemo, type ReactNode } from 'react';

type FeatureFlagsContextValue = {
  showBudgets: boolean;
  setShowBudgets: (value: boolean) => void;
};

const FeatureFlagsContext = createContext<FeatureFlagsContextValue | null>(null);

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const value = useMemo(
    () => ({
      showBudgets: true,
      setShowBudgets: (_value: boolean) => {
        // Budgets route is always visible; enable/disable is handled in Budgets settings.
      },
    }),
    [],
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
