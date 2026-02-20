'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLocale } from '@/app/components/LocaleContext';
import { getJob, type Job } from '@/lib/api';
import { getOutputUrls } from '@/lib/jobOutput';
import { ImageGallery } from '../../components/ImageGallery';
import { VideoPlayer } from '../../components/VideoPlayer';
import { t, jobErrorDisplay } from '@/lib/i18n';

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { locale } = useLocale();
  const id = params.id as string;
  const [job, setJob] = useState<Job | null>(null);

  useEffect(() => {
    let cancelled = false;
    function fetchJob() {
      if (cancelled) return;
      getJob(id)
        .then((j) => {
          if (cancelled) return;
          if (j === null) {
            router.replace('/dashboard/jobs');
            return;
          }
          setJob(j);
          if (j.status === 'pending' || j.status === 'running') {
            setTimeout(fetchJob, 2000);
          }
        })
        .catch(() => {
          if (!cancelled) router.replace('/dashboard/jobs');
        });
    }
    fetchJob();
    return () => { cancelled = true; };
  }, [id, router]);

  if (!job) return <div className="flex-1 flex items-center justify-center p-6"><p className="text-theme-fg-muted">{t(locale, 'common.loading')}</p></div>;

  const statusLabel =
    job.status === 'pending'
      ? t(locale, 'jobs.status.pending')
      : job.status === 'running'
        ? t(locale, 'jobs.status.running')
        : job.status === 'completed'
          ? t(locale, 'jobs.status.completed')
          : t(locale, 'jobs.status.failed');

  const validUrls = getOutputUrls(job.output);
  const out = job.output as { output?: string | string[] } | null;
  const outputStr = out && typeof out.output === 'string' ? out.output : '';
  const outputText = outputStr && !outputStr.startsWith('http') ? outputStr : '';

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6 scrollbar-subtle">
      <Link href="/dashboard/jobs" className="text-sm text-theme-fg-muted hover:text-theme-fg">
        ← {t(locale, 'nav.jobs')}
      </Link>
      <div className="border border-theme-border rounded-lg p-6 bg-theme-bg-subtle">
        <p className="text-sm text-theme-fg-muted">{job.type} · {statusLabel}</p>
        {job.input && (
          <pre className="mt-2 text-sm text-theme-fg whitespace-pre-wrap break-words overflow-x-auto bg-theme-bg-overlay p-3 rounded border border-theme-border">
            {JSON.stringify(job.input, null, 2)}
          </pre>
        )}
        {job.status === 'failed' && job.error && (
          <p className="mt-3 text-sm text-theme-danger">{jobErrorDisplay(job.error, locale)}</p>
        )}
        {job.status === 'completed' && outputText && (
          <p className="mt-4 text-sm text-theme-fg whitespace-pre-wrap">{outputText}</p>
        )}
        {job.status === 'completed' && validUrls.length > 0 && (
          <div className="mt-4">
            {job.type === 'image' && validUrls.length > 0 ? (
              <ImageGallery urls={validUrls} variant="full" />
            ) : job.type === 'video' && validUrls[0] ? (
              <VideoPlayer src={validUrls[0]} className="max-w-2xl" />
            ) : (
              <div className="space-y-2">
                {validUrls.map((url) =>
                  !url ? null : /\.(mp4|webm|mov)$/i.test(url) ? (
                    <VideoPlayer key={url} src={url} className="max-w-2xl" />
                  ) : (
                    <img key={url} src={url} alt="" className="max-w-full h-auto rounded border border-theme-border" loading="lazy" decoding="async" />
                  )
                )}
              </div>
            )}
          </div>
        )}
        {job.status === 'completed' && out && !outputText && validUrls.length === 0 && (
          <pre className="mt-3 text-xs text-theme-fg-muted overflow-auto scrollbar-subtle rounded">{JSON.stringify(job.output)}</pre>
        )}
      </div>
    </div>
  );
}
