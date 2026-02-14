import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import type { AppUser } from '@expense/shared';
import { api, ApiError } from '../lib/api';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  bootstrapRequired: boolean;
  user: AppUser | null;
  actorUser: AppUser | null;
  isImpersonating: boolean;
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
  const [actorUser, setActorUser] = useState<AppUser | null>(null);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const authRequestSeq = useRef(0);

  const startAuthRequest = useCallback(() => {
    authRequestSeq.current += 1;
    return authRequestSeq.current;
  }, []);

  const isLatestRequest = useCallback((requestId: number) => authRequestSeq.current === requestId, []);

  const checkAuth = useCallback(async () => {
    const requestId = startAuthRequest();
    try {
      const me = await api.authMe();
      if (!isLatestRequest(requestId)) return;

      if (me.bootstrap_required) {
        setBootstrapRequired(true);
        setIsAuthenticated(false);
        setUser(null);
        setActorUser(null);
        setIsImpersonating(false);
        setNeedsOnboarding(false);
        return;
      }

      if (me.authenticated && me.user) {
        const effectiveUser = me.effective_user || me.user;
        const actualActor = me.actor_user || me.user;
        setBootstrapRequired(false);
        setIsAuthenticated(true);
        setUser(effectiveUser);
        setActorUser(actualActor);
        setIsImpersonating(Boolean(me.impersonating));
        setNeedsOnboarding(Boolean(me.needs_onboarding));
        return;
      }

      setIsAuthenticated(false);
      setUser(null);
      setActorUser(null);
      setIsImpersonating(false);
      setNeedsOnboarding(false);
    } catch (err) {
      if (!isLatestRequest(requestId)) return;
      if (err instanceof ApiError && err.status === 401) {
        setIsAuthenticated(false);
        setBootstrapRequired(false);
        setUser(null);
        setActorUser(null);
        setIsImpersonating(false);
        setNeedsOnboarding(false);
      } else {
        throw err;
      }
    } finally {
      if (isLatestRequest(requestId)) {
        setIsLoading(false);
      }
    }
  }, [isLatestRequest, startAuthRequest]);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  const login = useCallback(async (email: string, password: string, rememberMe: boolean) => {
    const requestId = startAuthRequest();
    setIsLoading(true);
    try {
      await api.login(email, password, rememberMe);
      const me = await api.authMe();
      if (!isLatestRequest(requestId)) return;

      if (me.bootstrap_required) {
        setBootstrapRequired(true);
        setIsAuthenticated(false);
        setUser(null);
        setActorUser(null);
        setIsImpersonating(false);
        setNeedsOnboarding(false);
        throw new ApiError('Bootstrap required', 400, me);
      }

      if (!me.authenticated || !me.user) {
        setBootstrapRequired(false);
        setIsAuthenticated(false);
        setUser(null);
        setActorUser(null);
        setIsImpersonating(false);
        setNeedsOnboarding(false);
        throw new ApiError('Login session was not established. Please try again.', 401, me);
      }

      const effectiveUser = me.effective_user || me.user;
      const actualActor = me.actor_user || me.user;
      setBootstrapRequired(false);
      setIsAuthenticated(true);
      setUser(effectiveUser);
      setActorUser(actualActor);
      setIsImpersonating(Boolean(me.impersonating));
      setNeedsOnboarding(Boolean(me.needs_onboarding));
    } finally {
      if (isLatestRequest(requestId)) {
        setIsLoading(false);
      }
    }
  }, [isLatestRequest, startAuthRequest]);

  const logout = useCallback(async () => {
    startAuthRequest();
    try {
      await api.logout();
    } finally {
      setIsAuthenticated(false);
      setUser(null);
      setActorUser(null);
      setIsImpersonating(false);
      setNeedsOnboarding(false);
      setBootstrapRequired(false);
      setIsLoading(false);
    }
  }, [startAuthRequest]);

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
        actorUser,
        isImpersonating,
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
