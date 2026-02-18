let prefetched = false;
let secondaryPrefetched = false;

type PrefetchConnection = { saveData?: boolean; effectiveType?: string };

const criticalRoutePrefetchers: Array<() => Promise<unknown>> = [
  () => import('@/pages/Dashboard'),
  () => import('@/pages/Transactions'),
  () => import('@/pages/Upload'),
  () => import('@/pages/Insights'),
];

const secondaryRoutePrefetchers: Array<() => Promise<unknown>> = [
  () => import('@/pages/Categories'),
  () => import('@/pages/Rules'),
  () => import('@/pages/Budgets'),
  () => import('@/pages/Settings'),
];

const prefetchByPath: Record<string, () => Promise<unknown>> = {
  '/': () => import('@/pages/Dashboard'),
  '/transactions': () => import('@/pages/Transactions'),
  '/upload': () => import('@/pages/Upload'),
  '/categories': () => import('@/pages/Categories'),
  '/rules': () => import('@/pages/Rules'),
  '/budgets': () => import('@/pages/Budgets'),
  '/insights': () => import('@/pages/Insights'),
  '/settings': () => import('@/pages/Settings'),
};

function getConnection(): PrefetchConnection | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const nav = navigator as Navigator & { connection?: PrefetchConnection };
  return nav.connection;
}

function isConstrainedNetwork(connection: PrefetchConnection | undefined): boolean {
  if (!connection) return false;
  if (connection.saveData) return true;
  const t = String(connection.effectiveType || '').toLowerCase();
  return t === 'slow-2g' || t === '2g' || t === '3g';
}

function isConstrainedDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = navigator.hardwareConcurrency || 0;
  const memory = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : 0;
  return (cores > 0 && cores <= 4) || (memory > 0 && memory <= 4);
}

function runWhenIdle(task: () => void, fallbackDelayMs: number): void {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number })
      .requestIdleCallback(task, { timeout: 1400 });
    return;
  }
  setTimeout(task, fallbackDelayMs);
}

function prefetchMany(prefetchers: Array<() => Promise<unknown>>): void {
  for (const load of prefetchers) void load();
}

export function prefetchRouteForPath(path: string): void {
  const key = path === '' ? '/' : path;
  const load = prefetchByPath[key];
  if (!load) return;
  void load();
}

export function prefetchAppRoutes() {
  if (prefetched) return;
  const connection = getConnection();
  if (isConstrainedNetwork(connection)) return;

  prefetched = true;
  runWhenIdle(() => prefetchMany(criticalRoutePrefetchers), 800);

  if (secondaryPrefetched) return;
  if (isConstrainedDevice()) return;

  secondaryPrefetched = true;
  setTimeout(() => runWhenIdle(() => prefetchMany(secondaryRoutePrefetchers), 500), 3000);
}

