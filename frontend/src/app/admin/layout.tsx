'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { getMe, isAdminUser } from '@/lib/api';

const nav = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/jobs', label: 'Jobs' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((user) => {
        if (cancelled) return;
        if (!user) {
          router.replace('/start');
          return;
        }
        if (!isAdminUser(user)) {
          setForbidden(true);
        }
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) router.replace('/start');
      });
    return () => { cancelled = true; };
  }, [router]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-theme-bg flex items-center justify-center">
        <p className="text-theme-fg-subtle">Loading...</p>
      </div>
    );
  }
  if (forbidden) {
    return (
      <div className="min-h-screen bg-theme-bg flex flex-col items-center justify-center gap-4 p-4">
        <h1 className="text-xl font-semibold text-theme-fg">Access denied</h1>
        <p className="text-theme-fg-muted text-center">You need admin rights to view this section.</p>
        <Link href="/dashboard" className="text-theme-accent hover:underline">Back to Dashboard</Link>
      </div>
    );
  }

  useEffect(() => {
    if (!sidebarOpen) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  return (
    <div className="min-h-screen bg-theme-bg text-theme-fg flex">
      {/* Mobile menu button */}
      <button
        type="button"
        onClick={() => setSidebarOpen(true)}
        className="md:hidden fixed top-4 left-4 z-30 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-theme-border bg-theme-bg-elevated text-theme-fg hover:bg-theme-bg-hover"
        aria-label="Open menu"
      >
        <MenuIcon className="w-5 h-5" />
      </button>
      {/* Backdrop when sidebar open on mobile */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-theme-bg-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}
      <aside className={`w-56 shrink-0 border-r border-theme-border bg-theme-bg-elevated flex flex-col z-50 transition-transform md:relative fixed inset-y-0 left-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-4 border-b border-theme-border flex items-center justify-between">
          <Link href="/admin" className="font-semibold text-theme-fg" onClick={() => setSidebarOpen(false)}>Admin</Link>
          <button type="button" onClick={() => setSidebarOpen(false)} className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-theme-fg-muted hover:text-theme-fg" aria-label="Close menu">
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <nav className="p-2 flex flex-col gap-0.5">
          {nav.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setSidebarOpen(false)}
              className={`min-h-[44px] flex items-center px-3 py-2 rounded-lg text-sm transition-colors ${
                pathname === href ? 'bg-theme-bg-hover text-theme-fg' : 'text-theme-fg-muted hover:bg-theme-bg-hover hover:text-theme-fg'
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto p-2 border-t border-theme-border">
          <Link href="/dashboard" onClick={() => setSidebarOpen(false)} className="flex items-center min-h-[44px] px-3 py-2 rounded-lg text-sm text-theme-fg-muted hover:bg-theme-bg-hover hover:text-theme-fg">
            Back to App
          </Link>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-auto p-6 pt-16 md:pt-6 scrollbar-subtle">
        {children}
      </main>
    </div>
  );
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}
function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
