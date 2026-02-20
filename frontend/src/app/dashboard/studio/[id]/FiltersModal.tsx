'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { downloadMediaUrl } from '@/lib/api';

interface FiltersModalProps {
  imageUrl: string;
  itemId: string;
  onClose: () => void;
  onSuccess: () => void;
  onUpload: (itemId: string, file: File) => Promise<void>;
  locale: Locale;
}

export type FilterId =
  | 'grayscale'
  | 'sepia'
  | 'vintage'
  | 'warm'
  | 'cool'
  | 'vivid'
  | 'highContrast'
  | 'vignette'
  | 'fade'
  | 'noir'
  | 'matte'
  | 'invert'
  | 'blur'
  | 'fadeToBlack'
  | 'dramatic';

export type EffectStackItem = { id: string; filterId: FilterId; amount: number };

function applyGrayscale(data: ImageData) {
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const L = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = Math.round(L);
  }
}

function applySepia(data: ImageData) {
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    d[i] = Math.min(255, Math.round(r * 1.07 + g * 0.74 + b * 0.43));
    d[i + 1] = Math.min(255, Math.round(r * 0.97 + g * 0.86 + b * 0.34));
    d[i + 2] = Math.min(255, Math.round(r * 0.82 + g * 0.72 + b * 0.56));
  }
}

function applyVintage(data: ImageData) {
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    d[i] = Math.min(255, Math.round(r * 1.1 + g * 0.6 + b * 0.3));
    d[i + 1] = Math.min(255, Math.round(r * 0.85 + g * 0.95 + b * 0.5));
    d[i + 2] = Math.min(255, Math.round(r * 0.6 + g * 0.7 + b * 0.9));
    const fade = 0.92;
    d[i] = Math.round(d[i] * fade + 255 * (1 - fade) * 0.1);
    d[i + 1] = Math.round(d[i + 1] * fade + 255 * (1 - fade) * 0.08);
    d[i + 2] = Math.round(d[i + 2] * fade + 255 * (1 - fade) * 0.06);
  }
}

function applyWarm(data: ImageData) {
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.min(255, Math.round(d[i] * 1.15));
    d[i + 2] = Math.max(0, Math.round(d[i + 2] * 0.88));
  }
}

function applyCool(data: ImageData) {
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.max(0, Math.round(d[i] * 0.9));
    d[i + 2] = Math.min(255, Math.round(d[i + 2] * 1.12));
  }
}

function applyVivid(data: ImageData) {
  const d = data.data;
  const factor = 1.35;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const maxC = Math.max(r, g, b) / 255;
    const sat = maxC > 0 ? (maxC - Math.min(r, g, b) / 255) / maxC : 0;
    const boost = 1 + (factor - 1) * sat;
    const avg = (r + g + b) / 3;
    d[i] = Math.max(0, Math.min(255, Math.round(avg + (r - avg) * boost)));
    d[i + 1] = Math.max(0, Math.min(255, Math.round(avg + (g - avg) * boost)));
    d[i + 2] = Math.max(0, Math.min(255, Math.round(avg + (b - avg) * boost)));
  }
}

function applyHighContrast(data: ImageData) {
  const d = data.data;
  const mid = 128;
  const factor = 1.4;
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = d[i + c];
      const x = (v - mid) * factor + mid;
      d[i + c] = Math.max(0, Math.min(255, Math.round(x)));
    }
  }
}

function applyVignetteToImageData(data: ImageData, w: number, h: number, strength: number) {
  const d = data.data;
  const cx = w / 2;
  const cy = h / 2;
  const maxD = Math.sqrt(cx * cx + cy * cy);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const t = 1 - Math.min(1, (dist / maxD) * strength);
      const i = (y * w + x) * 4;
      d[i] = Math.round(d[i] * t);
      d[i + 1] = Math.round(d[i + 1] * t);
      d[i + 2] = Math.round(d[i + 2] * t);
    }
  }
}

function applyFade(data: ImageData) {
  const d = data.data;
  const contrast = 0.88;
  const lift = 18;
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = d[i + c];
      d[i + c] = Math.max(0, Math.min(255, Math.round((v - 128) * contrast + 128 + lift)));
    }
  }
}

function applyNoir(data: ImageData) {
  applyGrayscale(data);
  const d = data.data;
  const mid = 128;
  const factor = 1.5;
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = d[i + c];
      const x = (v - mid) * factor + mid;
      d[i + c] = Math.max(0, Math.min(255, Math.round(x)));
    }
  }
}

