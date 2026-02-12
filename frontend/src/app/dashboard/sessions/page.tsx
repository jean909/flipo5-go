'use client';

import { useEffect, useState } from 'react';
import { useLocale } from '@/app/components/LocaleContext';
import { listThreads, patchThread, type Thread } from '@/lib/api';
import { t } from '@/lib/i18n';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArchivedDialog } from '@/components/ArchivedDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ThreadItem } from '../components/ThreadItem';

export default function SessionsPage() {
  const { locale } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlThreadId = searchParams.get('thread');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [openMenuThreadId, setOpenMenuThreadId] = useState<string | null>(null);
  const [pendingDeleteThread, setPendingDeleteThread] = useState<Thread | null>(null);
  const [showArchivedDialog, setShowArchivedDialog] = useState(false);

  const refresh = () => listThreads().then((r) => setThreads(r.threads ?? [])).catch(() => setThreads([]));

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-6 scrollbar-subtle">
      <h1 className="text-xl font-semibold text-white mb-6">{t(locale, 'sessions.title')}</h1>
      {loading && <p className="text-zinc-500">{t(locale, 'common.loading')}</p>}
      {!loading && threads.length === 0 && (
        <p className="text-zinc-500">{t(locale, 'sessions.empty')}</p>
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
                onArchive={async () => {
                  try {
                    await patchThread(thread.id, 'archive');
                    await refresh();
                    if (urlThreadId === thread.id) router.replace('/dashboard');
                    setShowArchivedDialog(true);
                  } catch {
                    // ignore
                  }
                }}
                onDeleteRequest={(th) => setPendingDeleteThread(th)}
              />
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!pendingDeleteThread}
        title={t(locale, 'thread.deleteTitle')}
        message={t(locale, 'thread.deleteConfirm')}
        confirmLabel={t(locale, 'thread.delete')}
        cancelLabel={t(locale, 'dialog.cancel')}
        confirmClass="bg-red-500/20 text-red-400 hover:bg-red-500/30"
        onConfirm={async () => {
          if (!pendingDeleteThread) return;
          try {
            await patchThread(pendingDeleteThread.id, 'delete');
            await refresh();
            if (urlThreadId === pendingDeleteThread.id) router.replace('/dashboard');
          } catch {
            // ignore
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
