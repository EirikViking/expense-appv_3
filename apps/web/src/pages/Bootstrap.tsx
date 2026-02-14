import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from 'react-i18next';

export function BootstrapPage() {
  const { t } = useTranslation();
  const { bootstrapRequired, isAuthenticated, checkAuth } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isAuthenticated) return <Navigate to="/" replace />;
  if (!bootstrapRequired) return <Navigate to="/login" replace />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError(t('bootstrap.passwordMismatch'));
      return;
    }

    setIsSubmitting(true);
    try {
      await api.bootstrap({ email, name, password });
      await checkAuth();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('bootstrap.failed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="glass max-w-md w-full space-y-8 p-8 rounded-2xl border border-white/15 bg-white/5 shadow-[0_30px_80px_rgba(0,0,0,.55)]">
        <div>
          <h2 className="text-center text-2xl font-bold text-white">{t('bootstrap.title')}</h2>
          <p className="mt-2 text-center text-sm text-white/70">{t('bootstrap.subtitle')}</p>
        </div>
        <form className="space-y-4" onSubmit={onSubmit}>
          {error && <div className="rounded-lg border border-red-300/30 bg-red-500/10 px-4 py-3 text-red-100">{error}</div>}
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-10 w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/45"
            placeholder={t('bootstrap.email')}
          />
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-10 w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/45"
            placeholder={t('bootstrap.name')}
          />
          <input
            type="password"
            required
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-10 w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/45"
            placeholder={t('bootstrap.password')}
          />
          <input
            type="password"
            required
            autoComplete="new-password"
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="h-10 w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/45"
            placeholder={t('bootstrap.confirmPassword')}
          />
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md border border-white/10 bg-gradient-to-r from-cyan-400 to-emerald-400 px-4 py-2 text-sm font-semibold text-[#051018] disabled:opacity-50"
          >
            {isSubmitting ? t('bootstrap.creating') : t('bootstrap.createAdmin')}
          </button>
        </form>
      </div>
    </div>
  );
}