function applyMatte(data: ImageData) {
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const avg = (r + g + b) / 3;
    const sat = 0.5;
    d[i] = Math.round(avg + (r - avg) * sat);
    d[i + 1] = Math.round(avg + (g - avg) * sat);
    d[i + 2] = Math.round(avg + (b - avg) * sat);
    const lift = 12;
    d[i] = Math.min(255, d[i] + lift);
    d[i + 1] = Math.min(255, d[i + 1] + lift);
    d[i + 2] = Math.min(255, d[i + 2] + lift);
  }
}

function applyInvert(data: ImageData) {
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 255 - d[i];
    d[i + 1] = 255 - d[i + 1];
    d[i + 2] = 255 - d[i + 2];
  }
}

function applyBlur(data: ImageData, w: number, h: number, radius: number) {
  if (radius <= 0) return;
  const src = new Uint8ClampedArray(data.data);
  const d = data.data;
  const r = Math.min(Math.max(1, Math.floor(radius)), 5);
  const size = (r * 2 + 1) ** 2;
  for (let y = r; y < h - r; y++) {
    for (let x = r; x < w - r; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const idx = ((y + dy) * w + (x + dx)) * 4 + c;
            sum += src[idx];
          }
        }
        d[(y * w + x) * 4 + c] = Math.round(sum / size);
      }
    }
  }
}

function applyFadeToBlack(data: ImageData, w: number, h: number) {
  const d = data.data;
  const cx = w / 2;
  const cy = h / 2;
  const maxD = Math.sqrt(cx * cx + cy * cy) * 0.85;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const t = Math.max(0, 1 - dist / maxD);
      const i = (y * w + x) * 4;
      d[i] = Math.round(d[i] * t);
      d[i + 1] = Math.round(d[i + 1] * t);
      d[i + 2] = Math.round(d[i + 2] * t);
    }
  }
}

function applyDramatic(data: ImageData) {
  const d = data.data;
  const mid = 128;
  const factor = 1.25;
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = d[i + c];
      const x = (v - mid) * factor + mid;
      d[i + c] = Math.max(0, Math.min(255, Math.round(x)));
    }
  }
  const sat = 1.15;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const avg = (r + g + b) / 3;
    d[i] = Math.max(0, Math.min(255, Math.round(avg + (r - avg) * sat)));
    d[i + 1] = Math.max(0, Math.min(255, Math.round(avg + (g - avg) * sat)));
    d[i + 2] = Math.max(0, Math.min(255, Math.round(avg + (b - avg) * sat)));
  }
}

function blendImageData(orig: ImageData, filtered: ImageData, amount: number) {
  const t = Math.max(0, Math.min(1, amount));
  const o = orig.data;
  const f = filtered.data;
  for (let i = 0; i < o.length; i++) {
    f[i] = Math.round(o[i] * (1 - t) + f[i] * t);
  }
}

function applyFilterToData(data: ImageData, w: number, h: number, filterId: FilterId) {
  switch (filterId) {
    case 'grayscale':
      applyGrayscale(data);
      break;
    case 'sepia':
      applySepia(data);
      break;
    case 'vintage':
      applyVintage(data);
      break;
    case 'warm':
      applyWarm(data);
      break;
    case 'cool':
      applyCool(data);
      break;
    case 'vivid':
      applyVivid(data);
      break;
    case 'highContrast':
      applyHighContrast(data);
      break;
    case 'vignette':
      applyVignetteToImageData(data, w, h, 1.2);
      break;
    case 'fade':
      applyFade(data);
      break;
    case 'noir':
      applyNoir(data);
      break;
    case 'matte':
      applyMatte(data);
      break;
    case 'invert':
      applyInvert(data);
      break;
    case 'blur':
      applyBlur(data, w, h, 2);
      break;
    case 'fadeToBlack':
      applyFadeToBlack(data, w, h);
      break;
    case 'dramatic':
      applyDramatic(data);
      break;
    default:
      break;
  }
}

function drawWithFilterStack(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  stack: EffectStackItem[]
) {
  ctx.drawImage(img, 0, 0, w, h);
  if (stack.length === 0) return;
  let current = ctx.getImageData(0, 0, w, h);
  const work = new ImageData(new Uint8ClampedArray(current.data), w, h);
  for (const item of stack) {
    if (item.amount <= 0) continue;
    const orig = new ImageData(new Uint8ClampedArray(current.data), w, h);
    applyFilterToData(work, w, h, item.filterId);
    if (item.amount >= 1) {
      current.data.set(work.data);
    } else {
      blendImageData(orig, work, item.amount);
      current.data.set(work.data);
    }
    work.data.set(current.data);
  }
  ctx.putImageData(current, 0, 0);
}

