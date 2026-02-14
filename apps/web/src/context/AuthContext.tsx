import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { AppUser } from '@expense/shared';
import { api, ApiError } from '../lib/api';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  bootstrapRequired: boolean;
  user: AppUser | null;
  needsOnboarding: boolean;
  login: (email: string, password: string, rememberMe: boolean) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [bootstrapRequired, setBootstrapRequired] = useState(false);
  const [user, setUser] = useState<AppUser | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  const checkAuth = useCallback(async () => {
    try {
      const me = await api.authMe();
      if (me.bootstrap_required) {
        setBootstrapRequired(true);
        setIsAuthenticated(false);
        setUser(null);
        setNeedsOnboarding(false);
        return;
      }

      if (me.authenticated && me.user) {
        setBootstrapRequired(false);
        setIsAuthenticated(true);
        setUser(me.user);
        setNeedsOnboarding(Boolean(me.needs_onboarding));
        return;
      }

      setIsAuthenticated(false);
      setUser(null);
      setNeedsOnboarding(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setIsAuthenticated(false);
        setBootstrapRequired(false);
        setUser(null);
        setNeedsOnboarding(false);
      } else {
        throw err;
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  const login = useCallback(async (email: string, password: string, rememberMe: boolean) => {
    await api.login(email, password, rememberMe);
    await checkAuth();
  }, [checkAuth]);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setIsAuthenticated(false);
      setUser(null);
      setNeedsOnboarding(false);
      setBootstrapRequired(false);
    }
  }, []);

  const completeOnboarding = useCallback(async () => {
    await api.onboardingComplete();
    setNeedsOnboarding(false);
    setUser((prev) => (prev ? { ...prev, onboarding_done_at: new Date().toISOString() } : prev));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        bootstrapRequired,
        user,
        needsOnboarding,
        login,
        logout,
        checkAuth,
        completeOnboarding,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
