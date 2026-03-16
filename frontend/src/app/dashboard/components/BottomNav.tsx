'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';

const NAV_ITEMS: Array<
  | { href: string; labelKey: string; icon: (p: { className?: string }) => JSX.Element }
  | { href: string; labelKey: string; icon: (p: { className?: string }) => JSX.Element; isButton: true }
> = [
  { href: '/dashboard', labelKey: 'nav.dashboard', icon: DashboardIcon },
  { href: '/dashboard/content', labelKey: 'nav.content', icon: ContentIcon },
  { href: '/dashboard/studio', labelKey: 'nav.studio', icon: StudioIcon },
  { href: '#menu', labelKey: 'nav.menu', icon: MenuIcon, isButton: true },
];

type Props = { onOpenMenu: () => void };

export function BottomNav({ onOpenMenu }: Props) {
  const pathname = usePathname();
  const { locale } = useLocale();

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-theme-bg/95 backdrop-blur-md border-t border-theme-border"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      aria-label="Main navigation"
    >
      <div className="flex items-center justify-around h-14">
        {NAV_ITEMS.map((item) => {
          if ('isButton' in item && item.isButton) {
            return (
              <button
                key="menu"
                type="button"
                onClick={onOpenMenu}
                className="flex flex-col items-center justify-center gap-0.5 min-w-[64px] min-h-[44px] text-theme-fg-muted hover:text-theme-fg active:scale-95 transition-colors touch-manipulation"
                aria-label={t(locale, item.labelKey)}
              >
                <item.icon className="w-6 h-6 shrink-0" />
                <span className="text-[10px] font-medium">{t(locale, item.labelKey)}</span>
              </button>
            );
          }
          const isActive =
            item.href === '/dashboard/studio'
              ? pathname.startsWith('/dashboard/studio')
              : item.href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-0.5 min-w-[64px] min-h-[44px] touch-manipulation transition-colors active:scale-95 ${
                isActive ? 'text-theme-fg' : 'text-theme-fg-muted hover:text-theme-fg'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <item.icon className="w-6 h-6 shrink-0" />
              <span className="text-[10px] font-medium">{t(locale, item.labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  );
}

function ContentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function StudioIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 3 3 0 005.78-1.128zm2.44-2.44a3 3 0 00-5.78 1.128 3 3 0 005.78-1.128zm-9.106 4.094a3 3 0 105.78-1.128 3 3 0 00-5.78 1.128zm9.106-9.106a3 3 0 105.78-1.128 3 3 0 00-5.78 1.128z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  );
}
