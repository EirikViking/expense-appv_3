import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useTranslation } from 'react-i18next';

function normalizeTokenFromQuery(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => normalizeTokenFromQuery(searchParams.get('token') || ''), [searchParams]);
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!token) {
      setError(t('resetPassword.missingToken'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('resetPassword.passwordMismatch'));
      return;
    }

    setIsSubmitting(true);
    try {
      await api.resetPassword(token, password);
      setSuccess(t('resetPassword.success'));
      setTimeout(() => navigate('/login', { replace: true }), 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('resetPassword.failed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="glass max-w-md w-full space-y-8 p-8 rounded-2xl border border-white/15 bg-white/5 shadow-[0_30px_80px_rgba(0,0,0,.55)]">
        <div>
          <h2 className="text-center text-2xl font-bold text-white">{t('resetPassword.title')}</h2>
          <p className="mt-2 text-center text-sm text-white/70">{t('resetPassword.subtitle')}</p>
        </div>
        <form className="space-y-4" onSubmit={onSubmit}>
          {error && <div className="rounded-lg border border-red-300/30 bg-red-500/10 px-4 py-3 text-red-100">{error}</div>}
          {success && <div className="rounded-lg border border-emerald-300/30 bg-emerald-500/10 px-4 py-3 text-emerald-100">{success}</div>}
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-10 w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/45"
            placeholder={t('resetPassword.password')}
          />
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="h-10 w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/45"
            placeholder={t('resetPassword.confirmPassword')}
          />
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md border border-white/10 bg-gradient-to-r from-cyan-400 to-emerald-400 px-4 py-2 text-sm font-semibold text-[#051018] disabled:opacity-50"
          >
            {isSubmitting ? t('resetPassword.submitting') : t('resetPassword.submit')}
          </button>
          <div className="text-xs text-white/65 text-center">
            <Link to="/login" className="hover:underline">{t('resetPassword.backToLogin')}</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