const FILTER_OPTIONS: { id: FilterId; labelKey: string }[] = [
  { id: 'grayscale', labelKey: 'studio.filter.grayscale' },
  { id: 'sepia', labelKey: 'studio.filter.sepia' },
  { id: 'vintage', labelKey: 'studio.filter.vintage' },
  { id: 'warm', labelKey: 'studio.filter.warm' },
  { id: 'cool', labelKey: 'studio.filter.cool' },
  { id: 'vivid', labelKey: 'studio.filter.vivid' },
  { id: 'highContrast', labelKey: 'studio.filter.highContrast' },
  { id: 'vignette', labelKey: 'studio.filter.vignette' },
  { id: 'fade', labelKey: 'studio.filter.fade' },
  { id: 'noir', labelKey: 'studio.filter.noir' },
  { id: 'matte', labelKey: 'studio.filter.matte' },
  { id: 'invert', labelKey: 'studio.filter.invert' },
  { id: 'blur', labelKey: 'studio.filter.blur' },
  { id: 'fadeToBlack', labelKey: 'studio.filter.fadeToBlack' },
  { id: 'dramatic', labelKey: 'studio.filter.dramatic' },
];

function getFilterLabelKey(id: FilterId): string {
  return FILTER_OPTIONS.find((o) => o.id === id)?.labelKey ?? id;
}

