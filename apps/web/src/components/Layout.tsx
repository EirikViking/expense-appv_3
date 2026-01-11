import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Upload,
  List,
  FolderTree,
  Workflow,
  PiggyBank,
  BarChart3,
  LogOut,
  Menu,
  X,
  Settings,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { getVersionString, getApiBaseUrl } from '@/lib/version';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';

interface LayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/transactions', label: 'Transactions', icon: List },
  { path: '/upload', label: 'Upload', icon: Upload },
  { path: '/categories', label: 'Categories', icon: FolderTree },
  { path: '/rules', label: 'Rules', icon: Workflow },
  { path: '/budgets', label: 'Budgets', icon: PiggyBank },
  { path: '/insights', label: 'Insights', icon: BarChart3 },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export function Layout({ children }: LayoutProps) {
  const { isAuthenticated, logout } = useAuth();
  const { showBudgets } = useFeatureFlags();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 transform bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-transform duration-200 ease-in-out lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center justify-between px-4 border-b border-gray-200 dark:border-gray-700">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white font-bold">
              E
            </div>
            <span className="text-lg font-semibold text-gray-900 dark:text-white">
              Expense Analytics
            </span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {isAuthenticated && (
          <nav className="flex flex-col h-[calc(100vh-4rem)]">
            <div className="flex-1 px-3 py-4 space-y-1">
              {navItems.filter(item => item.path !== '/budgets' || showBudgets).map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      active
                        ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400'
                        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                );
              })}
            </div>

            <div className="px-3 py-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => logout()}
                className="flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
              >
                <LogOut className="h-5 w-5" />
                Logout
              </button>
            </div>
          </nav>
        )}
      </aside>

      {/* Main content */}
      <div className="lg:pl-64 flex-1 flex flex-col">
        {/* Mobile header */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <Menu className="h-5 w-5 text-gray-500" />
          </button>
          <span className="text-lg font-semibold text-gray-900 dark:text-white">
            Expense Analytics
          </span>
        </header>

        <main className="flex-1 p-4 lg:p-6">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>

        {/* Version Footer */}
        <footer className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-3 px-4 text-center">
          <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
            <p>{getVersionString()}</p>
            <p className="truncate" title={getApiBaseUrl()}>
              API: <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded">{getApiBaseUrl() || '(proxy)'}</code>
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
