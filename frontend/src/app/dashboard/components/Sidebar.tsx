'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { getMe, isAdminUser, listThreads, patchThread, ThreadActionError, type User, type Thread } from '@/lib/api';
import { ArchivedDialog } from '@/components/ArchivedDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ThreadItem } from './ThreadItem';
import { motion, AnimatePresence } from 'framer-motion';

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { locale } = useLocale();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [sessionsExpanded, setSessionsExpanded] = useState(false);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [openMenuThreadId, setOpenMenuThreadId] = useState<string | null>(null);
  const [pendingDeleteThread, setPendingDeleteThread] = useState<Thread | null>(null);
  const [showArchivedDialog, setShowArchivedDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMe().then(setUser);
  }, []);

  useEffect(() => {
    if (pathname === '/dashboard/sessions') setSessionsExpanded(true);
  }, [pathname]);

  useEffect(() => {
    if (pathname.startsWith('/dashboard/studio')) setCollapsed(true);
  }, [pathname]);

  useEffect(() => {
    if (!sessionsExpanded || collapsed) return;
    let cancelled = false;
    setThreadsLoading(true);
    listThreads()
      .then((r) => {
        if (cancelled) return;
        setThreads(r.threads ?? []);
      })
      .catch(() => { if (!cancelled) setThreads([]); })
      .finally(() => { if (!cancelled) setThreadsLoading(false); });
    return () => { cancelled = true; };
  }, [sessionsExpanded, collapsed]);

  async function logout() {
    await supabase.auth.signOut();
    router.push('/start');
  }

  const nav = [
    { href: '/dashboard', labelKey: 'nav.dashboard', icon: DashboardIcon },
    { href: '/dashboard/jobs', labelKey: 'nav.jobs', icon: JobsIcon },
    { href: '/dashboard/content', labelKey: 'nav.content', icon: ContentIcon },
    { href: '/dashboard/studio', labelKey: 'nav.studio', icon: StudioIcon },
  ];

  const displayName = user?.full_name?.trim() || user?.email || '';
  const urlThreadId = searchParams.get('thread');
  const threadsToShow = useMemo(() => {
    if (!urlThreadId) return threads;
    if (threads.some((t) => t.id === urlThreadId)) return threads;
    const now = new Date().toISOString();
    return [{ id: urlThreadId, user_id: '', title: 'New chat', archived_at: null, created_at: now, updated_at: now }, ...threads];
  }, [threads, urlThreadId]);
  const recentThreads = threadsToShow.slice(0, 5);

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 224 }}
      transition={{ duration: 0.2 }}
      className="h-screen shrink-0 border-r border-theme-border bg-theme-bg flex flex-col overflow-hidden"
    >
      <div className="p-4 border-b border-theme-border flex items-center justify-between gap-2 min-h-[52px]">
        {collapsed ? (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="mx-auto p-1.5 rounded-md text-theme-fg-muted hover:text-theme-fg hover:bg-theme-bg-hover transition-colors"
            aria-label="Expand"
          >
            <ChevronIcon collapsed={true} />
          </button>
        ) : (
          <>
            <Link href={pathname === '/dashboard' ? '/dashboard?new=1' : '/dashboard'} className="group flex items-baseline gap-0.5 tracking-tight min-w-0">
              <span className="text-theme-fg-muted group-hover:text-theme-fg shrink-0">{"<"}</span>
              <span className="font-display font-bold text-theme-fg truncate">FLIPO5</span>
              <span className="text-theme-fg-muted group-hover:text-theme-fg shrink-0">{" />"}</span>
            </Link>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="shrink-0 p-1.5 rounded-md text-theme-fg-muted hover:text-theme-fg hover:bg-theme-bg-hover transition-colors"
              aria-label="Collapse"
            >
              <ChevronIcon collapsed={false} />
            </button>
          </>
        )}
      </div>
      <nav className="flex-1 p-3 flex flex-col gap-0.5 min-h-0 overflow-hidden">
        {nav.map(({ href, labelKey, icon: Icon }) => {
          const isActive = href === '/dashboard/studio' ? pathname.startsWith('/dashboard/studio') : pathname === href;
          return (
          <Link
            key={href}
            href={href === '/dashboard' && pathname === '/dashboard' ? '/dashboard?new=1' : href}
            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors min-w-0 ${
              isActive ? 'bg-theme-bg-hover text-theme-fg' : 'text-theme-fg-muted hover:bg-theme-bg-hover hover:text-theme-fg'
            }`}
            title={collapsed ? t(locale, labelKey) : undefined}
          >
            <Icon className="w-5 h-5 shrink-0" />
            <AnimatePresence mode="wait">
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.15 }}
                  className="truncate"
                >
                  {t(locale, labelKey)}
                </motion.span>
              )}
            </AnimatePresence>
          </Link>
          );
        })}
        {!collapsed && (
          <div className="mt-1">
            <button
              type="button"
              onClick={() => setSessionsExpanded((e) => !e)}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors min-w-0 w-full ${
                pathname === '/dashboard/sessions' || sessionsExpanded
                  ? 'bg-theme-bg-hover text-theme-fg'
                  : 'text-theme-fg-muted hover:bg-theme-bg-hover hover:text-theme-fg'
              }`}
              title={t(locale, 'nav.sessions')}
            >
              <SessionsIcon className="w-5 h-5 shrink-0" />
              <span className="truncate flex-1 text-left">{t(locale, 'nav.sessions')}</span>
              <motion.span
                animate={{ rotate: sessionsExpanded ? 180 : 0 }}
                className="shrink-0 text-theme-fg-muted"
              >
                <ChevronDownIcon className="w-4 h-4" />
              </motion.span>
            </button>
            <AnimatePresence>
              {sessionsExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="pl-8 pr-2 py-2 flex flex-col gap-1">
                    {threadsLoading && <p className="text-xs text-theme-fg-muted py-1">{t(locale, 'common.loading')}</p>}
                    {!threadsLoading && recentThreads.length === 0 && (
                      <p className="text-xs text-theme-fg-muted py-1">{t(locale, 'sessions.empty')}</p>
                    )}
                    {!threadsLoading &&
                      recentThreads.map((thread) => (
                        <ThreadItem
                          key={thread.id}
                          thread={thread}
                          locale={locale}
                          isActive={urlThreadId === thread.id}
                          compact
                          openMenuThreadId={openMenuThreadId}
                          onContextMenuOpen={setOpenMenuThreadId}
                          showArchive
                          showUnarchive={false}
                          showDelete
                          onArchive={async () => {
                            try {
                              await patchThread(thread.id, 'archive');
                              const r = await listThreads();
                              setThreads(r.threads ?? []);
                              if (urlThreadId === thread.id) router.replace('/dashboard');
                              setShowArchivedDialog(true);
                            } catch (e) {
                              if (e instanceof ThreadActionError && e.code === 'has_active_jobs') {
                                setError(t(locale, 'error.hasActiveJobs'));
                                setTimeout(() => setError(null), 4000);
                              }
                            }
                          }}
                          onDeleteRequest={(t) => setPendingDeleteThread(t)}
                        />
                      ))}
                    {threads.length > 5 && (
                      <Link
                        href="/dashboard/sessions"
                        className="mt-2 px-2 py-1.5 rounded text-sm text-theme-fg-muted hover:text-theme-fg hover:bg-theme-bg-hover transition-colors"
                      >
                        {t(locale, 'sessions.viewMore')}
                      </Link>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        {collapsed && (
          <Link
            href="/dashboard/sessions"
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-theme-fg-muted hover:bg-theme-bg-hover hover:text-theme-fg transition-colors"
            title={t(locale, 'nav.sessions')}
          >
            <SessionsIcon className="w-5 h-5 shrink-0" />
          </Link>
        )}
      </nav>
      <div className="p-3 border-t border-theme-border flex flex-col gap-1">
        <Link
          href="/dashboard/profile"
          className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors min-w-0 ${
            pathname === '/dashboard/profile' ? 'bg-theme-bg-hover text-theme-fg' : 'text-theme-fg-muted hover:bg-theme-bg-hover hover:text-theme-fg'
          }`}
          title={collapsed ? displayName || t(locale, 'nav.profile') : undefined}
        >
          <UserIcon className="w-5 h-5 shrink-0" />
          <AnimatePresence mode="wait">
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.15 }}
                className="truncate"
              >
                {displayName || t(locale, 'nav.profile')}
              </motion.span>
            )}
          </AnimatePresence>
        </Link>
        <Link
          href="/dashboard/settings"
          className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors min-w-0 ${
            pathname === '/dashboard/settings' ? 'bg-theme-bg-hover text-theme-fg' : 'text-theme-fg-muted hover:bg-theme-bg-hover hover:text-theme-fg'
          }`}
          title={collapsed ? t(locale, 'nav.settings') : undefined}
        >
          <SettingsIcon className="w-5 h-5 shrink-0" />
          <AnimatePresence mode="wait">
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.15 }}
                className="truncate"
              >
                {t(locale, 'nav.settings')}
              </motion.span>
            )}
          </AnimatePresence>
        </Link>
        {isAdminUser(user) && (
          <Link
            href="/admin"
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-theme-accent hover:bg-theme-bg-hover transition-colors min-w-0"
            title="Admin"
          >
            <AdminIcon className="w-5 h-5 shrink-0" />
            <AnimatePresence mode="wait">
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.15 }}
                  className="truncate"
                >
                  Admin
                </motion.span>
              )}
            </AnimatePresence>
          </Link>
        )}
        <button
          type="button"
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-theme-fg-muted hover:bg-theme-bg-hover hover:text-theme-fg text-left transition-colors w-full"
          title={t(locale, 'nav.logout')}
        >
          <DoorIcon className="w-5 h-5 shrink-0" />
          <AnimatePresence mode="wait">
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.15 }}
              >
                {t(locale, 'nav.logout')}
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
      <ConfirmDialog
        open={!!pendingDeleteThread}
        title={t(locale, 'thread.deleteTitle')}
        message={t(locale, 'thread.deleteConfirm')}
        confirmLabel={t(locale, 'thread.delete')}
        cancelLabel={t(locale, 'dialog.cancel')}
        onConfirm={async () => {
          if (!pendingDeleteThread) return;
          try {
            await patchThread(pendingDeleteThread.id, 'delete');
            const r = await listThreads();
            setThreads(r.threads ?? []);
            if (urlThreadId === pendingDeleteThread.id) router.replace('/dashboard');
          } catch (e) {
            if (e instanceof ThreadActionError && e.code === 'has_active_jobs') {
              setError(t(locale, 'error.hasActiveJobs'));
              setTimeout(() => setError(null), 4000);
            }
          } finally {
            setPendingDeleteThread(null);
          }
        }}
        onCancel={() => setPendingDeleteThread(null)}
      />
      {error && (
        <div className="mx-3 mb-2 px-3 py-2 rounded-lg bg-theme-danger-muted text-theme-danger text-sm">
          {error}
        </div>
      )}
      <ArchivedDialog
        open={showArchivedDialog}
        title={t(locale, 'thread.archivedTitle')}
        message={t(locale, 'thread.archivedMessage')}
        profileLabel={t(locale, 'thread.myProfile')}
        onClose={() => setShowArchivedDialog(false)}
      />
    </motion.aside>
  );
}

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  );
}

function JobsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
    </svg>
  );
}

function ContentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  );
}
function StudioIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.38 3.395a15.995 15.995 0 004.769-2.95m0 0a3 3 0 10-4.243-4.243m4.242 4.242a9 9 0 01-1.414-2.165m-1.414 1.414a9 9 0 01-2.167-1.415m1.414 1.414L11 3.828a9 9 0 0110.172 10.172z" />
    </svg>
  );
}

function SessionsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function AdminIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function DoorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0110.5 3h6a2.25 2.25 0 012.25 2.25v13.5A2.25 2.25 0 0116.5 21h-6a2.25 2.25 0 01-2.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
    </svg>
  );
}

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      className={`w-4 h-4 transition-transform ${collapsed ? '' : 'rotate-180'}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}
