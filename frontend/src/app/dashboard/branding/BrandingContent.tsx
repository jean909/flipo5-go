'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale } from '@/app/components/LocaleContext';
import { useToast } from '@/app/components/ToastContext';
import { t } from '@/lib/i18n';
import {
  createBranding,
  createImage,
  createLogoJob,
  uploadAttachments,
  getToken,
  getMediaDisplayUrl,
  getJob,
  fetchBlobForJobRef,
  type BrandingDNA,
  type BrandingJobRef,
} from '@/lib/api';
import { getOutputUrls, getOutputRefs } from '@/lib/jobOutput';
import { zipBlobsAndDownload, fetchBlobsConcurrent } from '@/lib/zipExport';
import { exportBrandBookPdf } from './brandBookPdf';
import { useJobsInProgress } from '../components/JobsInProgressContext';
import type { Locale } from '@/lib/i18n';

type LocalPreview = { file: File; previewUrl: string };

type PackItem = BrandingJobRef & {
  status: 'queued' | 'processing' | 'completed' | 'failed';
  urls: string[];
  error?: string;
  regenerating?: boolean;
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
  const [zipBusy, setZipBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [includeVideo, setIncludeVideo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const packRef = useRef<PackItem[]>([]);
  packRef.current = pack;

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

  const tickPoll = useCallback(async () => {
    const items = packRef.current;
    const pending = items.filter((i) => i.status === 'queued' || i.status === 'processing');
    if (pending.length === 0) {
      stopPoll();
      return;
    }
    const results = await Promise.all(
      pending.map(async (item) => {
        try {
          const job = await getJob(item.job_id);
          if (!job) return null;
          const status = mapJobStatus(job.status);
          const refs = getOutputRefs(job.output ?? null);
          const urls = getOutputUrls(job.output ?? null);
          return { job_id: item.job_id, status, urls: refs.length > 0 ? refs : urls, error: job.error || undefined };
        } catch {
          return null;
        }
      })
    );
    const byId = new Map(results.filter(Boolean).map((r) => [r!.job_id, r!]));
    if (byId.size === 0) return;
    setPack((prev) =>
      prev.map((item) => {
        const upd = byId.get(item.job_id);
        if (!upd) return item;
        if (upd.status === 'completed' || upd.status === 'failed') {
          removeOptimisticJob(item.job_id);
        }
        return { ...item, status: upd.status, urls: upd.urls, error: upd.error };
      })
    );
  }, [removeOptimisticJob]);

  const ensurePolling = useCallback(() => {
    if (pollRef.current) return;
    void tickPoll();
    pollRef.current = setInterval(() => void tickPoll(), 2500);
  }, [tickPoll]);

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

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('toast.copied');
    } catch {
      /* clipboard unavailable */
    }
  };

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
        include_video: includeVideo,
      });
      setDna(result.dna);
      const items: PackItem[] = (result.jobs ?? []).map((j) => ({
        ...j,
        status: 'queued',
        urls: [],
      }));
      setPack(items);
      packRef.current = items;
      items.forEach((j) => {
        if (j.type === 'image' || j.type === 'logo') {
          addOptimisticJob({ id: j.job_id, type: 'image' });
        }
      });
      showToast('toast.created');
      ensurePolling();
    } catch (e) {
      setError(e instanceof Error ? e.message : t(locale, 'branding.failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async (item: PackItem) => {
    if (!item.prompt || item.regenerating) return;
    setPack((prev) => prev.map((p) => (p.job_id === item.job_id ? { ...p, regenerating: true } : p)));
    try {
      let newJobId: string;
      if (item.type === 'logo') {
        const r = await createLogoJob({
          prompt: item.prompt,
          logo_text: dna?.brand_name || '',
          style: dna?.tone || '',
          primary_color: dna?.colors?.primary || '',
          secondary_color: dna?.colors?.secondary || '',
          aspect_ratio: item.aspect_ratio || '1:1',
        });
        newJobId = r.job_id;
      } else {
        const r = await createImage({
          prompt: item.prompt,
          aspectRatio: item.aspect_ratio || '1:1',
          maxImages: 1,
        });
        newJobId = r.job_id;
      }
      addOptimisticJob({ id: newJobId, type: 'image' });
      setPack((prev) =>
        prev.map((p) =>
          p.job_id === item.job_id
            ? { ...p, job_id: newJobId, status: 'queued', urls: [], error: undefined, regenerating: false }
            : p
        )
      );
      ensurePolling();
    } catch (e) {
      setPack((prev) => prev.map((p) => (p.job_id === item.job_id ? { ...p, regenerating: false } : p)));
      setError(e instanceof Error ? e.message : t(locale, 'branding.failed'));
    }
  };

  const handleDownloadAll = async () => {
    if (zipBusy) return;
    const done = pack.filter((p) => p.status === 'completed' && p.urls[0]);
    if (done.length === 0) return;
    setZipBusy(true);
    try {
      const { entries } = await fetchBlobsConcurrent(
        done.map((d) => d.urls[0]),
        fetchBlobForJobRef,
      );
      const named = entries.map((e, i) => {
        const item = done[done.findIndex((d) => d.urls[0] === e.ref)];
        const label = item?.label || `asset-${i + 1}`;
        const ext = e.blob.type.includes('mp4') || e.blob.type.includes('video')
          ? 'mp4'
          : e.blob.type.includes('png') ? 'png' : e.blob.type.includes('webp') ? 'webp' : 'jpg';
        return { name: `${slug(label)}.${ext}`, blob: e.blob };
      });
      if (named.length === 0) throw new Error('Download failed');
      await zipBlobsAndDownload(named, `${slug(dna?.brand_name || 'brand')}-pack`);
      showToast('toast.downloaded');
    } catch {
      setError(t(locale, 'branding.zipFailed'));
    } finally {
      setZipBusy(false);
    }
  };

  const handleExportPdf = async () => {
    if (!dna || pdfBusy) return;
    setPdfBusy(true);
    try {
      const imageItems = pack.filter((p) => p.status === 'completed' && p.urls[0] && p.type !== 'video');
      const { entries } = await fetchBlobsConcurrent(
        imageItems.map((d) => d.urls[0]),
        fetchBlobForJobRef,
      );
      const blobByRef = new Map(entries.map((e) => [e.ref, e.blob]));
      const assets = pack
        .filter((p) => p.type !== 'video')
        .map((p) => ({
          label: p.label,
          caption: p.caption,
          hashtags: p.hashtags,
          blob: p.urls[0] ? blobByRef.get(p.urls[0]) : undefined,
        }));
      await exportBrandBookPdf(dna, assets, `${slug(dna.brand_name || 'brand')}-brand-book`);
      showToast('toast.downloaded');
    } catch {
      setError(t(locale, 'branding.pdfFailed'));
    } finally {
      setPdfBusy(false);
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

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeVideo}
              onChange={(e) => setIncludeVideo(e.target.checked)}
              className="w-4 h-4 rounded border-theme-border accent-[var(--theme-accent,#c45c26)]"
            />
            <span className="text-sm text-theme-fg">{t(locale, 'branding.includeVideo')}</span>
            <span className="text-xs text-theme-fg-subtle">{t(locale, 'branding.includeVideoHint')}</span>
          </label>

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
                {dna.tagline && (
                  <button
                    type="button"
                    onClick={() => void copyText(dna.tagline!)}
                    className="text-sm text-theme-fg-muted mt-0.5 hover:text-theme-fg text-left"
                    title={t(locale, 'branding.copy')}
                  >
                    {dna.tagline}
                  </button>
                )}
              </div>
              <Link href="/dashboard/files" className="text-xs text-theme-accent hover:underline">
                {t(locale, 'branding.seeInFiles')}
              </Link>
            </div>

            {(dna.tagline_variants?.length ?? 0) > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-theme-fg-subtle mb-2">{t(locale, 'branding.taglines')}</p>
                <div className="flex flex-wrap gap-2">
                  {dna.tagline_variants!.filter(Boolean).map((v, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => void copyText(v)}
                      className="px-3 py-1.5 rounded-full border border-theme-border bg-theme-bg text-xs text-theme-fg hover:bg-theme-bg-hover transition-colors"
                      title={t(locale, 'branding.copy')}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            )}

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
                      <button
                        key={key}
                        type="button"
                        onClick={() => void copyText(hex)}
                        className="flex items-center gap-2 group"
                        title={t(locale, 'branding.copy')}
                      >
                        <span
                          className="w-8 h-8 rounded-lg border border-theme-border shrink-0"
                          style={{ backgroundColor: hex }}
                        />
                        <div className="text-xs text-left">
                          <p className="text-theme-fg-muted capitalize">{key}</p>
                          <p className="font-mono text-theme-fg group-hover:text-theme-accent">{hex}</p>
                        </div>
                      </button>
                    ) : null
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {(dna?.campaigns?.length ?? 0) > 0 && (
          <section className="rounded-2xl border border-theme-border bg-theme-bg-subtle p-4 md:p-5">
            <h2 className="text-sm font-semibold text-theme-fg mb-3">{t(locale, 'branding.campaigns')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {dna!.campaigns!.filter((c) => c.title).map((c, i) => (
                <div key={i} className="rounded-xl border border-theme-border bg-theme-bg p-3.5 flex flex-col gap-1.5">
                  <p className="text-sm font-medium text-theme-fg">{c.title}</p>
                  <p className="text-xs text-theme-fg-muted flex-1">{c.concept}</p>
                  {c.cta && (
                    <p className="text-xs text-theme-accent font-medium">{c.cta}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {pack.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-sm font-semibold text-theme-fg">
                {t(locale, 'branding.pack')} ({completedCount}/{pack.length})
              </h2>
              <div className="flex items-center gap-3">
                {dna && (
                  <button
                    type="button"
                    onClick={() => void handleExportPdf()}
                    disabled={pdfBusy}
                    className="text-xs rounded-lg bg-theme-accent px-3 py-1.5 text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    {pdfBusy ? t(locale, 'branding.pdfPreparing') : t(locale, 'branding.exportPdf')}
                  </button>
                )}
                {completedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => void handleDownloadAll()}
                    disabled={zipBusy}
                    className="text-xs rounded-lg border border-theme-border bg-theme-bg px-3 py-1.5 text-theme-fg hover:bg-theme-bg-hover disabled:opacity-50 transition-colors"
                  >
                    {zipBusy ? t(locale, 'branding.zipPreparing') : t(locale, 'branding.downloadAll')}
                  </button>
                )}
                <Link href="/dashboard/content" className="text-xs text-theme-accent hover:underline">
                  {t(locale, 'branding.seeInContent')}
                </Link>
              </div>
            </div>
            {pack.length > 0 && completedCount < pack.length && (
              <div className="h-1.5 rounded-full bg-theme-bg-hover overflow-hidden">
                <div
                  className="h-full bg-theme-accent transition-all duration-500"
                  style={{ width: `${Math.max(4, Math.round((completedCount / pack.length) * 100))}%` }}
                />
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {pack.map((item) => (
                <AssetCard
                  key={item.job_id}
                  item={item}
                  mediaToken={mediaToken}
                  locale={locale}
                  onCopy={copyText}
                  onRegenerate={() => void handleRegenerate(item)}
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
  locale,
  onCopy,
  onRegenerate,
}: {
  item: PackItem;
  mediaToken: string | null;
  locale: Locale;
  onCopy: (text: string) => Promise<void>;
  onRegenerate: () => void;
}) {
  const [captionOpen, setCaptionOpen] = useState(false);
  const url = item.urls[0];
  const display = url && mediaToken ? getMediaDisplayUrl(url, mediaToken) || url : url;
  const captionFull = [item.caption, item.hashtags].filter(Boolean).join('\n\n');
  const isVideo = item.type === 'video';

  const handleDownload = async () => {
    if (!url) return;
    try {
      const blob = await fetchBlobForJobRef(url);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${slug(item.label)}.${isVideo ? 'mp4' : 'png'}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="rounded-xl border border-theme-border bg-theme-bg-subtle overflow-hidden flex flex-col">
      <div className={`${isVideo ? 'aspect-video' : 'aspect-square'} bg-theme-bg flex items-center justify-center relative`}>
        {display && item.status === 'completed' ? (
          isVideo ? (
            <video src={display} controls playsInline className="w-full h-full object-contain bg-black" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={display} alt={item.label} className="w-full h-full object-cover" loading="lazy" />
          )
        ) : (
          <div className="text-center px-3">
            <p className="text-xs text-theme-fg-muted animate-pulse-subtle">{statusLabel(locale, item.status)}</p>
            {isVideo && item.status !== 'failed' && (
              <p className="text-[10px] text-theme-fg-subtle mt-1">{t(locale, 'branding.videoSlow')}</p>
            )}
            {item.error && <p className="text-[10px] text-red-500 mt-1 line-clamp-2">{item.error}</p>}
          </div>
        )}
      </div>
      <div className="p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-theme-fg truncate">{item.label}</p>
            {item.aspect_ratio && (
              <p className="text-[10px] text-theme-fg-subtle">{item.aspect_ratio}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {(item.status === 'completed' || item.status === 'failed') && item.prompt && !isVideo && (
              <button
                type="button"
                onClick={onRegenerate}
                disabled={item.regenerating}
                className="text-xs text-theme-fg-muted hover:text-theme-fg disabled:opacity-50"
                title={t(locale, 'branding.regenerate')}
              >
                {item.regenerating ? '…' : t(locale, 'branding.regenerate')}
              </button>
            )}
            {item.status === 'completed' && url && (
              <button
                type="button"
                onClick={() => void handleDownload()}
                className="text-xs text-theme-accent hover:underline"
              >
                {t(locale, 'branding.download')}
              </button>
            )}
          </div>
        </div>
        {captionFull && (
          <div className="border-t border-theme-border pt-2">
            <button
              type="button"
              onClick={() => setCaptionOpen((v) => !v)}
              className="flex items-center justify-between w-full text-[11px] font-medium text-theme-fg-muted hover:text-theme-fg"
            >
              <span>{t(locale, 'branding.caption')}</span>
              <span>{captionOpen ? '−' : '+'}</span>
            </button>
            {captionOpen && (
              <div className="mt-1.5 space-y-1.5">
                <p className="text-xs text-theme-fg whitespace-pre-wrap">{item.caption}</p>
                {item.hashtags && <p className="text-xs text-theme-accent break-words">{item.hashtags}</p>}
                <button
                  type="button"
                  onClick={() => void onCopy(captionFull)}
                  className="text-[11px] text-theme-accent hover:underline"
                >
                  {t(locale, 'branding.copyCaption')}
                </button>
              </div>
            )}
          </div>
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
