'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';
import { getMe, listThreads, patchThread, type User, type Thread } from '@/lib/api';
import { ThreadItem } from '../components/ThreadItem';

const JOB_TYPE_I18N: Record<string, string> = {
  chat: 'jobs.type.chat',
  image: 'jobs.type.image',
  video: 'jobs.type.video',
  logo: 'jobs.type.logo',
  upscale: 'jobs.type.upscale',
  seo: 'jobs.type.seo',
  outline: 'jobs.type.outline',
  translate: 'jobs.type.translate',
  product: 'profile.tool.product',
  product_description: 'profile.tool.product_description',
  product_scene_improve: 'profile.tool.product_scene_improve',
  product_score: 'profile.tool.product_score',
  translation_project: 'profile.tool.translation_project',
};

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
    let cancelled = false;
    const id = setTimeout(() => {
      setArchivedLoading(true);
      loadArchived()
        .then((r) => { if (!cancelled) setArchived(r); })
        .catch(() => {})
        .finally(() => { if (!cancelled) setArchivedLoading(false); });
    }, 400);
    return () => { clearTimeout(id); cancelled = true; };
  }, [searchParams, router]);

  const profile = user?.profile;
  const stats = profile?.stats;
  const hasAnyStats = useMemo(() => {
    if (!stats) return false;
    const hasCounts = stats.job_counts && Object.keys(stats.job_counts).length > 0 && Object.values(stats.job_counts).some((n) => n > 0);
    const hasLangs = stats.translate_targets && stats.translate_targets.length > 0;
    const hasCats = stats.product_categories && stats.product_categories.length > 0;
    return hasCounts || hasLangs || hasCats;
  }, [stats]);

  const mostUsedTools = useMemo(() => {
    if (!stats?.job_counts) return [];
    return Object.entries(stats.job_counts)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([type, count]) => ({ type, count }));
  }, [stats?.job_counts]);

  const lastUsedEntry = useMemo(() => {
    if (!stats?.last_used || typeof stats.last_used !== 'object') return null;
    const entries = Object.entries(stats.last_used).filter(([, v]) => v);
    if (entries.length === 0) return null;
    entries.sort((a, b) => (b[1] || '').localeCompare(a[1] || ''));
    return entries[0];
  }, [stats?.last_used]);

  if (!user) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="text-theme-fg-muted">{t(locale, 'common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 scrollbar-subtle">
      <div className="max-w-xl mx-auto">
      <h1 className="font-display text-2xl font-bold text-theme-fg mb-8">{t(locale, 'profile.title')}</h1>

      <section className="rounded-2xl border border-theme-border bg-theme-bg-subtle p-4 md:p-6 mb-4 md:mb-6">
        <h2 className="text-sm font-medium text-theme-fg-muted uppercase tracking-wider mb-4">{t(locale, 'profile.section')}</h2>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-theme-fg-muted">{t(locale, 'start.fullName')}</dt>
            <dd className="text-theme-fg font-medium mt-0.5">{user.full_name || '—'}</dd>
          </div>
          <div>
            <dt className="text-theme-fg-muted">{t(locale, 'login.email')}</dt>
            <dd className="text-theme-fg mt-0.5">{user.email}</dd>
          </div>
          <div>
            <dt className="text-theme-fg-muted">{t(locale, 'start.whereHeard')}</dt>
            <dd className="text-theme-fg mt-0.5">{user.where_heard || '—'}</dd>
          </div>
          <div>
            <dt className="text-theme-fg-muted">{t(locale, 'start.useCase')}</dt>
            <dd className="text-theme-fg mt-0.5">{user.use_case || '—'}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-theme-border bg-theme-bg-subtle p-4 md:p-6 mb-4 md:mb-6">
        <h2 className="text-sm font-medium text-theme-fg-muted uppercase tracking-wider mb-1">{t(locale, 'profile.whatWeKnow')}</h2>
        <p className="text-sm text-theme-fg-subtle mb-4">{t(locale, 'profile.whatWeKnowDesc')}</p>
        {!hasAnyStats ? (
          <p className="text-sm text-theme-fg-muted italic">{t(locale, 'profile.stillLearning')}</p>
        ) : (
          <dl className="space-y-4 text-sm">
            {mostUsedTools.length > 0 && (
              <div>
                <dt className="text-theme-fg-muted mb-1.5">{t(locale, 'profile.mostUsedTools')}</dt>
                <dd className="flex flex-wrap gap-2">
                  {mostUsedTools.map(({ type, count }) => (
                    <span
                      key={type}
                      className="inline-flex items-center rounded-full bg-theme-bg-hover px-3 py-1 text-theme-fg"
                    >
                      {t(locale, JOB_TYPE_I18N[type] || type)} <span className="ml-1.5 text-theme-fg-muted">×{count}</span>
                    </span>
                  ))}
                </dd>
              </div>
            )}
            {lastUsedEntry && (
              <div>
                <dt className="text-theme-fg-muted mb-0.5">{t(locale, 'profile.lastUsed')}</dt>
                <dd className="text-theme-fg">{t(locale, JOB_TYPE_I18N[lastUsedEntry[0]] || lastUsedEntry[0])}</dd>
              </div>
            )}
            {stats?.translate_targets && stats.translate_targets.length > 0 && (
              <div>
                <dt className="text-theme-fg-muted mb-1">{t(locale, 'profile.preferredLanguages')}</dt>
                <dd className="text-theme-fg">{stats.translate_targets.join(', ')}</dd>
              </div>
            )}
            {stats?.product_categories && stats.product_categories.length > 0 && (
              <div>
                <dt className="text-theme-fg-muted mb-1">{t(locale, 'profile.productCategories')}</dt>
                <dd className="flex flex-wrap gap-2">
                  {stats.product_categories.map((cat) => (
                    <span key={cat} className="rounded-md bg-theme-bg-hover px-2 py-0.5 text-theme-fg">
                      {cat}
                    </span>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        )}
      </section>

      <section className="rounded-2xl border border-theme-border bg-theme-bg-subtle p-4 md:p-6 mb-4 md:mb-6">
        <h2 className="text-sm font-medium text-theme-fg-muted uppercase tracking-wider mb-4">{t(locale, 'profile.archive')}</h2>
        {archivedLoading && <p className="text-theme-fg-muted text-sm">{t(locale, 'common.loading')}</p>}
        {!archivedLoading && archived.length === 0 && (
          <p className="text-theme-fg-muted text-sm">{t(locale, 'profile.archiveEmpty')}</p>
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
