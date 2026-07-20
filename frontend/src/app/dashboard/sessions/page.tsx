'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useLocale } from '@/app/components/LocaleContext';
import { useToast } from '@/app/components/ToastContext';
import { listThreads, patchThread, ThreadActionError, type Thread } from '@/lib/api';
import { t } from '@/lib/i18n';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArchivedDialog } from '@/components/ArchivedDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ThreadItem } from '../components/ThreadItem';

export default function SessionsPage() {
  const { locale } = useLocale();
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlThreadId = searchParams.get('thread');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [openMenuThreadId, setOpenMenuThreadId] = useState<string | null>(null);
  const [pendingDeleteThread, setPendingDeleteThread] = useState<Thread | null>(null);
  const [showArchivedDialog, setShowArchivedDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipEmptySearchReload = useRef(true);

  const refresh = useCallback(async (q?: string) => {
    try {
      const r = await listThreads(false, q?.trim() || undefined);
      setThreads(r.threads ?? []);
      setError(null);
    } catch {
      setThreads([]);
      setError(t(locale, 'sessions.loadError'));
    }
  }, [locale]);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = search.trim();
    if (!q) {
      setSearching(false);
      if (skipEmptySearchReload.current) {
        skipEmptySearchReload.current = false;
        return;
      }
      void refresh();
      return;
    }
    skipEmptySearchReload.current = false;
    setSearching(true);
    searchTimer.current = setTimeout(() => {
      refresh(q).finally(() => setSearching(false));
    }, 280);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search, refresh]);

  const handleRename = async (thread: Thread, title: string) => {
    await patchThread(thread.id, 'rename', title);
    setThreads((prev) => prev.map((th) => (th.id === thread.id ? { ...th, title } : th)));
    showToast('toast.saved');
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('flipo5:threads-changed'));
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 scrollbar-subtle">
      <div className="max-w-3xl mx-auto">
        <h1 className="font-display text-2xl font-bold text-theme-fg mb-1">{t(locale, 'sessions.title')}</h1>
        <p className="text-sm text-theme-fg-muted mb-4">{t(locale, 'sessions.sub')}</p>

        <div className="mb-5">
          <label className="sr-only" htmlFor="sessions-search">{t(locale, 'sessions.search')}</label>
          <input
            id="sessions-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t(locale, 'sessions.searchPlaceholder')}
            className="w-full rounded-xl border border-theme-border bg-theme-bg-subtle px-4 py-2.5 text-sm text-theme-fg placeholder:text-theme-fg-subtle outline-none focus:border-theme-accent"
          />
          {searching && <p className="mt-1.5 text-xs text-theme-fg-muted">{t(locale, 'common.loading')}</p>}
        </div>

        {error && (
          <div className="mb-4 px-4 py-2 rounded-lg bg-theme-danger-muted text-theme-danger text-sm flex items-center justify-between gap-2">
            <span>{error}</span>
            <button type="button" onClick={() => { setLoading(true); refresh(search).finally(() => setLoading(false)); }} className="underline shrink-0">
              {t(locale, 'common.refresh') || 'Retry'}
            </button>
          </div>
        )}

        {loading && (
          <div className="space-y-2" aria-hidden>
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded-xl border border-theme-border bg-theme-bg-subtle animate-pulse-subtle" />
            ))}
          </div>
        )}

        {!loading && threads.length === 0 && !error && (
          <div className="rounded-2xl border border-theme-border bg-theme-bg-subtle p-8 text-center">
            <p className="text-theme-fg font-medium mb-1">
              {search.trim() ? t(locale, 'sessions.noResults') : t(locale, 'sessions.empty')}
            </p>
            <p className="text-sm text-theme-fg-muted mb-5">
              {search.trim() ? t(locale, 'sessions.noResultsHint') : t(locale, 'sessions.emptyHint')}
            </p>
            {!search.trim() && (
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Link
                  href="/dashboard"
                  className="btn-tap inline-flex px-4 py-2 rounded-xl bg-theme-accent text-white text-sm font-medium"
                >
                  {t(locale, 'sessions.startChat')}
                </Link>
                <Link
                  href="/dashboard?inspire=1"
                  className="btn-tap inline-flex px-4 py-2 rounded-xl border border-theme-border text-sm text-theme-fg hover:bg-theme-bg-hover"
                >
                  {t(locale, 'collections.title')}
                </Link>
              </div>
            )}
          </div>
        )}

        {!loading && threads.length > 0 && (
          <ul className="space-y-2">
            {threads.map((thread) => (
              <li key={thread.id}>
                <ThreadItem
                  thread={thread}
                  locale={locale}
                  isActive={urlThreadId === thread.id}
                  card
                  openMenuThreadId={openMenuThreadId}
                  onContextMenuOpen={setOpenMenuThreadId}
                  showArchive
                  showUnarchive={false}
                  showDelete
                  showRename
                  onRename={handleRename}
                  onArchive={async () => {
                    try {
                      await patchThread(thread.id, 'archive');
                      await refresh(search);
                      showToast('toast.archived');
                      if (urlThreadId === thread.id) router.replace('/dashboard');
                      setShowArchivedDialog(true);
                    } catch (e) {
                      if (e instanceof ThreadActionError && e.code === 'has_active_jobs') {
                        setError(t(locale, 'error.hasActiveJobs'));
                        setTimeout(() => setError(null), 4000);
                      }
                    }
                  }}
                  onDeleteRequest={(th) => setPendingDeleteThread(th)}
                />
              </li>
            ))}
          </ul>
        )}
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
            await refresh(search);
            showToast('toast.deleted');
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
      <ArchivedDialog
        open={showArchivedDialog}
        title={t(locale, 'thread.archivedTitle')}
        message={t(locale, 'thread.archivedMessage')}
        profileLabel={t(locale, 'thread.myProfile')}
        onClose={() => setShowArchivedDialog(false)}
      />
    </div>
  );
}
