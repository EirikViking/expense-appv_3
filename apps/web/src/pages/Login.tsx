import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';

export function LoginPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSwitchingAccount, setIsSwitchingAccount] = useState(false);
  const { login, logout, user, isAuthenticated, bootstrapRequired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  if (bootstrapRequired) {
    return <Navigate to="/bootstrap" replace />;
  }

  if (isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass max-w-md w-full space-y-6 p-8 rounded-2xl border border-white/15 bg-white/5 shadow-[0_30px_80px_rgba(0,0,0,.55)]">
          <div>
            <h2 className="text-center text-2xl font-bold text-white">
              {t('login.alreadySignedInTitle')}
            </h2>
            <p className="mt-2 text-center text-sm text-white/70">
              {t('login.alreadySignedInAs', { name: user?.name || user?.email || '' })}
            </p>
          </div>
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => navigate(from, { replace: true })}
              className="w-full rounded-md border border-white/10 bg-gradient-to-r from-cyan-400 to-emerald-400 px-4 py-2 text-sm font-semibold text-[#051018] hover:brightness-110"
            >
              {t('login.continueAsCurrent')}
            </button>
            <button
              type="button"
              disabled={isSwitchingAccount}
              onClick={async () => {
                setIsSwitchingAccount(true);
                try {
                  await logout();
                } finally {
                  setIsSwitchingAccount(false);
                }
              }}
              className="w-full rounded-md border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
            >
              {isSwitchingAccount ? t('login.signingOut') : t('login.switchAccount')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await login(email, password, rememberMe);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.failed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="glass max-w-md w-full space-y-8 p-8 rounded-2xl border border-white/15 bg-white/5 shadow-[0_30px_80px_rgba(0,0,0,.55)]">
        <div>
          <h2 className="text-center text-3xl font-bold text-white">
            {t('login.title')}
          </h2>
          <p className="mt-2 text-center text-sm text-white/70">
            {t('login.subtitle')}
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-lg border border-red-300/30 bg-red-500/10 px-4 py-3 text-red-100">
              {error}
            </div>
          )}
          <div className="space-y-3">
            <div>
              <label htmlFor="email" className="sr-only">
                {t('login.email')}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none relative block h-10 w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/45 shadow-sm focus:outline-none focus:ring-2 focus:ring-cyan-300/60 focus:ring-offset-2 focus:ring-offset-transparent"
                placeholder={t('login.email')}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                {t('login.password')}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none relative block h-10 w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/45 shadow-sm focus:outline-none focus:ring-2 focus:ring-cyan-300/60 focus:ring-offset-2 focus:ring-offset-transparent"
                placeholder={t('login.password')}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-white/80">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-white/15"
              />
              {t('login.rememberMe')}
            </label>
          </div>
          <div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="group relative w-full flex justify-center rounded-md border border-white/10 bg-gradient-to-r from-cyan-400 to-emerald-400 px-4 py-2 text-sm font-semibold text-[#051018] shadow-[0_14px_30px_rgba(0,255,230,.18)] hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-cyan-300/60 focus:ring-offset-2 focus:ring-offset-transparent disabled:opacity-50"
            >
              {isSubmitting ? t('login.signingIn') : t('login.signIn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
