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

  return (
    <div className="min-h-screen bg-theme-bg text-theme-fg flex">
      <aside className="w-56 shrink-0 border-r border-theme-border bg-theme-bg-elevated flex flex-col">
        <div className="p-4 border-b border-theme-border">
          <Link href="/admin" className="font-semibold text-theme-fg">Admin</Link>
        </div>
        <nav className="p-2 flex flex-col gap-0.5">
          {nav.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                pathname === href ? 'bg-theme-bg-hover text-theme-fg' : 'text-theme-fg-muted hover:bg-theme-bg-hover hover:text-theme-fg'
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto p-2 border-t border-theme-border">
          <Link href="/dashboard" className="block px-3 py-2 rounded-lg text-sm text-theme-fg-muted hover:bg-theme-bg-hover hover:text-theme-fg">
            Back to App
          </Link>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-auto p-6 scrollbar-subtle">
        {children}
      </main>
    </div>
  );
}
