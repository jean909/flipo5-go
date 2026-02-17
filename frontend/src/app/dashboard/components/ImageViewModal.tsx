'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { downloadMediaUrl } from '@/lib/api';
import { VideoPlayer } from './VideoPlayer';

function isVideoUrl(u: string) {
  return /\.(mp4|webm|mov)(\?|$)/i.test(u);
}

interface ImageViewModalProps {
  url: string;
  urls?: string[];
  onClose: () => void;
  locale?: Locale;
}

export function ImageViewModal({ url, urls, onClose, locale = 'en' }: ImageViewModalProps) {
  const list = urls && urls.length > 1 ? urls : [url];
  const [idx, setIdx] = useState(() => Math.max(0, list.indexOf(url)));
  const safeIdx = Math.max(0, Math.min(idx, list.length - 1));
  const currentUrl = list[safeIdx];
  const isVideo = isVideoUrl(currentUrl);
  const hasPrev = safeIdx > 0;
  const hasNext = safeIdx < list.length - 1;

  useEffect(() => {
    if (urls?.length) setIdx(urls.indexOf(url));
  }, [url, urls]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev) setIdx((i) => i - 1);
      if (e.key === 'ArrowRight' && hasNext) setIdx((i) => i + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, hasPrev, hasNext]);

  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const getExt = (blob: Blob, url: string) => {
    if (blob.type.includes('video')) return blob.type.includes('webm') ? 'webm' : 'mp4';
    if (blob.type.includes('png')) return 'png';
    if (blob.type.includes('webp')) return 'webp';
    if (blob.type.includes('gif')) return 'gif';
    if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) return url.toLowerCase().includes('webm') ? 'webm' : 'mp4';
    if (/\.(png|webp|gif)(\?|$)/i.test(url)) return url.match(/\.(png|webp|gif)/i)?.[1]?.toLowerCase() ?? 'jpg';
    return 'jpg';
  };

  const handleSave = useCallback(async () => {
    try {
      let blob: Blob;
      try {
        blob = await downloadMediaUrl(currentUrl);
      } catch {
        const res = await fetch(currentUrl);
        if (!res.ok) throw new Error('Fetch failed');
        blob = await res.blob();
      }
      const ext = getExt(blob, currentUrl);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `flipo5-${Date.now()}.${ext}`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
      }, 100);
    } catch (_) {}
  }, [currentUrl]);

  const handleShare = useCallback(async () => {
    try {
      const res = await fetch(currentUrl);
      const blob = await res.blob();
      const ext = getExt(blob, currentUrl);
      const file = new File([blob], `flipo5.${ext}`, { type: blob.type });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Flipo5' });
      } else {
        await navigator.clipboard.writeText(currentUrl);
      }
    } catch (_) {}
  }, [currentUrl]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t(locale, 'image.viewer')}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 bg-theme-bg-overlay backdrop-blur-md"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative z-10 flex flex-col w-full max-w-4xl max-h-[90vh]">
        <div className="flex items-center justify-between mb-3">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-theme-bg-hover hover:bg-theme-bg-hover-strong flex items-center justify-center text-theme-fg transition-colors"
            aria-label="Close"
          >
            <XIcon className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 rounded-lg bg-theme-bg-hover-strong hover:bg-theme-bg-hover-stronger text-theme-fg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <DownloadIcon className="w-4 h-4" />
              {t(locale, 'image.save')}
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="px-4 py-2 rounded-lg bg-theme-bg-hover-strong hover:bg-theme-bg-hover-stronger text-theme-fg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <ShareIcon className="w-4 h-4" />
              {t(locale, 'image.share')}
            </button>
          </div>
        </div>
        <div className="rounded-xl overflow-hidden bg-theme-bg-overlay flex-1 min-h-0 flex items-center justify-center relative">
          {hasPrev && (
            <button
              type="button"
              onClick={() => setIdx((i) => i - 1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-theme-bg-hover-strong hover:bg-theme-bg-hover-stronger flex items-center justify-center text-theme-fg z-10"
              aria-label="Previous"
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </button>
          )}
          {isVideo ? (
            <VideoPlayer src={currentUrl} className="max-w-full max-h-[calc(90vh-80px)]" autoPlay />
          ) : (
            <img src={currentUrl} alt="" className="max-w-full max-h-[calc(90vh-80px)] object-contain" decoding="async" />
          )}
          {hasNext && (
            <button
              type="button"
              onClick={() => setIdx((i) => i + 1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-theme-bg-hover-strong hover:bg-theme-bg-hover-stronger flex items-center justify-center text-theme-fg z-10"
              aria-label="Next"
            >
              <ChevronRightIcon className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}
function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}
function ShareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
    </svg>
  );
}
