'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useLocale } from '@/app/components/LocaleContext';
import { listContent, type Job } from '@/lib/api';
import { t } from '@/lib/i18n';
import { getOutputUrls } from '@/lib/jobOutput';
import { ImageViewModal } from '../components/ImageViewModal';

type ContentJob = Job & { outputUrls: string[] };

const PAGE_SIZE = 20;

function extractOutputUrls(job: Job): string[] {
  if (job.status !== 'completed' || !job.output) return [];
  return getOutputUrls(job.output);
}

function getJobDisplayName(job: ContentJob): string {
  if (job.name?.trim()) return job.name;
  const prompt = (job.input as { prompt?: string })?.prompt;
  if (typeof prompt === 'string' && prompt.trim()) {
    return prompt.trim().split(/\s+/).slice(0, 4).join(' ') || '';
  }
  return '';
}

export default function ContentPage() {
  const { locale } = useLocale();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [items, setItems] = useState<ContentJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const [viewingImage, setViewingImage] = useState<{ urls: string[] } | null>(null);

  const typeFilter = (searchParams.get('type') || '') as 'image' | 'video' | '';
  const searchQ = searchParams.get('q') || '';

  const fetchContent = useCallback(() => {
    setLoading(true);
    listContent({
      page,
      limit: PAGE_SIZE,
      type: typeFilter === 'image' || typeFilter === 'video' ? typeFilter : '',
      q: searchQ || undefined,
    })
      .then((r) => {
        const jobs = (r.jobs ?? []).map((j) => ({ ...j, outputUrls: extractOutputUrls(j) }));
        setItems(jobs);
        setTotal(r.total ?? 0);
      })
      .catch(() => {
        setItems([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [page, typeFilter, searchQ]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-6 scrollbar-subtle">
      <h1 className="text-xl font-semibold text-theme-fg mb-6">{t(locale, 'content.title')}</h1>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <form
          className="flex-1 relative"
          onSubmit={(e) => {
            e.preventDefault();
            const q = (e.currentTarget.elements.namedItem('q') as HTMLInputElement)?.value?.trim() || '';
            const params = new URLSearchParams();
            if (q) params.set('q', q);
            if (typeFilter) params.set('type', typeFilter);
            router.push(`/dashboard/content?${params.toString()}`);
          }}
        >
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-fg-subtle pointer-events-none" />
          <input
            name="q"
            type="search"
            placeholder={t(locale, 'content.searchPlaceholder')}
            defaultValue={searchQ}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-theme-border bg-theme-bg-subtle text-theme-fg placeholder:text-theme-fg-subtle focus:border-theme-border-strong focus:outline-none focus:ring-1 focus:ring-theme-border-hover"
          />
        </form>
        <div className="flex gap-2">
          {(['', 'image', 'video'] as const).map((typeVal) => (
            <a
              key={typeVal || 'all'}
              href={`/dashboard/content?${new URLSearchParams({
                ...(searchQ && { q: searchQ }),
                ...(typeVal && { type: typeVal }),
              }).toString()}`}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                typeFilter === typeVal
                  ? 'bg-theme-bg-hover-strong text-theme-fg border border-theme-border-hover'
                  : 'bg-theme-bg-subtle text-theme-fg-muted border border-theme-border-subtle hover:bg-theme-bg-hover hover:text-theme-fg'
              }`}
            >
              {typeVal === '' ? t(locale, 'content.all') : typeVal === 'image' ? t(locale, 'content.images') : t(locale, 'content.videos')}
            </a>
          ))}
        </div>
      </div>

      {loading && <p className="text-theme-fg-subtle py-4">{t(locale, 'common.loading')}</p>}
      {!loading && items.length === 0 && (
        <p className="text-theme-fg-subtle py-4">{t(locale, 'content.empty')}</p>
      )}
      {!loading && items.length > 0 && (
        <>
          <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {items.map((job) => (
              <li key={job.id} className="flex flex-col gap-1.5">
                {job.type === 'image' ? (
                  <button
                    type="button"
                    onClick={() => setViewingImage({ urls: job.outputUrls })}
                    className="w-full text-left rounded-xl border border-theme-border bg-theme-bg-subtle overflow-hidden hover:bg-theme-bg-hover hover:border-theme-border-hover transition-all group"
                  >
                    <div className="aspect-square relative bg-theme-bg-elevated">
                      {job.outputUrls[0] && (
                        <img src={job.outputUrls[0]} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                      )}
                      <div className="absolute inset-0 bg-theme-bg-overlay opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-sm font-medium text-theme-fg px-3 py-1.5 rounded-lg bg-theme-bg-hover-strong">
                          {t(locale, 'content.view')}
                        </span>
                      </div>
                    </div>
                  </button>
                ) : (
                  <a
                    href={job.outputUrls[0]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-xl border border-theme-border bg-theme-bg-subtle overflow-hidden hover:bg-theme-bg-hover hover:border-theme-border-hover transition-all group"
                  >
                    <div className="aspect-square relative bg-theme-bg-elevated">
                      {job.outputUrls[0] ? (
                        <video
                          src={job.outputUrls[0]}
                          className="w-full h-full object-cover"
                          muted
                          preload="metadata"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-theme-fg-subtle">
                          <VideoIcon className="w-12 h-12" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-theme-bg-overlay opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-sm font-medium text-theme-fg px-3 py-1.5 rounded-lg bg-theme-bg-hover-strong">
                          {t(locale, 'content.view')}
                        </span>
                      </div>
                    </div>
                  </a>
                )}
                {getJobDisplayName(job) && (
                  <p className="text-xs text-theme-fg-subtle truncate px-0.5" title={getJobDisplayName(job)}>
                    {getJobDisplayName(job)}
                  </p>
                )}
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              <a
                href={`/dashboard/content?${new URLSearchParams({
                  page: String(page - 1),
                  ...(searchQ && { q: searchQ }),
                  ...(typeFilter && { type: typeFilter }),
                }).toString()}`}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  hasPrev ? 'bg-theme-bg-hover text-theme-fg hover:bg-theme-bg-hover-strong' : 'bg-theme-bg-subtle text-theme-fg-subtle pointer-events-none'
                }`}
              >
                {t(locale, 'content.prev')}
              </a>
              <span className="text-sm text-theme-fg-muted px-4">
                {t(locale, 'content.pageOf').replace('{page}', String(page)).replace('{total}', String(totalPages))}
              </span>
              <a
                href={`/dashboard/content?${new URLSearchParams({
                  page: String(page + 1),
                  ...(searchQ && { q: searchQ }),
                  ...(typeFilter && { type: typeFilter }),
                }).toString()}`}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  hasNext ? 'bg-theme-bg-hover text-theme-fg hover:bg-theme-bg-hover-strong' : 'bg-theme-bg-subtle text-theme-fg-subtle pointer-events-none'
                }`}
              >
                {t(locale, 'content.next')}
              </a>
            </div>
          )}
        </>
      )}

      {viewingImage && viewingImage.urls[0] && (
        <ImageViewModal
          url={viewingImage.urls[0]}
          urls={viewingImage.urls.length > 1 ? viewingImage.urls : undefined}
          onClose={() => setViewingImage(null)}
          locale={locale}
        />
      )}
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function VideoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}