export function FiltersModal({
  imageUrl,
  itemId,
  onClose,
  onSuccess,
  onUpload,
  locale,
}: FiltersModalProps) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [effectStack, setEffectStack] = useState<EffectStackItem[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let url: string | null = null;
    setLoading(true);
    setError(null);
    downloadMediaUrl(imageUrl)
      .then((blob) => {
        url = URL.createObjectURL(blob);
        setBlobUrl(url);
      })
      .catch(() => {
        fetch(imageUrl)
          .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('Fetch failed'))))
          .then((blob) => {
            url = URL.createObjectURL(blob);
            setBlobUrl(url);
          })
          .catch(() => setError('Could not load image'));
      });
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [imageUrl]);

  const draw = useCallback(() => {
    if (!canvasRef.current || !imgRef.current?.complete || !imgRef.current.naturalWidth) return;
    const img = imgRef.current;
    const canvas = canvasRef.current;
    const maxW = 700;
    const maxH = 450;
    const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawWithFilterStack(ctx, img, w, h, effectStack);
  }, [effectStack]);

  useEffect(() => {
    if (!blobUrl) return;
    draw();
  }, [blobUrl, draw]);

  const onImageLoad = useCallback(() => {
    setLoading(false);
    draw();
  }, [draw]);

  const addEffect = useCallback((filterId: FilterId) => {
    setEffectStack((prev) => [...prev, { id: crypto.randomUUID(), filterId, amount: 100 }]);
    setAddOpen(false);
  }, []);

  const removeEffect = useCallback((id: string) => {
    setEffectStack((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const updateAmount = useCallback((id: string, amount: number) => {
    setEffectStack((prev) => prev.map((e) => (e.id === id ? { ...e, amount } : e)));
  }, []);

  const moveUp = useCallback((id: string) => {
    setEffectStack((prev) => {
      const i = prev.findIndex((e) => e.id === id);
      if (i <= 0) return prev;
      const next = [...prev];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    });
  }, []);

  const moveDown = useCallback((id: string) => {
    setEffectStack((prev) => {
      const i = prev.findIndex((e) => e.id === id);
      if (i < 0 || i >= prev.length - 1) return prev;
      const next = [...prev];
      [next[i], next[i + 1]] = [next[i + 1], next[i]];
      return next;
    });
  }, []);

  const handleApply = useCallback(async () => {
    if (!imgRef.current?.complete || !imgRef.current.naturalWidth) return;
    setApplying(true);
    try {
      const img = imgRef.current;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas failed');
      drawWithFilterStack(ctx, img, w, h, effectStack);
      const blob = await new Promise<Blob>((res, rej) => {
        canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png');
      });
      const file = new File([blob], 'filter.png', { type: 'image/png' });
      await onUpload(itemId, file);
      onSuccess();
      onClose();
    } catch (e) {
      setError((e as Error)?.message ?? 'Apply failed');
    } finally {
      setApplying(false);
    }
  }, [effectStack, itemId, onUpload, onSuccess, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (addOpen) setAddOpen(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, addOpen]);

  const usedIds = new Set(effectStack.map((e) => e.filterId));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-theme-bg-overlay"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div className="relative z-10 bg-theme-bg rounded-xl border border-theme-border shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-theme-border">
          <h3 className="font-semibold text-theme-fg">{t(locale, 'studio.filters')}</h3>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-theme-fg-subtle hover:text-theme-fg hover:bg-theme-bg-hover"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {error && (
          <div className="px-4 py-2 text-sm text-theme-danger bg-theme-danger-muted">{error}</div>
        )}
        <div className="flex flex-col sm:flex-row flex-1 min-h-0 p-4 gap-4">
          <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center bg-theme-bg-subtle rounded-lg">
            {loading && !blobUrl && (
              <p className="text-theme-fg-subtle py-8">{t(locale, 'common.loading')}</p>
            )}
            {blobUrl && (
              <>
                <img ref={imgRef} src={blobUrl} alt="" className="hidden" onLoad={onImageLoad} />
                <canvas ref={canvasRef} className="max-w-full max-h-[50vh] w-full h-auto rounded" />
              </>
            )}
          </div>
          <div className="w-full sm:w-64 shrink-0 flex flex-col gap-3 overflow-auto">
            <p className="text-xs font-medium text-theme-fg-muted">{t(locale, 'studio.filter.active')}</p>
            {effectStack.length === 0 ? (
              <p className="text-xs text-theme-fg-subtle">{t(locale, 'studio.filter.addHint')}</p>
            ) : (
              <ul className="space-y-2">
                {effectStack.map((item, index) => (
                  <li
                    key={item.id}
                    className="flex flex-col gap-1.5 p-2 rounded-lg border border-theme-border bg-theme-bg-subtle"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-medium text-theme-fg truncate">
                        {t(locale, getFilterLabelKey(item.filterId))}
                      </span>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => moveUp(item.id)}
                          disabled={index === 0}
                          className="p-1 rounded text-theme-fg-subtle hover:text-theme-fg hover:bg-theme-bg-hover disabled:opacity-40 disabled:pointer-events-none"
                          aria-label="Move up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveDown(item.id)}
                          disabled={index === effectStack.length - 1}
                          className="p-1 rounded text-theme-fg-subtle hover:text-theme-fg hover:bg-theme-bg-hover disabled:opacity-40 disabled:pointer-events-none"
                          aria-label="Move down"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => removeEffect(item.id)}
                          className="p-1 rounded text-theme-fg-subtle hover:text-theme-danger hover:bg-theme-bg-hover"
                          aria-label="Remove"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="flex items-center justify-between text-[11px] text-theme-fg-muted mb-0.5">
                        <span>{t(locale, 'studio.filter.strength')}</span>
                        <span>{item.amount}%</span>
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={item.amount}
                        onChange={(e) => updateAmount(item.id, Number(e.target.value))}
                        className="w-full h-1.5 rounded-lg appearance-none bg-theme-bg-hover accent-theme-accent"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="relative">
              {addOpen && (
                <div
                  className="absolute inset-0 z-10 rounded-lg"
                  onClick={() => setAddOpen(false)}
                  aria-hidden
                />
              )}
              <button
                type="button"
                onClick={() => setAddOpen((o) => !o)}
                className={`w-full px-3 py-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-2 transition-all duration-200 ${
                  addOpen
                    ? 'border-theme-accent bg-theme-accent/10 text-theme-accent'
                    : 'border-theme-border bg-theme-bg-subtle text-theme-fg hover:bg-theme-bg-hover hover:border-theme-border-hover'
                }`}
              >
                <span>+ {t(locale, 'studio.filter.addEffect')}</span>
                <svg
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${addOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {addOpen && (
                <div
                  className="absolute top-full left-0 right-0 mt-2 z-20 rounded-xl border border-theme-border bg-theme-bg-elevated shadow-xl overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-3 py-2 border-b border-theme-border">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-theme-fg-muted">
                      {t(locale, 'studio.filter.choose')}
                    </p>
                  </div>
                  <div className="p-2 max-h-56 overflow-y-auto scrollbar-subtle grid grid-cols-2 gap-1.5">
                    {FILTER_OPTIONS.map((opt) => {
                      const added = usedIds.has(opt.id);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => addEffect(opt.id)}
                          className={`px-2.5 py-2 rounded-lg text-left text-xs font-medium transition-all duration-150 flex items-center justify-between gap-1.5 ${
                            added
                              ? 'border border-theme-accent/40 bg-theme-accent/5 text-theme-accent'
                              : 'border border-theme-border bg-theme-bg-subtle text-theme-fg hover:bg-theme-bg-hover hover:border-theme-border-hover'
                          }`}
                        >
                          <span className="truncate">{t(locale, opt.labelKey)}</span>
                          {added && (
                            <svg className="w-3.5 h-3.5 shrink-0 text-theme-accent" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-theme-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-theme-border text-theme-fg hover:bg-theme-bg-hover"
          >
            {t(locale, 'dialog.cancel')}
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={loading || applying}
            className="px-4 py-2 rounded-lg bg-theme-accent text-theme-fg-inverse hover:opacity-90 disabled:opacity-50"
          >
            {applying ? '...' : t(locale, 'studio.apply')}
          </button>
        </div>
      </div>
    </div>
  );
}
