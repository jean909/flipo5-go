'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale } from '@/app/components/LocaleContext';
import { useToast } from '@/app/components/ToastContext';
import { t } from '@/lib/i18n';
import {
  createBranding,
  uploadAttachments,
  getToken,
  getMediaDisplayUrl,
  getJob,
  downloadMediaUrl,
  type BrandingDNA,
  type BrandingJobRef,
} from '@/lib/api';
import { getOutputUrls, getOutputRefs } from '@/lib/jobOutput';
import { useJobsInProgress } from '../components/JobsInProgressContext';
import type { Locale } from '@/lib/i18n';

type LocalPreview = { file: File; previewUrl: string };

type PackItem = BrandingJobRef & {
  status: 'queued' | 'processing' | 'completed' | 'failed';
  urls: string[];
  error?: string;
};

export default function BrandingContent() {
  const { locale } = useLocale();
  const { showToast } = useToast();
  const { addOptimisticJob, removeOptimisticJob } = useJobsInProgress();

  const [brandName, setBrandName] = useState('');
  const [description, setDescription] = useState('');
  const [previews, setPreviews] = useState<LocalPreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dna, setDna] = useState<BrandingDNA | null>(null);
  const [pack, setPack] = useState<PackItem[]>([]);
  const [mediaToken, setMediaToken] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getToken().then(setMediaToken);
  }, []);

  useEffect(() => {
    return () => {
      previews.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (list.length === 0) {
      setError(t(locale, 'branding.invalidFile'));
      return;
    }
    setError('');
    setPreviews((prev) => {
      const room = Math.max(0, 6 - prev.length);
      const next = list.slice(0, room).map((file) => ({
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      return [...prev, ...next];
    });
  };

  const removePreview = (idx: number) => {
    setPreviews((prev) => {
      const copy = [...prev];
      const [removed] = copy.splice(idx, 1);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return copy;
    });
  };

  const pollJobs = useCallback((items: PackItem[]) => {
    stopPoll();
    if (items.length === 0) return;

    const tick = async () => {
      let allDone = true;
      const updates: PackItem[] = [];
      for (const item of items) {
        try {
          const job = await getJob(item.job_id);
          if (!job) {
            allDone = false;
            updates.push(item);
            continue;
          }
          const status = mapJobStatus(job.status);
          if (status === 'queued' || status === 'processing') allDone = false;
          const refs = getOutputRefs(job.output ?? null);
          const urls = getOutputUrls(job.output ?? null);
          const display = refs.length > 0 ? refs : urls;
          updates.push({
            ...item,
            status,
            urls: display,
            error: job.error || undefined,
          });
          if (status === 'completed' || status === 'failed') {
            removeOptimisticJob(item.job_id);
          }
        } catch {
          allDone = false;
          updates.push(item);
        }
      }
      setPack(updates);
      if (allDone) stopPoll();
    };

    void tick();
    pollRef.current = setInterval(() => void tick(), 2500);
  }, [removeOptimisticJob]);

  const handleGenerate = async () => {
    const desc = description.trim();
    if (!desc || loading) return;
    setLoading(true);
    setError('');
    setDna(null);
    setPack([]);
    stopPoll();
    try {
      let imageUrls: string[] = [];
      if (previews.length > 0) {
        imageUrls = await uploadAttachments(previews.map((p) => p.file));
      }
      const result = await createBranding({
        description: desc,
        brand_name: brandName.trim() || undefined,
        image_urls: imageUrls,
      });
      setDna(result.dna);
      const items: PackItem[] = (result.jobs ?? []).map((j) => ({
        ...j,
        status: 'queued',
        urls: [],
      }));
      setPack(items);
      items.forEach((j) => {
        if (j.type === 'image' || j.type === 'logo') {
          addOptimisticJob({ id: j.job_id, type: 'image' });
        }
      });
      showToast('toast.created');
      pollJobs(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : t(locale, 'branding.failed'));
    } finally {
      setLoading(false);
    }
  };

  const colors = dna?.colors;
  const completedCount = pack.filter((p) => p.status === 'completed').length;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-subtle px-4 py-6 md:py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-theme-fg mb-1">{t(locale, 'branding.title')}</h1>
          <p className="text-sm text-theme-fg-muted">{t(locale, 'branding.sub')}</p>
        </div>

        <section className="rounded-2xl border border-theme-border bg-theme-bg-subtle p-4 md:p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-theme-fg-muted mb-1.5">{t(locale, 'branding.brandName')}</label>
            <input
              type="text"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder={t(locale, 'branding.brandNamePlaceholder')}
              maxLength={80}
              className="w-full rounded-xl border border-theme-border bg-theme-bg px-3 py-2.5 text-sm text-theme-fg placeholder:text-theme-fg-subtle focus:outline-none focus:ring-2 focus:ring-theme-accent/40"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-theme-fg-muted mb-1.5">{t(locale, 'branding.description')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t(locale, 'branding.descriptionPlaceholder')}
              rows={4}
              maxLength={4000}
              className="w-full rounded-xl border border-theme-border bg-theme-bg px-3 py-2.5 text-sm text-theme-fg placeholder:text-theme-fg-subtle focus:outline-none focus:ring-2 focus:ring-theme-accent/40 resize-y min-h-[100px]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-theme-fg-muted mb-1.5">{t(locale, 'branding.photos')}</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
              }}
              className="w-full rounded-xl border-2 border-dashed border-theme-border hover:border-theme-border-hover bg-theme-bg p-5 text-center transition-colors"
            >
              <UploadIcon className="w-6 h-6 mx-auto text-theme-fg-subtle mb-2" />
              <p className="text-sm font-medium text-theme-fg">{t(locale, 'branding.uploadTitle')}</p>
              <p className="text-xs text-theme-fg-muted mt-1">{t(locale, 'branding.uploadHint')}</p>
            </button>
            {previews.length > 0 && (
              <div className="mt-3 grid grid-cols-3 sm:grid-cols-6 gap-2">
                {previews.map((p, i) => (
                  <div key={p.previewUrl} className="relative aspect-square rounded-lg overflow-hidden border border-theme-border bg-theme-bg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.previewUrl} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePreview(i)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center"
                      aria-label="Remove"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="button"
            disabled={!description.trim() || loading}
            onClick={() => void handleGenerate()}
            className="w-full sm:w-auto rounded-xl bg-theme-accent px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {loading ? t(locale, 'branding.generating') : t(locale, 'branding.generate')}
          </button>
        </section>

        {dna && (
          <section className="rounded-2xl border border-theme-border bg-theme-bg-subtle p-4 md:p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-theme-fg">{dna.brand_name || t(locale, 'branding.dnaTitle')}</h2>
                {dna.tagline && <p className="text-sm text-theme-fg-muted mt-0.5">{dna.tagline}</p>}
              </div>
              <Link href="/dashboard/files" className="text-xs text-theme-accent hover:underline">
                {t(locale, 'branding.seeInFiles')}
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              {dna.tone && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-theme-fg-subtle mb-1">{t(locale, 'branding.tone')}</p>
                  <p className="text-theme-fg">{dna.tone}</p>
                </div>
              )}
              {dna.audience && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-theme-fg-subtle mb-1">{t(locale, 'branding.audience')}</p>
                  <p className="text-theme-fg">{dna.audience}</p>
                </div>
              )}
              {dna.fonts && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-theme-fg-subtle mb-1">{t(locale, 'branding.fonts')}</p>
                  <p className="text-theme-fg">{dna.fonts}</p>
                </div>
              )}
            </div>

            {dna.voice && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-theme-fg-subtle mb-1">{t(locale, 'branding.voice')}</p>
                <p className="text-sm text-theme-fg">{dna.voice}</p>
              </div>
            )}

            {colors && (colors.primary || colors.secondary || colors.accent) && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-theme-fg-subtle mb-2">{t(locale, 'branding.colors')}</p>
                <div className="flex flex-wrap gap-3">
                  {([
                    ['primary', colors.primary],
                    ['secondary', colors.secondary],
                    ['accent', colors.accent],
                  ] as const).map(([key, hex]) =>
                    hex ? (
                      <div key={key} className="flex items-center gap-2">
                        <span
                          className="w-8 h-8 rounded-lg border border-theme-border shrink-0"
                          style={{ backgroundColor: hex }}
                        />
                        <div className="text-xs">
                          <p className="text-theme-fg-muted capitalize">{key}</p>
                          <p className="font-mono text-theme-fg">{hex}</p>
                        </div>
                      </div>
                    ) : null
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {pack.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-theme-fg">
                {t(locale, 'branding.pack')} ({completedCount}/{pack.length})
              </h2>
              <Link href="/dashboard/content" className="text-xs text-theme-accent hover:underline">
                {t(locale, 'branding.seeInContent')}
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {pack.map((item) => (
                <AssetCard
                  key={item.job_id}
                  item={item}
                  mediaToken={mediaToken}
                  localeLabel={statusLabel(locale, item.status)}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function mapJobStatus(status: string): PackItem['status'] {
  if (status === 'completed') return 'completed';
  if (status === 'failed') return 'failed';
  if (status === 'processing' || status === 'running') return 'processing';
  return 'queued';
}

function statusLabel(locale: Locale, status: PackItem['status']): string {
  if (status === 'completed') return t(locale, 'branding.statusDone');
  if (status === 'failed') return t(locale, 'branding.statusFailed');
  if (status === 'processing') return t(locale, 'branding.statusWorking');
  return t(locale, 'branding.statusQueued');
}

function AssetCard({
  item,
  mediaToken,
  localeLabel,
}: {
  item: PackItem;
  mediaToken: string | null;
  localeLabel: string;
}) {
  const url = item.urls[0];
  const display = url && mediaToken ? getMediaDisplayUrl(url, mediaToken) || url : url;

  const handleDownload = async () => {
    if (!url) return;
    try {
      const blob = await downloadMediaUrl(url);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${slug(item.label)}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="rounded-xl border border-theme-border bg-theme-bg-subtle overflow-hidden">
      <div className="aspect-square bg-theme-bg flex items-center justify-center relative">
        {display && item.status === 'completed' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={display} alt={item.label} className="w-full h-full object-cover" />
        ) : (
          <div className="text-center px-3">
            <p className="text-xs text-theme-fg-muted animate-pulse-subtle">{localeLabel}</p>
            {item.error && <p className="text-[10px] text-red-500 mt-1 line-clamp-2">{item.error}</p>}
          </div>
        )}
      </div>
      <div className="p-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-theme-fg truncate">{item.label}</p>
          {item.aspect_ratio && (
            <p className="text-[10px] text-theme-fg-subtle">{item.aspect_ratio}</p>
          )}
        </div>
        {item.status === 'completed' && url && (
          <button
            type="button"
            onClick={() => void handleDownload()}
            className="text-xs text-theme-accent hover:underline shrink-0"
          >
            Download
          </button>
        )}
      </div>
    </div>
  );
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'brand-asset';
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  );
}
