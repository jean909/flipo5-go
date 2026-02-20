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
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { locale } = useLocale();
  const { incognito, setIncognito } = useIncognito();
  const [ready, setReady] = useState(false);

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
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 min-h-0 relative">
        {!pathname.startsWith('/dashboard/studio') && (
        <div className="fixed z-10 flex items-center gap-2 right-4 top-4 [top:max(1rem,env(safe-area-inset-top))] [right:max(1rem,env(safe-area-inset-right))]">
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
          <JobsInProgressButton />
        </div>
        )}
        <div className={!pathname.startsWith('/dashboard/studio') ? 'pt-[max(3.5rem,calc(2rem+env(safe-area-inset-top)))] pr-[max(5rem,calc(4rem+env(safe-area-inset-right)))] sm:pr-24 flex-1 flex flex-col min-h-0 min-w-0' : 'flex-1 flex flex-col min-h-0 min-w-0'}>
          <ErrorBoundary>{children}</ErrorBoundary>
        </div>
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
