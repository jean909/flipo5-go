'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';
import { createLogoJob, getJob, getToken, getMediaDisplayUrl, downloadMediaUrl, listContent, type Job } from '@/lib/api';
import { getOutputUrls } from '@/lib/jobOutput';
import { motion, AnimatePresence } from 'framer-motion';

const VECTORIZER_URL = 'https://www.vectorizer.io/';

const ASPECT_RATIOS = [
  { value: '1:1', label: '1:1' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
];

const LOGO_TYPES = [
  { value: '', label: 'None' },
  { value: 'Icon', label: 'Icon' },
  { value: 'Wordmark', label: 'Wordmark' },
  { value: 'Lettermark', label: 'Lettermark' },
  { value: 'Emblem', label: 'Emblem' },
  { value: 'Mascot', label: 'Mascot' },
  { value: 'Abstract', label: 'Abstract' },
];

const STYLES = [
  { value: '', label: 'None' },
  { value: 'Minimalist', label: 'Minimalist' },
  { value: 'Modern', label: 'Modern' },
  { value: 'Vintage', label: 'Vintage' },
  { value: 'Playful', label: 'Playful' },
  { value: 'Corporate', label: 'Corporate' },
  { value: 'Luxury', label: 'Luxury' },
];

const COLOR_OPTIONS = [
  { value: '', label: 'None', hex: 'transparent' },
  { value: 'Black', label: 'Black', hex: '#000000' },
  { value: 'White', label: 'White', hex: '#ffffff' },
  { value: 'Navy blue', label: 'Navy blue', hex: '#001f3f' },
  { value: 'Royal blue', label: 'Royal blue', hex: '#0074d9' },
  { value: 'Red', label: 'Red', hex: '#e63946' },
  { value: 'Orange', label: 'Orange', hex: '#ff851b' },
  { value: 'Gold', label: 'Gold', hex: '#ffd700' },
  { value: 'Green', label: 'Green', hex: '#2ecc40' },
  { value: 'Teal', label: 'Teal', hex: '#39cccc' },
  { value: 'Purple', label: 'Purple', hex: '#b10dc9' },
  { value: 'Pink', label: 'Pink', hex: '#ff69b4' },
  { value: 'Gray', label: 'Gray', hex: '#888888' },
];

function getColorHex(value: string): string {
  if (!value) return 'transparent';
  if (value.startsWith('#')) return value;
  const o = COLOR_OPTIONS.find((c) => c.value === value);
  return o?.hex ?? 'transparent';
}

function getColorLabel(value: string, locale: string): string {
  if (!value) return t(locale, 'logo.choose');
  if (value.startsWith('#')) return value;
  return COLOR_OPTIONS.find((c) => c.value === value)?.label ?? value;
}

type PickerDialog = 'logoType' | 'style' | 'primaryColor' | 'secondaryColor' | null;
type SvgExportDialog = { index: number; url: string } | null;

function OptionDialog({
  open,
  onClose,
  title,
  options,
  value,
  onSelect,
  locale,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  options: { value: string; label: string }[];
  value: string;
  onSelect: (v: string) => void;
  locale: string;
}) {
  if (!open) return null;
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.15 }}
          className="rounded-2xl border border-theme-border bg-theme-bg shadow-xl max-w-md w-full max-h-[80vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-4 border-b border-theme-border flex items-center justify-between">
            <span className="text-sm font-medium text-theme-fg">{title}</span>
            <button type="button" onClick={onClose} className="p-2 rounded-lg text-theme-fg-subtle hover:text-theme-fg hover:bg-theme-bg-hover transition-colors" aria-label="Close">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="p-4 overflow-y-auto max-h-[60vh]">
            <div className="flex flex-wrap gap-2">
              {options.map((o) => (
                <button
                  key={o.value || 'none'}
                  type="button"
                  onClick={() => { onSelect(o.value); onClose(); }}
                  className={`btn-tap px-4 py-2.5 rounded-xl text-sm font-medium transition-colors border ${value === o.value ? 'border-theme-accent bg-theme-accent/15 text-theme-accent' : 'border-theme-border bg-theme-bg-subtle text-theme-fg hover:bg-theme-bg-hover'}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function ColorPickerDialog({
  open,
  onClose,
  title,
  value,
  onSelect,
  locale,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  value: string;
  onSelect: (v: string) => void;
  locale: string;
}) {
  const [customHex, setCustomHex] = useState('#000000');
  useEffect(() => {
    if (open) {
      const h = value.startsWith('#') ? value : getColorHex(value);
      setCustomHex(h === 'transparent' ? '#000000' : h);
    }
  }, [open, value]);
  if (!open) return null;
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.15 }}
          className="rounded-2xl border border-theme-border bg-theme-bg shadow-xl max-w-md w-full max-h-[85vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-4 border-b border-theme-border flex items-center justify-between">
            <span className="text-sm font-medium text-theme-fg">{title}</span>
            <button type="button" onClick={onClose} className="p-2 rounded-lg text-theme-fg-subtle hover:text-theme-fg hover:bg-theme-bg-hover transition-colors" aria-label="Close">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="p-4 overflow-y-auto max-h-[70vh] space-y-4">
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((o) => (
                <button
                  key={o.value || 'none'}
                  type="button"
                  onClick={() => { onSelect(o.value); onClose(); }}
                  className={`btn-tap flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors border shrink-0 ${value === o.value && !value.startsWith('#') ? 'border-theme-accent bg-theme-accent/15 text-theme-accent' : 'border-theme-border bg-theme-bg-subtle text-theme-fg hover:bg-theme-bg-hover'}`}
                >
                  <span
                    className="w-5 h-5 rounded-full border border-theme-border shrink-0"
                    style={{ background: o.hex === 'transparent' ? 'repeating-conic-gradient(#333 0% 25%, #555 0% 50%) 50% / 12px 12px' : o.hex }}
                  />
                  {o.label}
                </button>
              ))}
            </div>
            <div className="pt-3 border-t border-theme-border">
              <p className="text-xs font-medium text-theme-fg-muted mb-2">RGB / Custom</p>
              <div className="flex items-center gap-3 flex-wrap">
                <input
                  type="color"
                  value={value.startsWith('#') ? value : customHex}
                  onChange={(e) => {
                    const hex = e.target.value;
                    setCustomHex(hex);
                    onSelect(hex);
                  }}
                  className="w-10 h-10 rounded-lg cursor-pointer border border-theme-border bg-transparent overflow-hidden [color-scheme:dark]"
                />
                <input
                  type="text"
                  value={value.startsWith('#') ? value : customHex}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    if (/^#[0-9A-Fa-f]{0,6}$/.test(v) || v === '') {
                      setCustomHex(v || '#000000');
                      if (/^#[0-9A-Fa-f]{6}$/.test(v)) onSelect(v);
                    }
                  }}
                  placeholder="#000000"
                  className="flex-1 min-w-[100px] px-3 py-2 rounded-lg border border-theme-border bg-theme-bg text-theme-fg text-sm font-mono focus:outline-none focus:border-theme-border-hover"
                />
                <button
                  type="button"
                  onClick={() => { onSelect(customHex); onClose(); }}
                  className="btn-tap px-4 py-2 rounded-xl border border-theme-accent bg-theme-accent/15 text-theme-accent text-sm font-medium"
                >
                  {t(locale, 'logo.choose')}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function SvgExportDialog({
  open,
  onClose,
  onDownloadPng,
  locale,
}: {
  open: SvgExportDialog;
  onClose: () => void;
  onDownloadPng: () => void;
  locale: string;
}) {
  if (!open) return null;
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          className="rounded-2xl border border-theme-border bg-theme-bg shadow-xl max-w-sm w-full p-5"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-base font-semibold text-theme-fg mb-2">{t(locale, 'logo.svgDialogTitle')}</h3>
          <p className="text-sm text-theme-fg-muted mb-4">{t(locale, 'logo.svgDialogBody')}</p>
          <div className="flex flex-col gap-2">
            <button type="button" onClick={() => { onDownloadPng(); onClose(); }} className="btn-tap w-full py-2.5 rounded-xl border border-theme-border bg-theme-bg-hover text-theme-fg text-sm font-medium">
              {t(locale, 'logo.downloadPng')} →
            </button>
            <a href={VECTORIZER_URL} target="_blank" rel="noopener noreferrer" className="btn-tap w-full py-2.5 rounded-xl border border-theme-accent bg-theme-accent/15 text-theme-accent text-sm font-medium text-center">
              {t(locale, 'logo.openVectorizer')}
            </a>
            <button type="button" onClick={onClose} className="py-2 text-sm text-theme-fg-muted hover:text-theme-fg">
              {t(locale, 'common.close')}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default function LogoPage() {
  const { locale } = useLocale();
  const [prompt, setPrompt] = useState('');
  const [logoText, setLogoText] = useState('');
  const [logoType, setLogoType] = useState('');
  const [style, setStyle] = useState('');
  const [primaryColor, setPrimaryColor] = useState('');
  const [secondaryColor, setSecondaryColor] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [outputFormat, setOutputFormat] = useState<'png' | 'jpg'>('png');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const [mediaToken, setMediaToken] = useState<string | null>(null);
  const [pickerDialog, setPickerDialog] = useState<PickerDialog>(null);
  const [svgExportDialog, setSvgExportDialog] = useState<SvgExportDialog>(null);
  const [latestLogos, setLatestLogos] = useState<Job[]>([]);
  const [latestLoading, setLatestLoading] = useState(false);

  useEffect(() => {
    getToken().then(setMediaToken);
  }, []);

  const loadLatestLogos = useCallback(() => {
    setLatestLoading(true);
    listContent({ page: 1, limit: 20, type: 'logo' })
      .then((r) => setLatestLogos((r.jobs ?? []).slice(0, 5)))
      .catch(() => setLatestLogos([]))
      .finally(() => setLatestLoading(false));
  }, []);

  useEffect(() => {
    loadLatestLogos();
  }, [loadLatestLogos]);

  useEffect(() => {
    if (jobId && resultUrls.length > 0) loadLatestLogos();
  }, [jobId, resultUrls.length, loadLatestLogos]);

  const pollJob = useCallback((id: string) => {
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      const job = await getJob(id).catch(() => null);
      if (!job) {
        if (!cancelled) setError('Job not found');
        setLoading(false);
        return;
      }
      if (job.status === 'completed') {
        const urls = getOutputUrls(job.output);
        setResultUrls(urls);
        setLoading(false);
      } else if (job.status === 'failed') {
        setError(job.error ?? 'Generation failed');
        setLoading(false);
      } else {
        if (!cancelled) setTimeout(poll, 2500);
      }
    };
    poll();
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const p = prompt.trim();
    if (!p) {
      setError('Enter a logo description');
      return;
    }
    setLoading(true);
    setResultUrls([]);
    try {
      const { job_id } = await createLogoJob({
        prompt: p,
        logo_text: logoText.trim() || undefined,
        logo_type: logoType || undefined,
        style: style || undefined,
        primary_color: primaryColor || undefined,
        secondary_color: secondaryColor || undefined,
        aspect_ratio: aspectRatio,
        output_format: outputFormat,
      });
      setJobId(job_id);
      pollJob(job_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create logo');
      setLoading(false);
    }
  };

  const handleDownload = async (url: string, format: 'png' | 'jpg', index: number) => {
    try {
      const blob = await downloadMediaUrl(url);
      const ext = format === 'jpg' ? 'jpg' : 'png';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `logo-variant-${index + 1}.${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, '_blank');
    }
  };

  const openSvgExport = (index: number, url: string) => setSvgExportDialog({ index, url });
  const handleSvgDialogDownloadPng = () => {
    if (svgExportDialog) handleDownload(svgExportDialog.url, 'png', svgExportDialog.index);
  };

  const choiceLabel = (current: string, options: { value: string; label: string }[]) => {
    if (!current) return t(locale, 'logo.choose');
    return options.find((o) => o.value === current)?.label ?? current;
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-subtle flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-[1fr,240px] gap-8">
        <div>
          <h1 className="text-xl font-semibold text-theme-fg mb-6">{t(locale, 'logo.title')}</h1>
      <div className="rounded-2xl border border-theme-border bg-theme-bg-subtle p-6 mb-6">
        <p className="text-sm text-theme-fg-muted mt-0 mb-4">{t(locale, 'logo.sub')}</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-theme-fg-muted mb-1.5">{t(locale, 'logo.prompt')}</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t(locale, 'logo.promptPlaceholder')}
              rows={2}
              className="w-full px-4 py-2.5 rounded-xl border border-theme-border bg-theme-bg text-theme-fg placeholder:text-theme-fg-subtle text-sm focus:outline-none focus:border-theme-border-hover resize-none"
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-theme-fg-muted mb-1.5">{t(locale, 'logo.logoText')}</label>
            <input
              type="text"
              value={logoText}
              onChange={(e) => setLogoText(e.target.value)}
              placeholder={t(locale, 'logo.logoTextPlaceholder')}
              className="w-full px-4 py-2.5 rounded-xl border border-theme-border bg-theme-bg text-theme-fg placeholder:text-theme-fg-subtle text-sm focus:outline-none focus:border-theme-border-hover"
              disabled={loading}
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <div>
              <label className="block text-xs font-medium text-theme-fg-muted mb-1">{t(locale, 'logo.logoType')}</label>
              <button
                type="button"
                onClick={() => setPickerDialog('logoType')}
                disabled={loading}
                className="btn-tap px-4 py-2.5 rounded-xl border border-theme-border bg-theme-bg text-theme-fg text-sm font-medium hover:bg-theme-bg-hover transition-colors flex items-center gap-2"
              >
                {choiceLabel(logoType, LOGO_TYPES)}
                <svg className="w-4 h-4 text-theme-fg-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium text-theme-fg-muted mb-1">{t(locale, 'logo.style')}</label>
              <button
                type="button"
                onClick={() => setPickerDialog('style')}
                disabled={loading}
                className="btn-tap px-4 py-2.5 rounded-xl border border-theme-border bg-theme-bg text-theme-fg text-sm font-medium hover:bg-theme-bg-hover transition-colors flex items-center gap-2"
              >
                {choiceLabel(style, STYLES)}
                <svg className="w-4 h-4 text-theme-fg-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium text-theme-fg-muted mb-1">{t(locale, 'logo.primaryColor')}</label>
              <button
                type="button"
                onClick={() => setPickerDialog('primaryColor')}
                disabled={loading}
                className="btn-tap px-4 py-2.5 rounded-xl border border-theme-border bg-theme-bg text-theme-fg text-sm font-medium hover:bg-theme-bg-hover transition-colors flex items-center gap-2"
              >
                {primaryColor && (
                  <span
                    className="w-4 h-4 rounded-full border border-theme-border shrink-0"
                    style={{ background: getColorHex(primaryColor) === 'transparent' ? 'repeating-conic-gradient(#333 0% 25%, #555 0% 50%) 50% / 8px 8px' : getColorHex(primaryColor) }}
                  />
                )}
                {getColorLabel(primaryColor, locale)}
                <svg className="w-4 h-4 text-theme-fg-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium text-theme-fg-muted mb-1">{t(locale, 'logo.secondaryColor')}</label>
              <button
                type="button"
                onClick={() => setPickerDialog('secondaryColor')}
                disabled={loading}
                className="btn-tap px-4 py-2.5 rounded-xl border border-theme-border bg-theme-bg text-theme-fg text-sm font-medium hover:bg-theme-bg-hover transition-colors flex items-center gap-2"
              >
                {secondaryColor && (
                  <span
                    className="w-4 h-4 rounded-full border border-theme-border shrink-0"
                    style={{ background: getColorHex(secondaryColor) === 'transparent' ? 'repeating-conic-gradient(#333 0% 25%, #555 0% 50%) 50% / 8px 8px' : getColorHex(secondaryColor) }}
                  />
                )}
                {getColorLabel(secondaryColor, locale)}
                <svg className="w-4 h-4 text-theme-fg-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-sm font-medium text-theme-fg-muted mb-1.5">{t(locale, 'logo.aspectRatio')}</label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
                className="select-theme px-3 py-2 rounded-lg border border-theme-border bg-theme-bg text-theme-fg text-sm focus:outline-none focus:border-theme-border-hover"
                disabled={loading}
              >
                {ASPECT_RATIOS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-theme-fg-muted mb-1.5">{t(locale, 'logo.outputFormat')}</label>
              <select
                value={outputFormat}
                onChange={(e) => setOutputFormat(e.target.value as 'png' | 'jpg')}
                className="select-theme px-3 py-2 rounded-lg border border-theme-border bg-theme-bg text-theme-fg text-sm focus:outline-none focus:border-theme-border-hover"
                disabled={loading}
              >
                <option value="png">PNG</option>
                <option value="jpg">JPG</option>
              </select>
            </div>
          </div>

          {error && <p className="text-sm text-theme-danger">{error}</p>}
          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            className="btn-tap px-5 py-2.5 rounded-xl bg-theme-accent text-theme-fg-inverse font-medium text-sm disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin shrink-0" />}
            {t(locale, 'logo.create')}
          </button>
        </form>
      </div>

      <AnimatePresence>
        {resultUrls.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl border border-theme-border bg-theme-bg-subtle p-6"
          >
            <p className="text-sm font-medium text-theme-fg mb-4">{t(locale, 'logo.variants')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {resultUrls.map((url, i) => {
                const displayUrl = mediaToken ? getMediaDisplayUrl(url, mediaToken) || url : url;
                return (
                  <div key={i} className="rounded-xl border border-theme-border bg-theme-bg overflow-hidden">
                    <div className="aspect-square flex items-center justify-center p-4">
                      <img src={displayUrl} alt={`Logo variant ${i + 1}`} className="max-w-full max-h-full w-auto h-auto object-contain" />
                    </div>
                    <div className="p-3 flex flex-wrap gap-2 border-t border-theme-border">
                      <button
                        type="button"
                        onClick={() => handleDownload(url, 'png', i)}
                        className="btn-tap px-3 py-1.5 rounded-lg border border-theme-border bg-theme-bg-hover text-theme-fg text-xs font-medium"
                      >
                        {t(locale, 'logo.downloadPng')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownload(url, 'jpg', i)}
                        className="btn-tap px-3 py-1.5 rounded-lg border border-theme-border bg-theme-bg-hover text-theme-fg text-xs font-medium"
                      >
                        {t(locale, 'logo.downloadJpg')}
                      </button>
                      <button
                        type="button"
                        onClick={() => openSvgExport(i, url)}
                        className="btn-tap px-3 py-1.5 rounded-lg border border-theme-border bg-theme-bg-hover text-theme-fg text-xs font-medium"
                      >
                        {t(locale, 'logo.exportSvg')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Link href="/dashboard/files?type=logo" className="text-sm text-theme-fg-muted hover:text-theme-fg transition-colors">
                → {t(locale, 'logo.seeInMyFiles')}
              </Link>
            </div>
            <p className="text-xs text-theme-fg-subtle mt-3">{t(locale, 'logo.svgNote')}</p>
          </motion.div>
        )}
      </AnimatePresence>
        </div>

        <div className="lg:pt-10">
          <h2 className="text-sm font-semibold text-theme-fg-muted uppercase tracking-wider mb-3">{t(locale, 'logo.latestLogos')}</h2>
          {latestLoading ? (
            <p className="text-sm text-theme-fg-subtle animate-pulse-subtle">{t(locale, 'common.loading')}</p>
          ) : latestLogos.length === 0 ? (
            <p className="text-sm text-theme-fg-subtle">{t(locale, 'logo.noLogosYet')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {latestLogos.map((job) => {
                const urls = getOutputUrls(job.output);
                const url = urls[0];
                return (
                  <li key={job.id}>
                    <Link
                      href="/dashboard/files?type=logo"
                      className="block rounded-xl border border-theme-border overflow-hidden hover:border-theme-border-hover transition-colors bg-theme-bg-subtle"
                    >
                      {url ? (
                        <img src={mediaToken ? getMediaDisplayUrl(url, mediaToken) || url : url} alt="" className="w-full aspect-square object-cover" loading="lazy" decoding="async" />
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

      <OptionDialog
        open={pickerDialog === 'logoType'}
        onClose={() => setPickerDialog(null)}
        title={t(locale, 'logo.logoType')}
        options={LOGO_TYPES}
        value={logoType}
        onSelect={setLogoType}
        locale={locale}
      />
      <OptionDialog
        open={pickerDialog === 'style'}
        onClose={() => setPickerDialog(null)}
        title={t(locale, 'logo.style')}
        options={STYLES}
        value={style}
        onSelect={setStyle}
        locale={locale}
      />
      <ColorPickerDialog
        open={pickerDialog === 'primaryColor'}
        onClose={() => setPickerDialog(null)}
        title={t(locale, 'logo.primaryColor')}
        value={primaryColor}
        onSelect={setPrimaryColor}
        locale={locale}
      />
      <ColorPickerDialog
        open={pickerDialog === 'secondaryColor'}
        onClose={() => setPickerDialog(null)}
        title={t(locale, 'logo.secondaryColor')}
        value={secondaryColor}
        onSelect={setSecondaryColor}
        locale={locale}
      />

      <SvgExportDialog
        open={svgExportDialog}
        onClose={() => setSvgExportDialog(null)}
        onDownloadPng={handleSvgDialogDownloadPng}
        locale={locale}
      />
    </div>
  );
}
