'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useSearchParams, useRouter } from 'next/navigation';
import { useLocale } from '@/app/components/LocaleContext';
import { useToast } from '@/app/components/ToastContext';
import { listContent, getToken, getMediaDisplayUrl, fetchBlobForJobRef, type Job } from '@/lib/api';
import { t } from '@/lib/i18n';
import { getOutputRefs } from '@/lib/jobOutput';
import { zipBlobsAndDownload, zipEntryName } from '@/lib/zipExport';
import { ImageViewModal } from '../components/ImageViewModal';
import { Input } from '@/components/ui/Input';
import { buttonClassName } from '@/components/ui/Button';
import { useJobsInProgress } from '../components/JobsInProgressContext';

type ContentJob = Job & { outputRefs: string[] };

const PAGE_SIZE = 20;
const CONTENT_CACHE_MS = 30_000; // 30s stale-while-revalidate for list

function extractOutputRefs(job: Job): string[] {
  if (job.status !== 'completed' || !job.output) return [];
  return getOutputRefs(job.output);
}

function getJobDisplayName(job: ContentJob): string {
  if (job.name?.trim()) return job.name;
  if (job.type === 'upscale') return '';
  const prompt = (job.input as { prompt?: string })?.prompt;
  if (typeof prompt === 'string' && prompt.trim()) {
    return prompt.trim().split(/\s+/).slice(0, 4).join(' ') || '';
  }
  return '';
}

function displayForRef(ref: string, mediaToken: string | null): string {
  if (!ref) return '';
  if (ref.startsWith('http://') || ref.startsWith('https://')) return ref;
  return mediaToken ? getMediaDisplayUrl(ref, mediaToken) : '';
}

