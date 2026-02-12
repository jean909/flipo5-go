'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { checkEmail, signInWithPassword, signUpWithPassword, updateProfile, syncMe } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { Header } from '@/app/components/Header';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';

type Step = 'email' | 'password' | 'dialog' | 'signup' | 'confirm_email' | 'onboarding' | 'plan';

const PLANS = [
  { id: 'free', nameKey: 'start.plan.free', price: 0, credits: 100 },
  { id: 'premium', nameKey: 'start.plan.premium', price: 9.99, credits: 0 },
  { id: 'creator', nameKey: 'start.plan.creator', price: 24.99, credits: 0 },
] as const;

export default function StartPage() {
  const router = useRouter();
  const { locale } = useLocale();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [whereHeard, setWhereHeard] = useState('');
  const [useCase, setUseCase] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<string>('free');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setError('');
    setLoading(true);
    try {
      const { exists } = await checkEmail(trimmed);
      setEmail(trimmed);
      if (exists) setStep('password');
      else setStep('dialog');
    } catch {
      setError(t(locale, 'error.generic'));
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setError('');
    setLoading(true);
    try {
      const { error: err } = await signInWithPassword(email, password);
      if (err) {
        setError(err);
        setLoading(false);
        return;
      }
      await syncMe();
      router.replace('/dashboard');
    } catch {
      setError(t(locale, 'error.generic'));
      setLoading(false);
    }
  }

  function handleCreateAccountClick() {
    setStep('signup');
    setPassword('');
    setConfirmPassword('');
    setError('');
  }

  async function handleSignUpSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setError(t(locale, 'start.passwordPlaceholder'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t(locale, 'error.passwordMismatch'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { error: err } = await signUpWithPassword(email, password);
      if (err) {
        setError(err);
        setLoading(false);
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await syncMe();
        setStep('onboarding');
      } else {
        setStep('confirm_email');
      }
    } catch {
      setError(t(locale, 'error.generic'));
    } finally {
      setLoading(false);
    }
  }

  function handleOnboardingSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStep('plan');
  }

  async function handlePlanSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await updateProfile({
        full_name: fullName || undefined,
        where_heard: whereHeard || undefined,
        use_case: useCase || undefined,
        plan: selectedPlan,
      });
      router.replace('/dashboard');
    } catch {
      setError(t(locale, 'error.generic'));
      setLoading(false);
    }
  }

  const cardCls = 'relative z-10 w-full max-w-md rounded-2xl border border-theme-border-subtle bg-theme-bg-subtle p-8 shadow-2xl backdrop-blur-md';
  const inputCls = 'w-full px-4 py-3 rounded-xl bg-theme-bg-elevated border border-theme-border-subtle text-theme-fg placeholder:text-theme-fg-subtle focus:outline-none focus:ring-2 focus:ring-theme-border focus:border-theme-border transition-all';
  const labelCls = 'block text-xs font-medium text-theme-fg-subtle uppercase tracking-wider mb-2';
  const btnPrimary = 'w-full py-3.5 px-4 rounded-xl bg-white text-black font-semibold hover:bg-neutral-200 disabled:opacity-50 transition-colors';
  const btnSecondary = 'w-full py-2.5 px-4 rounded-xl border border-theme-border text-theme-fg font-medium hover:bg-theme-bg-hover transition-colors';

  return (
    <div className="min-h-screen bg-theme-bg text-theme-fg flex flex-col">
      <Header dark />
      <main className="flex-1 relative flex flex-col items-center justify-center px-4 overflow-hidden min-h-[calc(100vh-4rem)] py-8">
        <SpaceBackground />

        <AnimatePresence mode="wait">
          {step === 'email' && (
            <motion.div
              key="email"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={cardCls}
            >
              <h1 className="font-display text-2xl font-bold text-white mb-2 tracking-tight">{t(locale, 'start.title')}</h1>
              <p className="text-theme-fg-muted text-sm mb-6">{t(locale, 'start.subtitle')}</p>
              <form onSubmit={handleEmailSubmit} className="space-y-5">
                <div>
                  <label className={labelCls}>{t(locale, 'login.email')}</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t(locale, 'login.placeholder')}
                    className={inputCls}
                    required
                  />
                </div>
                {error && <p className="text-sm text-red-400">{error}</p>}
                <motion.button type="submit" disabled={loading} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className={btnPrimary}>
                  {loading ? '...' : t(locale, 'login.submit')}
                </motion.button>
              </form>
              <p className="mt-6 text-center text-sm text-theme-fg-subtle">
                <Link href="/" className="text-theme-fg-muted hover:text-theme-fg transition-colors">← {t(locale, 'start.back')}</Link>
              </p>
            </motion.div>
          )}

          {step === 'password' && (
            <motion.div
              key="password"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={cardCls}
            >
              <p className="text-theme-fg-muted text-sm mb-1">{email}</p>
              <h1 className="font-display text-xl font-bold text-white mb-6 tracking-tight">{t(locale, 'start.enterPassword')}</h1>
              <form onSubmit={handlePasswordSubmit} className="space-y-5">
                <div>
                  <label className={labelCls}>{t(locale, 'start.password')}</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t(locale, 'start.passwordPlaceholder')}
                    className={inputCls}
                    required
                  />
                </div>
                {error && <p className="text-sm text-red-400">{error}</p>}
                <motion.button type="submit" disabled={loading} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className={btnPrimary}>
                  {loading ? '...' : t(locale, 'login.submit')}
                </motion.button>
              </form>
              <button type="button" onClick={() => { setStep('email'); setError(''); }} className="mt-4 w-full text-sm text-theme-fg-subtle hover:text-theme-fg">
                ← {t(locale, 'start.back')}
              </button>
            </motion.div>
          )}

          {step === 'confirm_email' && (
            <motion.div
              key="confirm_email"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className={cardCls}
            >
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-theme-border bg-theme-bg-subtle">
                  <EnvelopeIcon className="h-6 w-6 text-theme-fg opacity-90" />
                </div>
                <h2 className="font-display text-lg font-bold text-white mb-2">{t(locale, 'start.confirmEmailTitle')}</h2>
                <p className="text-sm text-theme-fg-muted mb-4">{t(locale, 'start.confirmEmailBody')}</p>
                <p className="text-xs font-medium uppercase tracking-wider text-theme-fg-subtle mb-6">{email}</p>
                <motion.button
                  type="button"
                  onClick={() => { setStep('email'); setError(''); }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full rounded-xl border border-theme-border bg-white py-3 px-4 text-sm font-semibold text-black hover:bg-neutral-100 transition-colors"
                >
                  {t(locale, 'start.another')}
                </motion.button>
              </div>
              <p className="mt-6 text-center text-sm text-theme-fg-subtle">
                <Link href="/" className="text-theme-fg-muted hover:text-theme-fg transition-colors">← {t(locale, 'start.back')}</Link>
              </p>
            </motion.div>
          )}

          {step === 'dialog' && (
            <motion.div
              key="dialog"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className={cardCls}
            >
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-theme-border bg-theme-bg-subtle">
                  <UserPlusIcon className="h-6 w-6 text-theme-fg opacity-90" />
                </div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wider text-theme-fg-subtle">{email}</p>
                <h2 className="font-display text-lg font-bold text-theme-fg mb-1">{t(locale, 'start.emailNotExists')}</h2>
                <p className="text-sm text-theme-fg-muted mb-6">{t(locale, 'start.createAccountQuestion')}</p>
                <div className="flex w-full gap-3">
                  <motion.button
                    type="button"
                    onClick={handleCreateAccountClick}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex-1 rounded-xl border border-theme-border bg-white py-3 px-4 text-sm font-semibold text-black hover:bg-neutral-100 transition-colors"
                  >
                    {t(locale, 'start.create')}
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={() => setStep('email')}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex-1 rounded-xl border border-theme-border bg-transparent py-3 px-4 text-sm font-semibold text-theme-fg hover:bg-theme-bg-hover transition-colors"
                  >
                    {t(locale, 'start.cancel')}
                  </motion.button>
                </div>
              </div>
              <p className="mt-6 text-center text-sm text-theme-fg-subtle">
                <button type="button" onClick={() => setStep('email')} className="text-theme-fg-muted hover:text-theme-fg transition-colors">
                  ← {t(locale, 'start.back')}
                </button>
              </p>
            </motion.div>
          )}

          {step === 'signup' && (
            <motion.div
              key="signup"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={cardCls}
            >
              <p className="text-theme-fg-muted text-sm mb-4">{email}</p>
              <h1 className="font-display text-xl font-bold text-white mb-6">{t(locale, 'start.createAccount')}</h1>
              <form onSubmit={handleSignUpSubmit} className="space-y-4">
                <div>
                  <label className={labelCls}>{t(locale, 'start.password')}</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t(locale, 'start.passwordPlaceholder')} className={inputCls} minLength={6} required />
                </div>
                <div>
                  <label className={labelCls}>{t(locale, 'start.confirmPassword')}</label>
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputCls} minLength={6} required />
                </div>
                {error && <p className="text-sm text-red-400">{error}</p>}
                <motion.button type="submit" disabled={loading} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className={btnPrimary}>
                  {loading ? '...' : t(locale, 'login.submit')}
                </motion.button>
              </form>
              <button type="button" onClick={() => setStep('dialog')} className="mt-4 w-full text-sm text-theme-fg-subtle hover:text-theme-fg">← {t(locale, 'start.back')}</button>
            </motion.div>
          )}

          {step === 'onboarding' && (
            <motion.div
              key="onboarding"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={cardCls}
            >
              <h1 className="font-display text-xl font-bold text-white mb-6">{t(locale, 'start.title')}</h1>
              <form onSubmit={handleOnboardingSubmit} className="space-y-4">
                <div>
                  <label className={labelCls}>{t(locale, 'start.fullName')}</label>
                  <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={t(locale, 'start.placeholderFullName')} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>{t(locale, 'start.whereHeard')}</label>
                  <input type="text" value={whereHeard} onChange={(e) => setWhereHeard(e.target.value)} placeholder={t(locale, 'start.placeholderWhereHeard')} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>{t(locale, 'start.useCase')}</label>
                  <input type="text" value={useCase} onChange={(e) => setUseCase(e.target.value)} placeholder={t(locale, 'start.placeholderUseCase')} className={inputCls} />
                </div>
                <motion.button type="submit" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className={btnPrimary}>
                  {t(locale, 'login.submit')}
                </motion.button>
              </form>
            </motion.div>
          )}

          {step === 'plan' && (
            <motion.div
              key="plan"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={cardCls}
            >
              <h1 className="font-display text-xl font-bold text-white mb-2">{t(locale, 'start.choosePlan')}</h1>
              <p className="text-theme-fg-muted text-sm mb-6">{t(locale, 'start.planChangeLater')}</p>
              <form onSubmit={handlePlanSubmit} className="space-y-3">
                {PLANS.map((plan) => (
                  <motion.button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlan(plan.id)}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    className={`w-full p-4 rounded-xl border text-left transition-all ${
                      selectedPlan === plan.id ? 'border-theme-border bg-theme-bg-hover' : 'border-theme-border-subtle hover:border-theme-border'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-theme-fg">{t(locale, plan.nameKey)}</span>
                      <span className="text-theme-fg">
                        {plan.price === 0 ? t(locale, 'start.plan.free') : `${t(locale, 'start.plan.eur')}${plan.price}`}
                      </span>
                    </div>
                    {plan.credits > 0 && <p className="text-theme-fg-subtle text-sm mt-1">{plan.credits} {t(locale, 'start.plan.perDay')}</p>}
                  </motion.button>
                ))}
                {error && <p className="text-sm text-red-400">{error}</p>}
                <motion.button type="submit" disabled={loading} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className={btnPrimary + ' mt-4'}>
                  {loading ? '...' : t(locale, 'home.cta')}
                </motion.button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function SpaceBackground() {
  return (
    <>
      <div className="absolute inset-0 bg-grid-dark pointer-events-none opacity-60" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-white/[0.02] rounded-full blur-3xl pointer-events-none" />
      <motion.div className="absolute top-[20%] left-[15%] w-3 h-3 rounded-full bg-white/20" animate={{ y: [0, -20, 0], opacity: [0.4, 0.8, 0.4] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.div className="absolute bottom-[25%] right-[15%] w-4 h-4 rounded-full bg-white/10" animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }} />
    </>
  );
}

function UserPlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6M22 11h-6" />
    </svg>
  );
}

function EnvelopeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <path d="m22 6-10 7L2 6" />
    </svg>
  );
}
