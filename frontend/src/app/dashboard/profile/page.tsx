'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';
import { getMe, listThreads, patchThread, type User, type Thread } from '@/lib/api';
import { ThreadItem } from '../components/ThreadItem';

function loadArchived() {
  return listThreads(true).then((r) => r.threads ?? []);
}

export default function ProfilePage() {
  const { locale } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [archived, setArchived] = useState<Thread[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [openMenuThreadId, setOpenMenuThreadId] = useState<string | null>(null);

  useEffect(() => {
    getMe().then(setUser);
  }, []);

  useEffect(() => {
    const refetch = () => {
      setArchivedLoading(true);
      loadArchived()
        .then(setArchived)
        .catch(() => setArchived([]))
        .finally(() => setArchivedLoading(false));
    };
    refetch();
  }, []);

  // Refetch archived when coming from archive dialog (data might not be ready yet)
  useEffect(() => {
    if (searchParams.get('fromArchive') !== '1') return;
    router.replace('/dashboard/profile', { scroll: false });
    const id = setTimeout(() => {
      setArchivedLoading(true);
      loadArchived()
        .then(setArchived)
        .catch(() => {})
        .finally(() => setArchivedLoading(false));
    }, 400);
    return () => clearTimeout(id);
  }, [searchParams, router]);

  if (!user) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="text-neutral-500">{t(locale, 'common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-6 scrollbar-subtle">
      <div className="max-w-xl mx-auto">
      <h1 className="font-display text-2xl font-bold text-white mb-8">{t(locale, 'profile.title')}</h1>

      <section className="rounded-2xl border border-white/20 bg-white/5 p-6 mb-6">
        <h2 className="text-sm font-medium text-neutral-400 uppercase tracking-wider mb-4">{t(locale, 'profile.section')}</h2>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-neutral-500">{t(locale, 'start.fullName')}</dt>
            <dd className="text-white font-medium mt-0.5">{user.full_name || '—'}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">{t(locale, 'login.email')}</dt>
            <dd className="text-white mt-0.5">{user.email}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">{t(locale, 'start.whereHeard')}</dt>
            <dd className="text-white mt-0.5">{user.where_heard || '—'}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">{t(locale, 'start.useCase')}</dt>
            <dd className="text-white mt-0.5">{user.use_case || '—'}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-white/20 bg-white/5 p-6 mb-6">
        <h2 className="text-sm font-medium text-neutral-400 uppercase tracking-wider mb-4">{t(locale, 'profile.archive')}</h2>
        {archivedLoading && <p className="text-neutral-500 text-sm">{t(locale, 'common.loading')}</p>}
        {!archivedLoading && archived.length === 0 && (
          <p className="text-neutral-500 text-sm">{t(locale, 'profile.archiveEmpty')}</p>
        )}
        {!archivedLoading && archived.length > 0 && (
          <ul className="space-y-2">
            {archived.map((thread) => (
              <li key={thread.id}>
                <ThreadItem
                  thread={thread}
                  locale={locale}
                  card
                  openMenuThreadId={openMenuThreadId}
                  onContextMenuOpen={setOpenMenuThreadId}
                  showArchive={false}
                  showUnarchive
                  showDelete={false}
                  onUnarchive={async () => {
                    try {
                      await patchThread(thread.id, 'unarchive');
                      setArchived((prev) => prev.filter((t) => t.id !== thread.id));
                    } catch {
                      // ignore
                    }
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>
    </div>
  );
}
