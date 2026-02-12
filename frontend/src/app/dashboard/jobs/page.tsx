'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale } from '@/app/components/LocaleContext';
import { listJobs, type Job } from '@/lib/api';
import { t } from '@/lib/i18n';

export default function JobsPage() {
  const { locale } = useLocale();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listJobs()
      .then((r) => setJobs(r.jobs ?? []))
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, []);

  const statusT = (status: string) => {
    if (status === 'pending') return t(locale, 'jobs.status.pending');
    if (status === 'running') return t(locale, 'jobs.status.running');
    if (status === 'completed') return t(locale, 'jobs.status.completed');
    return t(locale, 'jobs.status.failed');
  };
  const typeT = (type: string) => {
    if (type === 'chat') return t(locale, 'jobs.type.chat');
    if (type === 'image') return t(locale, 'jobs.type.image');
    return t(locale, 'jobs.type.video');
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-6 scrollbar-subtle">
      <h1 className="text-xl font-semibold text-white mb-6">{t(locale, 'jobs.title')}</h1>
      {loading && <p className="text-zinc-500">{t(locale, 'common.loading')}</p>}
      {!loading && (jobs ?? []).length === 0 && (
        <p className="text-zinc-500">{t(locale, 'jobs.empty')}</p>
      )}
      {!loading && (jobs ?? []).length > 0 && (
        <ul className="space-y-2">
          {(jobs ?? []).map((job) => (
            <li key={job.id} className="border border-white/10 rounded-lg p-4 flex items-center justify-between bg-white/5">
              <div>
                <span className="text-sm font-medium text-white">{typeT(job.type)}</span>
                <span className="text-sm text-zinc-500 ml-2">{statusT(job.status)}</span>
              </div>
              <Link
                href={`/dashboard/jobs/${job.id}`}
                className="text-sm text-white hover:underline"
              >
                {t(locale, 'jobs.view')}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
