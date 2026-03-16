'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';

export default function SetPasswordPage() {
  const router = useRouter();
  const { locale } = useLocale();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/start');
    });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setError(t(locale, 'start.passwordPlaceholder'));
      return;
    }
    if (password !== confirm) {
      setError(t(locale, 'error.passwordMismatch'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      setDone(true);
      setTimeout(() => router.replace('/dashboard'), 1500);
    } catch {
      setError(t(locale, 'error.generic'));
    } finally {
      setLoading(false);
    }
  }

  const inputCls = 'w-full px-4 py-3 min-h-[48px] rounded-xl bg-theme-bg-elevated border border-theme-border-subtle text-theme-fg placeholder:text-theme-fg-subtle focus:outline-none focus:ring-2 focus:ring-theme-border focus:border-theme-border transition-all';
  const labelCls = 'block text-xs font-medium text-theme-fg-subtle uppercase tracking-wider mb-2';

  return (
    <div className="min-h-screen bg-theme-bg text-theme-fg flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-theme-border-subtle bg-theme-bg-subtle p-6 sm:p-8">
        <h1 className="font-display text-xl font-bold text-theme-fg mb-1">{t(locale, 'auth.setNewPassword')}</h1>
        <p className="text-sm text-theme-fg-muted mb-6">{t(locale, 'auth.setNewPasswordDesc')}</p>
        {done ? (
          <p className="text-theme-fg-muted">{t(locale, 'auth.passwordUpdated')}</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className={labelCls}>{t(locale, 'start.password')}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t(locale, 'start.passwordPlaceholder')}
                className={inputCls}
                required
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className={labelCls}>{t(locale, 'start.confirmPassword')}</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={t(locale, 'start.passwordPlaceholder')}
                className={inputCls}
                required
                autoComplete="new-password"
              />
            </div>
            {error && <p className="text-sm text-theme-danger">{error}</p>}
            <button type="submit" disabled={loading} className="w-full min-h-[48px] py-3.5 px-4 rounded-xl bg-white text-black font-semibold hover:bg-neutral-200 disabled:opacity-50 transition-colors">
              {loading ? t(locale, 'common.loading') : t(locale, 'auth.setNewPassword')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
