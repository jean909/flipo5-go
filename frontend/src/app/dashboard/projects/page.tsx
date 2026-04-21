'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';
import { listChatProjects, type ChatProject } from '@/lib/api';
import { CreateChatProjectDialog } from '../components/CreateChatProjectDialog';
import { useRouter } from 'next/navigation';

export default function ProjectsPage() {
  const { locale } = useLocale();
  const router = useRouter();
  const [projects, setProjects] = useState<ChatProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const refresh = () => {
    setLoading(true);
    listChatProjects()
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-subtle p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-theme-fg">{t(locale, 'projects.title')}</h1>
            <p className="text-sm text-theme-fg-muted mt-1">{t(locale, 'chatProjects.listSub')}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="btn-tap px-4 py-2 rounded-xl text-sm font-semibold bg-white text-black flex items-center gap-2"
          >
            <PlusIcon className="w-4 h-4" />
            {t(locale, 'chatProjects.newProject')}
          </button>
        </div>

        {loading && projects.length === 0 ? (
          <p className="text-theme-fg-subtle animate-pulse-subtle py-10 text-center">{t(locale, 'common.loading')}</p>
        ) : projects.length === 0 ? (
          <div className="rounded-2xl border border-theme-border bg-theme-bg-subtle p-8 text-center">
            <FolderBigIcon className="w-12 h-12 mx-auto text-theme-fg-subtle mb-3" />
            <p className="text-theme-fg-muted mb-4">{t(locale, 'chatProjects.empty')}</p>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="btn-tap px-4 py-2 rounded-xl text-sm font-semibold bg-white text-black"
            >
              {t(locale, 'chatProjects.createFirst')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {projects.map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, delay: Math.min(i * 0.02, 0.12) }}
              >
                <Link
                  href={`/dashboard/projects/${p.id}`}
                  className="block rounded-xl border border-theme-border bg-theme-bg-subtle p-4 hover:bg-theme-bg-hover hover:border-theme-border-hover transition-colors"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-8 h-8 rounded-lg bg-theme-accent-muted text-theme-accent flex items-center justify-center shrink-0">
                      <FolderSmallIcon className="w-4 h-4" />
                    </span>
                    <h3 className="text-sm font-semibold text-theme-fg truncate flex-1">{p.name}</h3>
                  </div>
                  {p.instructions ? (
                    <p className="text-xs text-theme-fg-muted line-clamp-2 mb-2">{p.instructions}</p>
                  ) : (
                    <p className="text-xs text-theme-fg-subtle italic mb-2">{t(locale, 'chatProjects.instructionsEmpty')}</p>
                  )}
                  <div className="flex items-center gap-3 text-[11px] text-theme-fg-subtle">
                    <span>{t(locale, 'chatProjects.statThreads').replace('{n}', String(p.thread_count))}</span>
                    <span>·</span>
                    <span>{t(locale, 'chatProjects.statFiles').replace('{n}', String(p.file_count))}</span>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <CreateChatProjectDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(p) => {
          refresh();
          router.push(`/dashboard/projects/${p.id}`);
        }}
      />
    </div>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}
function FolderSmallIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
    </svg>
  );
}
function FolderBigIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
    </svg>
  );
}
