'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { useLocale } from '@/app/components/LocaleContext';
import { listContent, type Job } from '@/lib/api';
import { t } from '@/lib/i18n';
import { getOutputUrls } from '@/lib/jobOutput';
import { ImageViewModal } from '../components/ImageViewModal';

type MediaItem = Job & { mediaUrls: string[] };

function extractMedia(job: Job): string[] {
  if (job.status !== 'completed') return [];
  return getOutputUrls(job.output).filter((u) => typeof u === 'string' && u.startsWith('http'));
}

export default function CollectionsContent() {
  const { locale } = useLocale();
  const galleryRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<{ urls: string[]; type: string } | null>(null);

  const fetchAll = useCallback(() => {
    setLoading(true);
    listContent({ page: 1, limit: 60 })
      .then((r) => {
        const mapped = (r.jobs ?? [])
          .map((j) => ({ ...j, mediaUrls: extractMedia(j) }))
          .filter((j) => j.mediaUrls.length > 0 && (j.type === 'image' || j.type === 'video' || j.type === 'upscale'));
        setItems(mapped);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Auto-scroll to gallery — like the chat scroll-to-bottom behaviour
  useEffect(() => {
    if (!loading && items.length > 0 && galleryRef.current) {
      requestAnimationFrame(() => {
        galleryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }, [loading, items.length]);

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

      {/* Slim top bar — same as the rest of the dashboard */}
      <div className="shrink-0 flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-theme-border-subtle">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-theme-fg-muted hover:text-theme-fg transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          {t(locale, 'collections.backToDashboard')}
        </Link>
        <span className="text-theme-border-subtle">·</span>
        <h1 className="text-sm font-medium text-theme-fg truncate">{t(locale, 'collections.title')}</h1>
      </div>

      {/* Masonry gallery — scrollable */}
      <div ref={galleryRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-subtle p-2 md:p-4">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <div className="w-6 h-6 rounded-full border-2 border-theme-border border-t-theme-fg-subtle animate-spin" />
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4 md:px-6">
            <p className="text-theme-fg-muted">{t(locale, 'content.empty')}</p>
            <Link
              href="/dashboard"
              className="btn-tap inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-theme-border-hover bg-theme-bg-hover text-theme-fg text-sm font-medium"
            >
              {t(locale, 'content.emptyCta')}
            </Link>
          </div>
        )}

        {!loading && items.length > 0 && (
          <div
            className="masonry-cols"
            style={{
              columns: 'auto 160px',
              gap: '2px',
              padding: '2px',
            }}
          >
            {items.flatMap((job) =>
              job.mediaUrls.map((url, idx) => (
                <button
                  key={`${job.id}-${idx}`}
                  type="button"
                  onClick={() => setViewing({ urls: job.mediaUrls, type: job.type })}
                  className="block w-full relative group overflow-hidden bg-theme-bg-elevated focus:outline-none focus-visible:ring-1 focus-visible:ring-theme-border-hover"
                  style={{ breakInside: 'avoid', marginBottom: '2px', display: 'block' }}
                >
                  {job.type === 'video' ? (
                    <video
                      src={url}
                      className="w-full block"
                      muted
                      preload="metadata"
                      playsInline
                    />
                  ) : (
                    <img
                      src={url}
                      alt=""
                      className="w-full block"
                      loading="lazy"
                      decoding="async"
                    />
                  )}

                  {/* Video badge */}
                  {job.type === 'video' && (
                    <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-black/70 text-white backdrop-blur-sm border border-white/10 pointer-events-none">
                      Video
                    </span>
                  )}

                  {/* Hover overlay */}
                  <span className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors duration-150 pointer-events-none" />
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Media viewer */}
      {viewing && viewing.urls[0] && (
        <ImageViewModal
          url={viewing.urls[0]}
          urls={viewing.urls}
          onClose={() => setViewing(null)}
          locale={locale}
        />
      )}
    </div>
  );
}
