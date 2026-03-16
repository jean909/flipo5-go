'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale } from '@/app/components/LocaleContext';
import { createUpscale, listContent, uploadAttachments, getJob, type UpscaleAdvancedOptions, type Job } from '@/lib/api';
import { getOutputUrls } from '@/lib/jobOutput';
import { t } from '@/lib/i18n';
import { JobCard } from '../components/JobCard';

type Scale = 2 | 4;

const ENHANCE_MODELS = [
  { value: 'Standard V2', key: 'standard' },
  { value: 'Low Resolution V2', key: 'lowres' },
  { value: 'CGI', key: 'cgi' },
  { value: 'High Fidelity V2', key: 'hifi' },
  { value: 'Text Refine', key: 'text' },
] as const;

const defaultAdvanced: UpscaleAdvancedOptions = {
  enhance_model: 'Standard V2',
  output_format: 'jpg',
  face_enhancement: false,
  subject_detection: 'None',
  face_enhancement_creativity: 0,
  face_enhancement_strength: 0.8,
};

export default function UpscalingPage() {
  const { locale } = useLocale();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<'upload' | 'content'>('upload');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [scale, setScale] = useState<Scale>(2);
  const [advanced, setAdvanced] = useState<UpscaleAdvancedOptions>(defaultAdvanced);
  const [showAdvancedDialog, setShowAdvancedDialog] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [resultJob, setResultJob] = useState<Job | null>(null);
  const [contentImages, setContentImages] = useState<{ url: string }[]>([]);
  const [contentLoading, setContentLoading] = useState(false);
  const [latestUpscaled, setLatestUpscaled] = useState<Job[]>([]);
  const [latestLoading, setLatestLoading] = useState(false);

  const loadLatestUpscaled = useCallback(() => {
    setLatestLoading(true);
    listContent({ page: 1, limit: 20, type: 'image' })
      .then((r) => {
        const upscaleJobs = (r.jobs ?? []).filter((j) => j.type === 'upscale').slice(0, 5);
        setLatestUpscaled(upscaleJobs);
      })
      .catch(() => setLatestUpscaled([]))
      .finally(() => setLatestLoading(false));
  }, []);

  useEffect(() => {
    loadLatestUpscaled();
  }, [loadLatestUpscaled]);

  useEffect(() => {
    if (!jobId) {
      setResultJob(null);
      return;
    }
    const id: string = jobId;
    let cancelled = false;
    function poll() {
      getJob(id).then((j) => {
        if (cancelled) return;
        if (j && j.status === 'completed') {
          setResultJob(j);
          loadLatestUpscaled();
          return;
        }
        if (j && (j.status === 'pending' || j.status === 'running')) {
          setTimeout(poll, 2500);
        }
      });
    }
    poll();
    return () => { cancelled = true; };
  }, [jobId, loadLatestUpscaled]);

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
      const opts: UpscaleAdvancedOptions = {
        enhance_model: advanced.enhance_model || defaultAdvanced.enhance_model,
        output_format: advanced.output_format || defaultAdvanced.output_format,
        face_enhancement: advanced.face_enhancement ?? defaultAdvanced.face_enhancement,
        subject_detection: advanced.subject_detection || defaultAdvanced.subject_detection,
      };
      if (opts.face_enhancement) {
        opts.face_enhancement_creativity = advanced.face_enhancement_creativity ?? defaultAdvanced.face_enhancement_creativity;
        opts.face_enhancement_strength = advanced.face_enhancement_strength ?? defaultAdvanced.face_enhancement_strength;
      }
      const { job_id } = await createUpscale(imageUrl, scale, opts);
      setJobId(job_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upscale failed');
    } finally {
      setSubmitting(false);
    }
  };

  const resultOutputUrl = resultJob ? getOutputUrls(resultJob.output)[0] : null;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-subtle flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-[1fr,240px] gap-8">
        <div>
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
          <div className="flex items-center justify-between gap-4 flex-wrap">
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
            <button
              type="button"
              onClick={() => setShowAdvancedDialog(true)}
              className="p-2.5 rounded-xl border border-theme-border bg-theme-bg-subtle text-theme-fg-muted hover:bg-theme-bg-hover hover:text-theme-fg hover:border-theme-border-hover transition-colors"
              title={t(locale, 'upscaling.advanced')}
              aria-label={t(locale, 'upscaling.advanced')}
            >
              <GearIcon className="w-5 h-5" />
            </button>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="button"
            onClick={handleUpscale}
            disabled={!imageUrl || submitting}
            className="btn-tap px-6 py-2.5 rounded-xl border border-theme-border-hover bg-theme-bg-hover-strong text-theme-fg font-medium disabled:opacity-50 disabled:pointer-events-none hover:bg-theme-bg-hover"
          >
            {submitting ? t(locale, 'common.loading') : t(locale, 'upscaling.upscale')}
          </button>
        </div>

        {jobId && (
          <div className="mt-8 pt-8 border-t border-theme-border">
            <h2 className="text-lg font-medium text-theme-fg mb-4">{t(locale, 'upscaling.result')}</h2>
            {resultJob && resultOutputUrl ? (
              <div className="flex flex-col gap-4">
                <img
                  src={resultOutputUrl}
                  alt=""
                  className="max-w-full max-h-[420px] w-auto h-auto object-contain rounded-xl border border-theme-border"
                  decoding="async"
                />
                <Link
                  href="/dashboard/content"
                  className="inline-flex items-center gap-2 text-sm font-medium text-theme-fg-muted hover:text-theme-fg transition-colors"
                >
                  {t(locale, 'upscaling.seeInMyContent')} →
                </Link>
              </div>
            ) : (
              <JobCard jobId={jobId} locale={locale} onNotFound={() => setJobId(null)} />
            )}
          </div>
        )}
        </div>

        {/* Right: Latest upscaled */}
        <div className="lg:pt-10">
          <h2 className="text-sm font-semibold text-theme-fg-muted uppercase tracking-wider mb-3">{t(locale, 'upscaling.latestUpscaled')}</h2>
          {latestLoading ? (
            <p className="text-sm text-theme-fg-subtle animate-pulse-subtle">{t(locale, 'common.loading')}</p>
          ) : latestUpscaled.length === 0 ? (
            <p className="text-sm text-theme-fg-subtle">{t(locale, 'upscaling.noUpscaledYet')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {latestUpscaled.map((job) => {
                const url = getOutputUrls(job.output)[0];
                return (
                  <li key={job.id}>
                    <Link
                      href="/dashboard/content"
                      className="block rounded-xl border border-theme-border overflow-hidden hover:border-theme-border-hover transition-colors bg-theme-bg-subtle"
                    >
                      {url ? (
                        <img src={url} alt="" className="w-full aspect-square object-cover" loading="lazy" decoding="async" />
                      ) : (
                        <div className="w-full aspect-square bg-theme-bg-elevated flex items-center justify-center text-theme-fg-subtle text-xs">—</div>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Advanced options dialog */}
      {showAdvancedDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-theme-bg-overlay" role="dialog" aria-modal="true" aria-labelledby="advanced-dialog-title">
          <div className="bg-theme-bg-elevated border border-theme-border rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-theme-border flex items-center justify-between shrink-0">
              <h2 id="advanced-dialog-title" className="text-lg font-semibold text-theme-fg">{t(locale, 'upscaling.advanced')}</h2>
              <button type="button" onClick={() => setShowAdvancedDialog(false)} className="p-2 rounded-lg text-theme-fg-muted hover:bg-theme-bg-hover hover:text-theme-fg" aria-label="Close">×</button>
            </div>
            <div className="p-4 overflow-y-auto space-y-4 scrollbar-subtle select-theme" style={{ colorScheme: 'dark' }}>
              <div>
                <label className="block text-sm font-medium text-theme-fg mb-1">{t(locale, 'upscaling.advancedEnhanceModel')}</label>
                <select
                  value={advanced.enhance_model ?? 'Standard V2'}
                  onChange={(e) => setAdvanced((a) => ({ ...a, enhance_model: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-theme-border bg-theme-bg-elevated text-theme-fg focus:outline-none focus:ring-2 focus:ring-theme-border-hover focus:border-theme-border-hover"
                >
                  {ENHANCE_MODELS.map((m) => (
                    <option key={m.value} value={m.value}>{t(locale, `upscaling.enhanceModel.${m.key}`)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-theme-fg mb-1">{t(locale, 'upscaling.advancedOutputFormat')}</label>
                <select
                  value={advanced.output_format ?? 'jpg'}
                  onChange={(e) => setAdvanced((a) => ({ ...a, output_format: e.target.value as 'jpg' | 'png' }))}
                  className="w-full px-3 py-2 rounded-xl border border-theme-border bg-theme-bg-elevated text-theme-fg focus:outline-none focus:ring-2 focus:ring-theme-border-hover focus:border-theme-border-hover"
                >
                  <option value="jpg">JPG</option>
                  <option value="png">PNG</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-theme-fg mb-1">{t(locale, 'upscaling.advancedSubjectDetection')}</label>
                <select
                  value={advanced.subject_detection ?? 'None'}
                  onChange={(e) => setAdvanced((a) => ({ ...a, subject_detection: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-theme-border bg-theme-bg-elevated text-theme-fg focus:outline-none focus:ring-2 focus:ring-theme-border-hover focus:border-theme-border-hover"
                >
                  <option value="None">{t(locale, 'upscaling.subjectDetection.none')}</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="face-enhance"
                  checked={advanced.face_enhancement ?? false}
                  onChange={(e) => setAdvanced((a) => ({ ...a, face_enhancement: e.target.checked }))}
                  className="rounded border-theme-border"
                />
                <label htmlFor="face-enhance" className="text-sm font-medium text-theme-fg">{t(locale, 'upscaling.advancedFaceEnhancement')}</label>
              </div>
              {(advanced.face_enhancement ?? false) && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-theme-fg mb-1">{t(locale, 'upscaling.advancedFaceCreativity')} (0–1)</label>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.1}
                      value={advanced.face_enhancement_creativity ?? 0}
                      onChange={(e) => setAdvanced((a) => ({ ...a, face_enhancement_creativity: parseFloat(e.target.value) }))}
                      className="w-full"
                    />
                    <span className="text-xs text-theme-fg-muted">{(advanced.face_enhancement_creativity ?? 0).toFixed(1)}</span>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-theme-fg mb-1">{t(locale, 'upscaling.advancedFaceStrength')} (0–1)</label>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.1}
                      value={advanced.face_enhancement_strength ?? 0.8}
                      onChange={(e) => setAdvanced((a) => ({ ...a, face_enhancement_strength: parseFloat(e.target.value) }))}
                      className="w-full"
                    />
                    <span className="text-xs text-theme-fg-muted">{(advanced.face_enhancement_strength ?? 0.8).toFixed(1)}</span>
                  </div>
                </>
              )}
            </div>
            <div className="p-4 border-t border-theme-border shrink-0">
              <button type="button" onClick={() => setShowAdvancedDialog(false)} className="w-full py-2.5 rounded-xl bg-theme-bg-hover-strong text-theme-fg font-medium hover:bg-theme-bg-hover">
                {t(locale, 'upscaling.advancedDone')}
              </button>
            </div>
          </div>
        </div>
      )}
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

function GearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
