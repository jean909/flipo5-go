'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/app/components/LocaleContext';
import { useIncognito } from '@/app/components/IncognitoContext';
import { t } from '@/lib/i18n';
import { Sidebar } from './components/Sidebar';
import { JobsInProgressButton } from './components/JobsInProgressButton';
import { JobsInProgressProvider } from './components/JobsInProgressContext';
import { InstallPromptBanner } from './components/InstallPromptBanner';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function DashboardLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { locale } = useLocale();
  const { incognito, setIncognito } = useIncognito();
  const [ready, setReady] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const m = window.matchMedia('(max-width: 768px)');
    setIsMobile(m.matches);
    const onMatch = () => setIsMobile(m.matches);
    m.addEventListener('change', onMatch);
    return () => m.removeEventListener('change', onMatch);
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (!session) router.replace('/start');
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [router]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-theme-bg flex items-center justify-center" aria-busy="true" aria-label={t(locale, 'common.loading')}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-theme-border border-t-theme-fg-subtle animate-spin" />
          <p className="text-theme-fg-subtle text-sm">{t(locale, 'common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <JobsInProgressProvider>
    <div className="h-screen bg-theme-bg text-theme-fg flex overflow-hidden">
      {isMobile ? (
        <Sidebar overlay open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      ) : (
        <Sidebar />
      )}
      <main className="flex-1 flex flex-col min-w-0 min-h-0 relative">
        {!pathname.startsWith('/dashboard/studio') && !/^\/dashboard\/projects\/[^/]+/.test(pathname) && (
        <div className="fixed z-10 flex items-center gap-2 right-4 top-4 left-4 md:left-auto [top:max(1rem,env(safe-area-inset-top))] [right:max(1rem,env(safe-area-inset-right))] [left:max(1rem,env(safe-area-inset-left))]">
          {isMobile && (
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-theme-bg-hover text-theme-fg border border-theme-border hover:bg-theme-bg-hover-strong touch-manipulation md:hidden"
              aria-label={t(locale, 'nav.menu')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setIncognito(!incognito);
              if (pathname === '/dashboard') router.replace('/dashboard?new=1');
            }}
            className={`relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full backdrop-blur-sm border transition-all group ${
              incognito
                ? 'bg-theme-accent-muted text-theme-accent border-theme-accent-border hover:bg-theme-accent-hover'
                : 'bg-theme-bg-hover text-theme-fg/80 border-theme-border hover:bg-theme-bg-hover-strong hover:text-theme-fg hover:border-theme-border-hover'
            }`}
            title={t(locale, 'nav.incognito')}
            aria-label={t(locale, 'nav.incognito')}
          >
            <IncognitoIcon active={incognito} className="h-5 w-5" />
            <span className="absolute right-full mr-2 px-2.5 py-1.5 rounded-lg bg-theme-bg-elevated border border-theme-border text-xs font-medium text-theme-fg opacity-0 pointer-events-none whitespace-nowrap transition-opacity group-hover:opacity-100">
              {t(locale, 'nav.incognito')}
            </span>
          </button>
          <Link
            href={pathname === '/dashboard' ? '/dashboard?new=1' : '/dashboard'}
            className="relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-theme-bg-hover text-theme-fg/80 backdrop-blur-sm border border-theme-border hover:bg-theme-bg-hover-strong hover:text-theme-fg hover:border-theme-border-hover transition-all group"
            title={t(locale, 'nav.new')}
            aria-label={t(locale, 'nav.new')}
          >
            <NewIcon className="h-5 w-5" />
            <span className="absolute right-full mr-2 px-2.5 py-1.5 rounded-lg bg-theme-bg-elevated border border-theme-border text-xs font-medium text-theme-fg opacity-0 pointer-events-none whitespace-nowrap transition-opacity group-hover:opacity-100">
              {t(locale, 'nav.new')}
            </span>
          </Link>
          <Link
            href="/dashboard/jobs"
            className={`relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full backdrop-blur-sm border transition-all group ${
              pathname.startsWith('/dashboard/jobs')
                ? 'bg-theme-bg-hover-strong text-theme-fg border-theme-border-strong hover:bg-theme-bg-hover'
                : 'bg-theme-bg-hover text-theme-fg/80 border-theme-border hover:bg-theme-bg-hover-strong hover:text-theme-fg hover:border-theme-border-hover'
            }`}
            title={t(locale, 'nav.history')}
            aria-label={t(locale, 'nav.history')}
          >
            <HistoryIcon className="h-5 w-5" />
            <span className="absolute right-full mr-2 px-2.5 py-1.5 rounded-lg bg-theme-bg-elevated border border-theme-border text-xs font-medium text-theme-fg opacity-0 pointer-events-none whitespace-nowrap transition-opacity group-hover:opacity-100">
              {t(locale, 'nav.history')}
            </span>
          </Link>
          <JobsInProgressButton />
        </div>
        )}
        <div
          className={
            pathname.startsWith('/dashboard/studio') || /^\/dashboard\/projects\/[^/]+/.test(pathname)
              ? 'flex-1 flex flex-col min-h-0 min-w-0'
              : 'pt-[max(3.5rem,calc(2rem+env(safe-area-inset-top)))] pr-4 sm:pr-24 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:pb-0 flex-1 flex flex-col min-h-0 min-w-0'
          }
        >
          {!pathname.startsWith('/dashboard/studio') && pathname === '/dashboard' && (
            <div className="shrink-0 px-4 sm:px-6 pt-4 pb-2">
              <Link
                href="/dashboard?inspire=1"
                className="btn-tap inline-flex items-center gap-2 text-sm text-theme-fg-muted hover:text-theme-fg transition-colors py-1.5 px-3 rounded-lg bg-theme-bg-subtle border border-theme-border hover:bg-theme-bg-hover hover:border-theme-border-hover"
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
                {t(locale, 'dashboard.ourCreations')}
                <span className="text-theme-fg-subtle" aria-hidden>→</span>
              </Link>
            </div>
          )}
          <ErrorBoundary>{children}</ErrorBoundary>
        </div>
        <InstallPromptBanner />
      </main>
    </div>
    </JobsInProgressProvider>
  );
}

function NewIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function HistoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12a9 9 0 109-9v4m0 0L9 4m3 3l3-3M12 7v5l3 2" />
    </svg>
  );
}

function IncognitoIcon({ active, className }: { active?: boolean; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4c-4.4 0-8 3.6-8 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8z" />
      <ellipse cx="9" cy="12" rx="1.5" ry="2" />
      <ellipse cx="15" cy="12" rx="1.5" ry="2" />
      {active && <path d="M2 2l20 20" strokeWidth={2.5} />}
    </svg>
  );
}
