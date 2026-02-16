let prefetched = false;

function shouldSkipPrefetch(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  };
  const connection = nav.connection;
  if (!connection) return false;
  if (connection.saveData) return true;
  return connection.effectiveType === '2g' || connection.effectiveType === 'slow-2g';
}

export function prefetchAppRoutes() {
  if (prefetched) return;
  if (shouldSkipPrefetch()) return;
  prefetched = true;

  const run = () => {
    void import('@/pages/Dashboard');
    void import('@/pages/Transactions');
    void import('@/pages/Upload');
    void import('@/pages/Categories');
    void import('@/pages/Rules');
    void import('@/pages/Budgets');
    void import('@/pages/Insights');
    void import('@/pages/Settings');
  };

  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    (window as Window & { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback(run);
    return;
  }

  setTimeout(run, 600);
}

