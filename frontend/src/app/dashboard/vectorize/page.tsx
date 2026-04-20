'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale } from '@/app/components/LocaleContext';
import { useToast } from '@/app/components/ToastContext';
import { t } from '@/lib/i18n';
import {
  uploadAttachments,
  vectorizeImage,
  listContent,
  getToken,
  getMediaDisplayUrl,
  type Job,
} from '@/lib/api';
import { getOutputUrls } from '@/lib/jobOutput';

type Mode = 'color' | 'binary';
type Source =
  | { kind: 'upload'; file: File; previewUrl: string }
  | { kind: 'remote'; url: string; displayUrl: string };

const PAGE_SIZE = 30;

export default function VectorizePage() {
  const { locale } = useLocale();
  const { showToast } = useToast();

  const [source, setSource] = useState<Source | null>(null);
  const [mode, setMode] = useState<Mode>('color');
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [svgBlobUrl, setSvgBlobUrl] = useState<string | null>(null);
  const [svgDownloadName, setSvgDownloadName] = useState('flipo5-vector.svg');

  const [mediaToken, setMediaToken] = useState<string | null>(null);
  const [library, setLibrary] = useState<Job[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getToken().then(setMediaToken);
  }, []);

  const loadLibrary = useCallback(() => {
    setLibraryLoading(true);
    Promise.all([
      listContent({ type: 'image', limit: PAGE_SIZE }).catch(() => ({ jobs: [] as Job[] })),
      listContent({ type: 'logo', limit: PAGE_SIZE }).catch(() => ({ jobs: [] as Job[] })),
    ])
      .then(([imgs, logos]) => {
        const merged = [...(logos.jobs ?? []), ...(imgs.jobs ?? [])].filter(
          (j) => j.status === 'completed'
        );
        setLibrary(merged);
      })
      .finally(() => setLibraryLoading(false));
  }, []);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  useEffect(() => {
    return () => {
      if (source?.kind === 'upload') URL.revokeObjectURL(source.previewUrl);
      if (svgBlobUrl) URL.revokeObjectURL(svgBlobUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetResult = () => {
    if (svgBlobUrl) {
      URL.revokeObjectURL(svgBlobUrl);
      setSvgBlobUrl(null);
    }
    setError(null);
  };

  const selectFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError(t(locale, 'vectorize.invalidFile') || 'Invalid image file');
      return;
    }
    if (source?.kind === 'upload') URL.revokeObjectURL(source.previewUrl);
    resetResult();
    const previewUrl = URL.createObjectURL(file);
    setSource({ kind: 'upload', file, previewUrl });
  };

  const selectFromLibrary = (url: string) => {
    if (source?.kind === 'upload') URL.revokeObjectURL(source.previewUrl);
    resetResult();
    const displayUrl = mediaToken ? getMediaDisplayUrl(url, mediaToken) || url : url;
    setSource({ kind: 'remote', url, displayUrl });
  };

  const clearSource = () => {
    if (source?.kind === 'upload') URL.revokeObjectURL(source.previewUrl);
    setSource(null);
    resetResult();
  };

  const previewUrl = useMemo(() => {
    if (!source) return null;
    return source.kind === 'upload' ? source.previewUrl : source.displayUrl;
  }, [source]);

  const handleVectorize = async () => {
    if (!source || converting) return;
    setConverting(true);
    setError(null);
    if (svgBlobUrl) {
      URL.revokeObjectURL(svgBlobUrl);
      setSvgBlobUrl(null);
    }
    try {
      let remoteUrl: string;
      let baseName: string;
      if (source.kind === 'upload') {
        const [uploaded] = await uploadAttachments([source.file]);
        if (!uploaded) throw new Error('Upload failed');
        remoteUrl = uploaded;
        baseName = source.file.name.replace(/\.[a-z0-9]+$/i, '') || 'flipo5-vector';
      } else {
        remoteUrl = source.url;
        baseName = 'flipo5-vector';
      }
      const blob = await vectorizeImage(remoteUrl, mode);
      const url = URL.createObjectURL(blob);
      setSvgBlobUrl(url);
      setSvgDownloadName(`${baseName}.svg`);
      showToast('toast.downloaded');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vectorize failed');
    } finally {
      setConverting(false);
    }
  };

  const triggerDownload = () => {
    if (!svgBlobUrl) return;
    const a = document.createElement('a');
    a.href = svgBlobUrl;
    a.download = svgDownloadName;
    a.click();
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-subtle px-4 py-6 md:py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-xl font-semibold text-theme-fg mb-1">{t(locale, 'vectorize.title')}</h1>
        <p className="text-sm text-theme-fg-muted mb-6">{t(locale, 'vectorize.sub')}</p>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr,1fr] gap-4">
          {/* LEFT: source picker */}
          <div className="rounded-2xl border border-theme-border bg-theme-bg-subtle p-4 md:p-5">
            <h2 className="text-sm font-semibold text-theme-fg mb-3">{t(locale, 'vectorize.source')}</h2>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) selectFile(f);
                e.target.value = '';
              }}
            />

            <label
              htmlFor=""
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) selectFile(f);
              }}
              className="block cursor-pointer rounded-xl border-2 border-dashed border-theme-border hover:border-theme-border-hover bg-theme-bg p-5 text-center transition-colors"
            >
              <UploadIcon className="w-6 h-6 mx-auto text-theme-fg-subtle mb-2" />
              <p className="text-sm font-medium text-theme-fg">{t(locale, 'vectorize.uploadTitle')}</p>
              <p className="text-xs text-theme-fg-muted mt-1">{t(locale, 'vectorize.uploadHint')}</p>
            </label>

            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-theme-fg-muted">
                  {t(locale, 'vectorize.fromContent')}
                </h3>
                <button
                  type="button"
                  onClick={loadLibrary}
                  disabled={libraryLoading}
                  className="text-xs text-theme-fg-muted hover:text-theme-fg disabled:opacity-50"
                >
                  {libraryLoading ? t(locale, 'common.loading') : t(locale, 'common.refresh') || 'Refresh'}
                </button>
              </div>
              {libraryLoading && library.length === 0 ? (
                <p className="text-sm text-theme-fg-subtle animate-pulse-subtle py-4">{t(locale, 'common.loading')}</p>
              ) : library.length === 0 ? (
                <p className="text-sm text-theme-fg-subtle py-4">{t(locale, 'vectorize.empty')}</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-80 overflow-y-auto scrollbar-subtle pr-1">
                  {library.flatMap((job) => {
                    const urls = getOutputUrls(job.output ?? null);
                    return urls.slice(0, 4).map((url, idx) => {
                      const disp = mediaToken ? getMediaDisplayUrl(url, mediaToken) || url : url;
                      const active =
                        source?.kind === 'remote' && source.url === url;
                      return (
                        <button
                          key={`${job.id}-${idx}`}
                          type="button"
                          onClick={() => selectFromLibrary(url)}
                          className={`aspect-square rounded-lg overflow-hidden border transition-colors ${
                            active
                              ? 'border-theme-accent ring-2 ring-theme-accent/40'
                              : 'border-theme-border hover:border-theme-border-hover'
                          }`}
                        >
                          <img src={disp} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                        </button>
                      );
                    });
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: preview + convert + result */}
          <div className="rounded-2xl border border-theme-border bg-theme-bg-subtle p-4 md:p-5 flex flex-col gap-4">
            <div>
              <h2 className="text-sm font-semibold text-theme-fg mb-3">{t(locale, 'vectorize.preview')}</h2>
              <div className="rounded-xl border border-theme-border bg-theme-bg aspect-square flex items-center justify-center overflow-hidden relative">
                {previewUrl ? (
                  <>
                    <img src={previewUrl} alt="" className="max-w-full max-h-full object-contain" />
                    <button
                      type="button"
                      onClick={clearSource}
                      className="absolute top-2 right-2 min-h-9 min-w-9 rounded-full bg-theme-bg-overlay hover:bg-theme-danger text-theme-fg flex items-center justify-center"
                      aria-label={t(locale, 'common.remove')}
                      title={t(locale, 'common.remove')}
                    >
                      <XIcon className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <p className="text-sm text-theme-fg-subtle text-center px-6">{t(locale, 'vectorize.noSource')}</p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMode('color')}
                className={`btn-tap px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
                  mode === 'color'
                    ? 'border-theme-accent bg-theme-accent/15 text-theme-accent'
                    : 'border-theme-border bg-theme-bg text-theme-fg hover:bg-theme-bg-hover'
                }`}
              >
                {t(locale, 'vectorize.modeColor')}
              </button>
              <button
                type="button"
                onClick={() => setMode('binary')}
                className={`btn-tap px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
                  mode === 'binary'
                    ? 'border-theme-accent bg-theme-accent/15 text-theme-accent'
                    : 'border-theme-border bg-theme-bg text-theme-fg hover:bg-theme-bg-hover'
                }`}
              >
                {t(locale, 'vectorize.modeBinary')}
              </button>
            </div>

            <button
              type="button"
              onClick={handleVectorize}
              disabled={!source || converting}
              className="btn-tap w-full py-2.5 rounded-xl border border-theme-accent bg-theme-accent text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {converting && <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin shrink-0" />}
              {converting ? t(locale, 'vectorize.converting') : t(locale, 'vectorize.convert')}
            </button>

            {error && <p className="text-sm text-theme-danger">{error}</p>}

            {svgBlobUrl && (
              <div className="rounded-xl border border-theme-border bg-theme-bg p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-theme-fg-muted">
                    {t(locale, 'vectorize.result')}
                  </p>
                  <button
                    type="button"
                    onClick={triggerDownload}
                    className="btn-tap px-3 py-1.5 rounded-lg text-xs font-semibold border border-theme-accent bg-theme-accent text-white"
                  >
                    {t(locale, 'vectorize.downloadSvg')}
                  </button>
                </div>
                <div
                  className="aspect-square rounded-lg bg-white flex items-center justify-center overflow-hidden border border-theme-border"
                  style={{ backgroundImage: 'repeating-conic-gradient(#f3f4f6 0% 25%, #e5e7eb 0% 50%)', backgroundSize: '16px 16px' }}
                >
                  <object data={svgBlobUrl} type="image/svg+xml" className="max-w-full max-h-full" aria-label="SVG preview">
                    <img src={svgBlobUrl} alt="" className="max-w-full max-h-full" />
                  </object>
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="text-xs text-theme-fg-subtle mt-6">
          {t(locale, 'vectorize.note')}{' '}
          <Link href="/dashboard/files" className="underline hover:text-theme-fg">{t(locale, 'nav.files')}</Link>
        </p>
      </div>
    </div>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 7.5L12 3m0 0L7.5 7.5M12 3v13.5" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
