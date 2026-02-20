'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale } from '@/app/components/LocaleContext';
import { createUpscale, listContent, uploadAttachments } from '@/lib/api';
import { getOutputUrls } from '@/lib/jobOutput';
import { t } from '@/lib/i18n';
import { JobCard } from '../components/JobCard';

type Scale = 2 | 4;

export default function UpscalingPage() {
  const { locale } = useLocale();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<'upload' | 'content'>('upload');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [scale, setScale] = useState<Scale>(2);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [contentImages, setContentImages] = useState<{ url: string }[]>([]);
  const [contentLoading, setContentLoading] = useState(false);

  const loadContentImages = useCallback(() => {
    setContentLoading(true);
    listContent({ page: 1, limit: 24, type: 'image' })
      .then((r) => {
        const urls: { url: string }[] = [];
        (r.jobs ?? []).forEach((j) => {
          if (j.status === 'completed' && j.output) {
            getOutputUrls(j.output).forEach((u) => urls.push({ url: u }));
          }
        });
        setContentImages(urls);
      })
      .catch(() => setContentImages([]))
      .finally(() => setContentLoading(false));
  }, []);

  useEffect(() => {
    if (source === 'content') loadContentImages();
  }, [source, loadContentImages]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) {
      setError(t(locale, 'upscaling.selectImage'));
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const urls = await uploadAttachments([file]);
      if (urls[0]) setImageUrl(urls[0]);
      else setError('Upload failed');
    } catch {
      setError('Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (source !== 'upload') return;
    const file = e.dataTransfer.files?.[0];
    if (file?.type.startsWith('image/')) {
      const fakeEvent = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFile(fakeEvent);
    }
  };

  const handleUpscale = async () => {
    if (!imageUrl) {
      setError(t(locale, 'upscaling.selectImage'));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const { job_id } = await createUpscale(imageUrl, scale);
      setJobId(job_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upscale failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-subtle flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-2xl">
        <h1 className="text-xl font-semibold text-theme-fg mb-6">{t(locale, 'upscaling.title')}</h1>

        {/* Top: dashed-border upload / preview zone — no fill, sleek border only */}
        <div
          className="relative rounded-2xl border-2 border-dashed border-theme-border min-h-[220px] flex flex-col items-center justify-center p-6 transition-colors hover:border-theme-border-hover bg-transparent"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFile}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-0"
            disabled={uploading}
          />
          {imageUrl ? (
            <div className="relative w-full max-h-[280px] flex justify-center">
              <img src={imageUrl} alt="" className="max-h-[280px] w-auto object-contain rounded-lg" />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setImageUrl(null); setError(null); }}
                className="absolute -top-1 -right-1 w-8 h-8 rounded-full border border-theme-border bg-theme-bg-elevated text-theme-fg shadow-sm flex items-center justify-center hover:bg-theme-bg-hover z-10"
                aria-label="Remove"
              >
                <span className="text-lg leading-none">×</span>
              </button>
            </div>
          ) : (
            <div
              className="text-center cursor-pointer z-[1]"
              onClick={() => source === 'upload' && fileInputRef.current?.click()}
              onKeyDown={(e) => e.key === 'Enter' && source === 'upload' && fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
            >
              {uploading ? (
                <p className="text-theme-fg-subtle">{t(locale, 'common.loading')}</p>
              ) : (
                <>
                  <UploadIcon className="w-12 h-12 mx-auto text-theme-fg-muted mb-3" />
                  <p className="text-theme-fg font-medium">{t(locale, 'upscaling.uploadHint')}</p>
                  <p className="text-sm text-theme-fg-subtle mt-1">{t(locale, 'upscaling.dragOrClick')}</p>
                </>
              )}
            </div>
          )}
          {!imageUrl && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setSource(source === 'content' ? 'upload' : 'content'); setError(null); }}
              className="mt-4 text-sm text-theme-fg-muted hover:text-theme-fg underline underline-offset-2 z-[1]"
            >
              {source === 'content' ? t(locale, 'upscaling.switchToUpload') : t(locale, 'upscaling.fromContent')}
            </button>
          )}
        </div>

        {/* Gallery when "From content" and no image yet */}
        {source === 'content' && !imageUrl && (
          <div className="mt-4">
            <p className="text-sm font-medium text-theme-fg mb-2">{t(locale, 'upscaling.pickFromContent')}</p>
            {contentLoading && <p className="text-sm text-theme-fg-subtle">{t(locale, 'common.loading')}</p>}
            {!contentLoading && contentImages.length === 0 && (
              <p className="text-sm text-theme-fg-subtle">{t(locale, 'upscaling.noImages')}</p>
            )}
            {!contentLoading && contentImages.length > 0 && (
              <ul className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {contentImages.map((item, i) => (
                  <li key={`${item.url}-${i}`}>
                    <button
                      type="button"
                      onClick={() => { setImageUrl(item.url); setError(null); }}
                      className="w-full aspect-square rounded-lg border-2 border-theme-border overflow-hidden hover:border-theme-border-hover transition-all focus:outline-none focus:ring-2 focus:ring-theme-border-hover/50"
                    >
                      <img src={item.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Bottom: options */}
        <div className="mt-8 pt-6 border-t border-theme-border space-y-5">
          <div>
            <p className="text-sm font-medium text-theme-fg mb-2">{t(locale, 'upscaling.scale')}</p>
            <div className="flex gap-2">
              {([2, 4] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScale(s)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${
                    scale === s ? 'bg-theme-bg-hover-strong text-theme-fg border-theme-border-hover' : 'bg-theme-bg-subtle text-theme-fg border-theme-border hover:bg-theme-bg-hover'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="button"
            onClick={handleUpscale}
            disabled={!imageUrl || submitting}
            className="px-6 py-2.5 rounded-xl border border-theme-border-hover bg-theme-bg-hover-strong text-theme-fg font-medium disabled:opacity-50 disabled:pointer-events-none hover:bg-theme-bg-hover"
          >
            {submitting ? t(locale, 'common.loading') : t(locale, 'upscaling.upscale')}
          </button>
        </div>

        {jobId && (
          <div className="mt-8 pt-8 border-t border-theme-border">
            <h2 className="text-lg font-medium text-theme-fg mb-4">{t(locale, 'upscaling.result')}</h2>
            <JobCard jobId={jobId} locale={locale} onNotFound={() => setJobId(null)} />
          </div>
        )}
      </div>
    </div>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  );
}
