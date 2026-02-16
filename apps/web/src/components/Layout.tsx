import { Link, useLocation, useNavigate } from 'react-router-dom';
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
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { getVersionString, getApiBaseUrl } from '@/lib/version';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Atmosphere } from '@/components/Atmosphere';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { OnboardingWizard } from '@/components/OnboardingWizard';
import { prefetchAppRoutes } from '@/lib/route-prefetch';

interface LayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { path: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { path: '/transactions', labelKey: 'nav.transactions', icon: List },
  { path: '/upload', labelKey: 'nav.upload', icon: Upload },
  { path: '/categories', labelKey: 'nav.categories', icon: FolderTree },
  { path: '/rules', labelKey: 'nav.rules', icon: Workflow },
  { path: '/budgets', labelKey: 'nav.budgets', icon: PiggyBank },
  { path: '/insights', labelKey: 'nav.insights', icon: BarChart3 },
  { path: '/settings', labelKey: 'nav.settings', icon: Settings },
];

export function Layout({ children }: LayoutProps) {
  const { isAuthenticated, logout, needsOnboarding, completeOnboarding, user, actorUser, isImpersonating, checkAuth } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const { t } = useTranslation();
  const userName = (user?.name || '').trim();
  const appTitle = useMemo(
    () => (userName ? `${userName}'s ${t('appNameOwnedSuffix')}` : t('appName')),
    [userName, t]
  );

  useEffect(() => {
    if (!needsOnboarding) {
      setOnboardingDismissed(false);
    }
  }, [needsOnboarding]);

  useEffect(() => {
    if (!isAuthenticated) return;
    prefetchAppRoutes();
  }, [isAuthenticated]);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Atmosphere />
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
          'fixed inset-y-0 left-0 z-50 w-64 transform glass border-r border-white/10 transition-transform duration-200 ease-in-out lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center justify-between px-4 border-b border-white/10">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 via-fuchsia-400 to-amber-300 text-black font-extrabold shadow-lg shadow-fuchsia-500/20">
              E
            </div>
            <span className="text-lg font-semibold text-white text-display">
              {appTitle}
            </span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 rounded-md hover:bg-white/10"
            aria-label="Close navigation menu"
          >
            <X className="h-5 w-5 text-white/70" />
          </button>
        </div>

        {isAuthenticated && (
          <nav className="flex flex-col h-[calc(100vh-4rem)]">
            <div className="flex-1 px-3 py-4 space-y-1">
              {navItems.map((item) => {
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
                        ? 'bg-white/10 text-white'
                        : 'text-white/75 hover:bg-white/10 hover:text-white'
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {t(item.labelKey)}
                  </Link>
                );
              })}
            </div>

            <div className="px-3 py-4 border-t border-white/10">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium text-white/60">{t('lang.language')}</span>
                <LanguageSwitcher compact />
              </div>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium text-white/60">{t('theme.label')}</span>
                <ThemeSwitcher compact />
              </div>
              <button
                onClick={() => logout()}
                className="flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-white/75 hover:bg-white/10 hover:text-white transition-colors"
              >
                <LogOut className="h-5 w-5" />
                {t('common.logout')}
              </button>
            </div>
          </nav>
        )}
      </aside>

      {/* Main content */}
      <div className="lg:pl-64 flex-1 flex flex-col">
        {/* Mobile header */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-white/10 glass px-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-md hover:bg-white/10"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5 text-white/80" />
          </button>
          <span className="text-lg font-semibold text-white text-display">
            {appTitle}
          </span>
          <div className="ml-auto">
            <div className="flex items-center gap-2">
              <ThemeSwitcher compact />
              <LanguageSwitcher compact />
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6">
          <div className="max-w-7xl mx-auto">
            {isImpersonating && actorUser && (
              <div className="mb-4 rounded-md border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                <span>
                  {t('settingsUsers.impersonatingAs')}: <strong>{userName || user?.email}</strong>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-3"
                  onClick={async () => {
                    await api.adminClearImpersonation();
                    await checkAuth();
                    navigate('/settings');
                  }}
                >
                  {t('settingsUsers.stopImpersonation')}
                </Button>
              </div>
            )}
            {children}
          </div>
        </main>

        {/* Version Footer */}
        <footer className="border-t border-white/10 glass py-3 px-4 text-center">
          <div className="text-xs text-white/60 space-y-1">
            <p>{getVersionString()}</p>
            <p className="truncate" title={getApiBaseUrl()}>
              API: <code className="bg-white/10 px-1 py-0.5 rounded">{getApiBaseUrl() || '(proxy)'}</code>
            </p>
          </div>
        </footer>
      </div>

      <OnboardingWizard
        open={isAuthenticated && needsOnboarding && !onboardingDismissed}
        name={userName}
        onDismiss={() => setOnboardingDismissed(true)}
        onComplete={completeOnboarding}
        onGoToUpload={() => navigate('/upload')}
      />
    </div>
  );
}