export default function ContentPage() {
  const { locale } = useLocale();
  const { showToast } = useToast();
  const { addOptimisticJob, removeOptimisticJob } = useJobsInProgress();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [items, setItems] = useState<ContentJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [mediaToken, setMediaToken] = useState<string | null>(null);
  const mediaTokenRef = useRef<string | null>(null);
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(() => new Set());
  const [exportBusy, setExportBusy] = useState(false);
  const exportInFlightRef = useRef(false);

  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const [viewingMedia, setViewingMedia] = useState<{
    urls: string[];
    downloadUrls: string[];
  } | null>(null);

  const typeFilter = (searchParams.get('type') || '') as 'image' | 'video' | '';
  const searchQ = searchParams.get('q') || '';

  const contentCacheRef = useRef<{ key: string; items: ContentJob[]; total: number; at: number } | null>(null);

  useEffect(() => {
    getToken().then(setMediaToken);
  }, []);

  useEffect(() => {
    mediaTokenRef.current = mediaToken;
  }, [mediaToken]);

  const toggleJobSelected = useCallback((id: string) => {
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllOnPage = useCallback(() => {
    const ids = items.filter((j) => j.outputRefs.length > 0).map((j) => j.id);
    setSelectedJobIds(new Set(ids));
  }, [items]);

  const clearSelection = useCallback(() => setSelectedJobIds(new Set()), []);

  const handleExportZip = useCallback(async () => {
    if (selectedJobIds.size === 0 || exportInFlightRef.current) return;
    exportInFlightRef.current = true;
    const localZipJobId = `zip-content-${Date.now()}`;
    addOptimisticJob({ id: localZipJobId, type: 'zip', thread_id: null });
    flushSync(() => {
      setExportBusy(true);
    });
    try {
      const entries: { name: string; blob: Blob }[] = [];
      let idx = 0;
      for (const job of items) {
        if (!selectedJobIds.has(job.id)) continue;
        for (const ref of job.outputRefs) {
          const blob = await fetchBlobForJobRef(ref);
          idx += 1;
          entries.push({ name: zipEntryName(idx, blob, ref), blob });
        }
      }
      if (entries.length === 0) {
        showToast('content.exportZipError');
        return;
      }
      await zipBlobsAndDownload(entries, `flipo5-content-${new Date().toISOString().slice(0, 10)}`);
    } catch {
      showToast('content.exportZipError');
    } finally {
      removeOptimisticJob(localZipJobId);
      exportInFlightRef.current = false;
      setExportBusy(false);
    }
  }, [items, selectedJobIds, showToast, addOptimisticJob, removeOptimisticJob]);

  const handleDeleteFromModal = useCallback((targetRef: string) => {
    setItems((prev) =>
      prev
        .map((item) => ({ ...item, outputRefs: item.outputRefs.filter((u) => u !== targetRef) }))
        .filter((item) => item.outputRefs.length > 0)
    );
    setViewingMedia((prev) => {
      if (!prev) return prev;
      const nextRaw = prev.downloadUrls.filter((u) => u !== targetRef);
      if (nextRaw.length === 0) return null;
      const tok = mediaTokenRef.current;
      return {
        downloadUrls: nextRaw,
        urls: nextRaw.map((r) => displayForRef(r, tok)),
      };
    });
  }, []);

  const fetchContent = useCallback(() => {
    const cacheKey = `${page}:${typeFilter}:${searchQ}`;
    const cached = contentCacheRef.current;
    const isFresh = cached && cached.key === cacheKey && Date.now() - cached.at < CONTENT_CACHE_MS;
    if (isFresh && cached) {
      setItems(cached.items);
      setTotal(cached.total);
      setListError(null);
      listContent({
        page,
        limit: PAGE_SIZE,
        type: typeFilter === 'image' || typeFilter === 'video' ? typeFilter : '',
        q: searchQ || undefined,
      })
        .then((r) => {
          const jobs = (r.jobs ?? []).map((j) => ({ ...j, outputRefs: extractOutputRefs(j) }));
          contentCacheRef.current = { key: cacheKey, items: jobs, total: r.total ?? 0, at: Date.now() };
          setItems(jobs);
          setTotal(r.total ?? 0);
        })
        .catch(() => {});
      return () => {};
    }
    let cancelled = false;
    setLoading(true);
    setListError(null);
    listContent({
      page,
      limit: PAGE_SIZE,
      type: typeFilter === 'image' || typeFilter === 'video' ? typeFilter : '',
      q: searchQ || undefined,
    })
      .then((r) => {
        if (cancelled) return;
        const jobs = (r.jobs ?? []).map((j) => ({ ...j, outputRefs: extractOutputRefs(j) }));
        contentCacheRef.current = { key: cacheKey, items: jobs, total: r.total ?? 0, at: Date.now() };
        setItems(jobs);
        setTotal(r.total ?? 0);
      })
      .catch(() => {
        if (cancelled) return;
        setItems([]);
        setTotal(0);
        setListError(t(locale, 'content.loadError'));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [page, typeFilter, searchQ, locale]);

  useEffect(() => {
    const cleanup = fetchContent();
    return cleanup;
  }, [fetchContent]);

  useEffect(() => {
    setSelectedJobIds(new Set());
  }, [page, typeFilter, searchQ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  const selectionToolbar = useMemo(() => {
    if (!items.length) return null;
    const n = selectedJobIds.size;
    return (
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          type="button"
          onClick={selectAllOnPage}
          className={buttonClassName({
            variant: 'secondary',
            className: 'px-3 py-2 rounded-lg text-sm border-theme-border bg-theme-bg-subtle text-theme-fg-muted hover:bg-theme-bg-hover',
          })}
        >
          {t(locale, 'content.selectPage')}
        </button>
        {n > 0 ? (
          <button
            type="button"
            onClick={clearSelection}
            className={buttonClassName({
              variant: 'secondary',
              className: 'px-3 py-2 rounded-lg text-sm border-theme-border bg-theme-bg-subtle text-theme-fg-muted hover:bg-theme-bg-hover',
            })}
          >
            {t(locale, 'content.clearSelection')}
          </button>
        ) : null}
        <button
          type="button"
          disabled={n === 0 || exportBusy}
          onClick={handleExportZip}
          className={buttonClassName({
            variant: 'secondary',
            className: `px-3 py-2 rounded-lg text-sm font-medium border-theme-border-hover ${
              n === 0 || exportBusy ? 'opacity-50 pointer-events-none' : 'bg-theme-accent-muted text-theme-accent hover:bg-theme-accent-hover'
            }`,
          })}
        >
          {exportBusy ? t(locale, 'content.exportZipBusy') : t(locale, 'content.exportZip')}
        </button>
        {n > 0 ? <span className="text-xs text-theme-fg-subtle">{n} selected</span> : null}
      </div>
    );
  }, [items.length, selectedJobIds.size, exportBusy, locale, selectAllOnPage, clearSelection, handleExportZip]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 scrollbar-subtle">
      <h1 className="text-xl font-semibold text-theme-fg mb-4 md:mb-6">{t(locale, 'content.title')}</h1>

      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-4 md:mb-6">
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
          <Input
            key={`${searchQ}-${typeFilter}`}
            name="q"
            type="search"
            placeholder={t(locale, 'content.searchPlaceholder')}
            defaultValue={searchQ}
            className="pl-10 pr-4 py-2.5 rounded-xl"
          />
        </form>
        <div className="flex flex-wrap gap-2">
          {(['', 'image', 'video'] as const).map((typeVal) => (
            <a
              key={typeVal || 'all'}
              href={`/dashboard/content?${new URLSearchParams({
                ...(searchQ && { q: searchQ }),
                ...(typeVal && { type: typeVal }),
              }).toString()}`}
              className={buttonClassName({
                variant: 'secondary',
                className: `px-4 py-2.5 rounded-xl min-h-[44px] ${
                  typeFilter === typeVal
                    ? 'bg-theme-bg-hover-strong text-theme-fg border-theme-border-hover'
                    : 'bg-theme-bg-subtle text-theme-fg-muted border-theme-border-subtle hover:bg-theme-bg-hover hover:text-theme-fg'
                }`,
              })}
            >
              {typeVal === '' ? t(locale, 'content.all') : typeVal === 'image' ? t(locale, 'content.images') : t(locale, 'content.videos')}
            </a>
          ))}
        </div>
      </div>

      {loading && <p className="text-theme-fg-subtle py-4 animate-pulse-subtle">{t(locale, 'common.loading')}</p>}
      {!loading && listError && (
        <div className="py-8 flex flex-col items-center gap-4">
          <p className="text-theme-danger text-center">{listError}</p>
          <button
            type="button"
            onClick={() => fetchContent()}
            className={buttonClassName({
              variant: 'secondary',
              className: 'btn-tap px-4 py-2.5 rounded-xl border-theme-border-hover bg-theme-bg-hover text-theme-fg hover:bg-theme-bg-hover-strong',
            })}
          >
            {t(locale, 'content.retry')}
          </button>
        </div>
      )}
      {!loading && !listError && items.length === 0 && (
        <div className="py-12 flex flex-col items-center gap-6 text-center">
          <p className="text-theme-fg-muted max-w-sm">{t(locale, 'content.empty')}</p>
          <Link
            href="/dashboard"
            className={buttonClassName({
              variant: 'secondary',
              className: 'btn-tap inline-block px-5 py-2.5 rounded-xl bg-theme-bg-hover-strong text-theme-fg border-theme-border-hover hover:bg-theme-bg-hover',
            })}
          >
            {t(locale, 'content.emptyCta')}
          </Link>
        </div>
      )}
      {!loading && !listError && items.length > 0 && (
        <>
          {selectionToolbar}
          <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {items.map((job, i) => {
              const thumb = displayForRef(job.outputRefs[0] ?? '', mediaToken);
              const checked = selectedJobIds.has(job.id);
              return (
                <motion.li
                  key={job.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, delay: Math.min(i * 0.02, 0.12) }}
                  className="flex flex-col gap-1.5 relative"
                >
                  {(job.type === 'image' || job.type === 'video' || job.type === 'upscale') ? (
                    <>
                      <label className="absolute top-2 left-2 z-20 flex items-center justify-center w-8 h-8 rounded-md bg-theme-bg-elevated/90 border border-theme-border cursor-pointer shadow-sm">
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-theme-accent"
                          checked={checked}
                          onChange={() => toggleJobSelected(job.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const raw = job.outputRefs;
                          const display = raw.map((r) => displayForRef(r, mediaToken));
                          setViewingMedia({
                            urls: display,
                            downloadUrls: raw,
                          });
                        }}
                        className="btn-tap w-full text-left rounded-xl border border-theme-border bg-theme-bg-subtle overflow-hidden hover:bg-theme-bg-hover hover:border-theme-border-hover group"
                      >
                        <div className="aspect-square relative bg-theme-bg-elevated">
                          {thumb ? (
                            job.type === 'video' ? (
                              <video
                                src={thumb}
                                className="w-full h-full object-cover"
                                muted
                                preload="metadata"
                                playsInline
                              />
                            ) : (
                              <img src={thumb} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                            )
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-theme-fg-subtle">
                              {job.type === 'video' ? <VideoIcon className="w-12 h-12" /> : <ImageIcon className="w-12 h-12" />}
                            </div>
                          )}
                          {job.type === 'upscale' && (
                            <span className="absolute top-1.5 right-1.5 px-2 py-0.5 rounded-md text-[10px] font-medium bg-theme-bg-elevated/95 text-theme-fg border border-theme-border shadow-sm">
                              {t(locale, 'content.upscaled')}
                            </span>
                          )}
                          <div className="absolute inset-0 bg-theme-bg-overlay opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="text-sm font-medium text-theme-fg px-3 py-1.5 rounded-lg bg-theme-bg-hover-strong">
                              {t(locale, 'content.view')}
                            </span>
                          </div>
                        </div>
                      </button>
                    </>
                  ) : null}
                  {getJobDisplayName(job) && (
                    <p className="text-xs text-theme-fg-subtle truncate px-0.5" title={getJobDisplayName(job)}>
                      {getJobDisplayName(job)}
                    </p>
                  )}
                </motion.li>
              );
            })}
          </ul>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              <a
                href={`/dashboard/content?${new URLSearchParams({
                  page: String(page - 1),
                  ...(searchQ && { q: searchQ }),
                  ...(typeFilter && { type: typeFilter }),
                }).toString()}`}
                className={buttonClassName({
                  variant: 'secondary',
                  className: `px-4 py-2 rounded-lg ${
                    hasPrev ? 'bg-theme-bg-hover text-theme-fg hover:bg-theme-bg-hover-strong' : 'bg-theme-bg-subtle text-theme-fg-subtle pointer-events-none'
                  }`,
                })}
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
                className={buttonClassName({
                  variant: 'secondary',
                  className: `px-4 py-2 rounded-lg ${
                    hasNext ? 'bg-theme-bg-hover text-theme-fg hover:bg-theme-bg-hover-strong' : 'bg-theme-bg-subtle text-theme-fg-subtle pointer-events-none'
                  }`,
                })}
              >
                {t(locale, 'content.next')}
              </a>
            </div>
          )}
        </>
      )}

      {viewingMedia && viewingMedia.urls[0] && (
        <ImageViewModal
          url={viewingMedia.urls[0]}
          urls={viewingMedia.urls.length > 1 ? viewingMedia.urls : undefined}
          downloadUrls={viewingMedia.downloadUrls}
          onDelete={handleDeleteFromModal}
          onClose={() => setViewingMedia(null)}
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

function ImageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
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
