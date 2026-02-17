'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { downloadMediaUrl } from '@/lib/api';

interface AdjustmentsModalProps {
  imageUrl: string;
  itemId: string;
  onClose: () => void;
  onSuccess: () => void;
  onUpload: (itemId: string, file: File) => Promise<void>;
  locale: Locale;
}

function applySharpness(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number) {
  if (amount === 0) return;
  const data = ctx.getImageData(0, 0, w, h);
  const out = new ImageData(w, h);
  out.data.set(data.data);
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            sum += data.data[((y + dy) * w + (x + dx)) * 4 + c] * kernel[(dy + 1) * 3 + (dx + 1)];
          }
        }
        const orig = data.data[(y * w + x) * 4 + c];
        const v = orig + (sum - orig) * amount;
        out.data[(y * w + x) * 4 + c] = Math.max(0, Math.min(255, Math.round(v)));
      }
    }
  }
  ctx.putImageData(out, 0, 0);
}

function applyBlur(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number) {
  if (amount <= 0) return;
  const data = ctx.getImageData(0, 0, w, h);
  const out = new ImageData(w, h);
  out.data.set(data.data);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            sum += data.data[((y + dy) * w + (x + dx)) * 4 + c];
          }
        }
        const avg = sum / 9;
        const orig = data.data[(y * w + x) * 4 + c];
        const v = orig * (1 - amount) + avg * amount;
        out.data[(y * w + x) * 4 + c] = Math.max(0, Math.min(255, Math.round(v)));
      }
    }
  }
  ctx.putImageData(out, 0, 0);
}

function applyTemperature(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number) {
  if (amount === 0) return;
  const data = ctx.getImageData(0, 0, w, h);
  const t = amount / 100;
  const rFac = 1 + t * 0.5;
  const bFac = 1 - t * 0.5;
  for (let i = 0; i < data.data.length; i += 4) {
    data.data[i] = Math.max(0, Math.min(255, Math.round(data.data[i] * rFac)));
    data.data[i + 2] = Math.max(0, Math.min(255, Math.round(data.data[i + 2] * bFac)));
  }
  ctx.putImageData(data, 0, 0);
}

function applyTint(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number) {
  if (amount === 0) return;
  const data = ctx.getImageData(0, 0, w, h);
  const t = amount / 100;
  const gFac = 1 - t * 0.4;
  const rbFac = 1 + t * 0.3;
  for (let i = 0; i < data.data.length; i += 4) {
    data.data[i] = Math.max(0, Math.min(255, Math.round(data.data[i] * rbFac)));
    data.data[i + 1] = Math.max(0, Math.min(255, Math.round(data.data[i + 1] * gFac)));
    data.data[i + 2] = Math.max(0, Math.min(255, Math.round(data.data[i + 2] * rbFac)));
  }
  ctx.putImageData(data, 0, 0);
}

function lum(r: number, g: number, b: number) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function applyHighlights(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number) {
  if (amount === 100) return;
  const data = ctx.getImageData(0, 0, w, h);
  const factor = amount / 100;
  for (let i = 0; i < data.data.length; i += 4) {
    const r = data.data[i];
    const g = data.data[i + 1];
    const b = data.data[i + 2];
    const L = lum(r, g, b);
    const weight = L / 255;
    const L2 = L * (1 + (factor - 1) * weight);
    const scale = L > 1e-6 ? L2 / L : 1;
    data.data[i] = Math.max(0, Math.min(255, Math.round(r * scale)));
    data.data[i + 1] = Math.max(0, Math.min(255, Math.round(g * scale)));
    data.data[i + 2] = Math.max(0, Math.min(255, Math.round(b * scale)));
  }
  ctx.putImageData(data, 0, 0);
}

function applyShadows(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number) {
  if (amount === 100) return;
  const data = ctx.getImageData(0, 0, w, h);
  const factor = amount / 100;
  for (let i = 0; i < data.data.length; i += 4) {
    const r = data.data[i];
    const g = data.data[i + 1];
    const b = data.data[i + 2];
    const L = lum(r, g, b);
    const weight = 1 - L / 255;
    const L2 = L * (1 + (factor - 1) * weight);
    const scale = L > 1e-6 ? L2 / L : 1;
    data.data[i] = Math.max(0, Math.min(255, Math.round(r * scale)));
    data.data[i + 1] = Math.max(0, Math.min(255, Math.round(g * scale)));
    data.data[i + 2] = Math.max(0, Math.min(255, Math.round(b * scale)));
  }
  ctx.putImageData(data, 0, 0);
}

function applyVibrance(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number) {
  if (amount === 100) return;
  const data = ctx.getImageData(0, 0, w, h);
  const factor = amount / 100;
  for (let i = 0; i < data.data.length; i += 4) {
    const r = data.data[i];
    const g = data.data[i + 1];
    const b = data.data[i + 2];
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const sat = (maxC - minC) / 255;
    const vib = 1 + (factor - 1) * Math.max(0, 1 - sat);
    const avg = (r + g + b) / 3;
    data.data[i] = Math.max(0, Math.min(255, Math.round(avg + (r - avg) * vib)));
    data.data[i + 1] = Math.max(0, Math.min(255, Math.round(avg + (g - avg) * vib)));
    data.data[i + 2] = Math.max(0, Math.min(255, Math.round(avg + (b - avg) * vib)));
  }
  ctx.putImageData(data, 0, 0);
}

export function AdjustmentsModal({ imageUrl, itemId, onClose, onSuccess, onUpload, locale }: AdjustmentsModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [sharpness, setSharpness] = useState(100);
  const [temperature, setTemperature] = useState(0);
  const [tint, setTint] = useState(0);
  const [highlights, setHighlights] = useState(100);
  const [shadows, setShadows] = useState(100);
  const [vibrance, setVibrance] = useState(100);
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
    if (!canvasRef.current || !imgRef.current || !imgRef.current.complete || !imgRef.current.naturalWidth) return;
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
    ctx.filter = `brightness(${brightness / 100}) contrast(${contrast / 100}) saturate(${saturation / 100})`;
    ctx.drawImage(img, 0, 0, w, h);
    ctx.filter = 'none';
    if (sharpness !== 100) {
      if (sharpness > 100) applySharpness(ctx, w, h, (sharpness - 100) / 100);
      else applyBlur(ctx, w, h, (100 - sharpness) / 100);
    }
    if (temperature !== 0) applyTemperature(ctx, w, h, temperature);
    if (tint !== 0) applyTint(ctx, w, h, tint);
    if (highlights !== 100) applyHighlights(ctx, w, h, highlights);
    if (shadows !== 100) applyShadows(ctx, w, h, shadows);
    if (vibrance !== 100) applyVibrance(ctx, w, h, vibrance);
  }, [brightness, contrast, saturation, sharpness, temperature, tint, highlights, shadows, vibrance]);

  useEffect(() => {
    if (!blobUrl) return;
    draw();
  }, [blobUrl, draw]);

  const onImageLoad = useCallback(() => {
    setLoading(false);
    draw();
  }, [draw]);

  const applyPipeline = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, img: HTMLImageElement) => {
      ctx.filter = `brightness(${brightness / 100}) contrast(${contrast / 100}) saturate(${saturation / 100})`;
      ctx.drawImage(img, 0, 0, width, height);
      ctx.filter = 'none';
      if (sharpness !== 100) {
        if (sharpness > 100) applySharpness(ctx, width, height, (sharpness - 100) / 100);
        else applyBlur(ctx, width, height, (100 - sharpness) / 100);
      }
      if (temperature !== 0) applyTemperature(ctx, width, height, temperature);
      if (tint !== 0) applyTint(ctx, width, height, tint);
      if (highlights !== 100) applyHighlights(ctx, width, height, highlights);
      if (shadows !== 100) applyShadows(ctx, width, height, shadows);
      if (vibrance !== 100) applyVibrance(ctx, width, height, vibrance);
    },
    [brightness, contrast, saturation, sharpness, temperature, tint, highlights, shadows, vibrance]
  );

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
      applyPipeline(ctx, w, h, img);
      const blob = await new Promise<Blob>((res, rej) => {
        canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png');
      });
      const file = new File([blob], 'adjustments.png', { type: 'image/png' });
      await onUpload(itemId, file);
      onSuccess();
      onClose();
    } catch (e) {
      setError((e as Error)?.message ?? 'Apply failed');
    } finally {
      setApplying(false);
    }
  }, [applyPipeline, itemId, onUpload, onSuccess, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  type SliderDef = { label: string; value: number; set: (v: number) => void; min: number; max: number; display: (v: number) => number };
  const sections: { titleKey: string; sliders: SliderDef[] }[] = [
    {
      titleKey: 'studio.section.light',
      sliders: [
        { label: t(locale, 'studio.brightness'), value: brightness, set: setBrightness, min: 0, max: 200, display: (v) => v },
        { label: t(locale, 'studio.contrast'), value: contrast, set: setContrast, min: 0, max: 200, display: (v) => v },
        { label: t(locale, 'studio.highlights'), value: highlights, set: setHighlights, min: 0, max: 200, display: (v) => v },
        { label: t(locale, 'studio.shadows'), value: shadows, set: setShadows, min: 0, max: 200, display: (v) => v },
      ],
    },
    {
      titleKey: 'studio.section.color',
      sliders: [
        { label: t(locale, 'studio.saturation'), value: saturation, set: setSaturation, min: 0, max: 200, display: (v) => v },
        { label: t(locale, 'studio.vibrance'), value: vibrance, set: setVibrance, min: 0, max: 200, display: (v) => v },
        { label: t(locale, 'studio.temperature'), value: temperature + 100, set: (v) => setTemperature(v - 100), min: 0, max: 200, display: (v) => v - 100 },
        { label: t(locale, 'studio.tint'), value: tint + 100, set: (v) => setTint(v - 100), min: 0, max: 200, display: (v) => v - 100 },
      ],
    },
    {
      titleKey: 'studio.section.detail',
      sliders: [
        { label: t(locale, 'studio.sharpness'), value: sharpness, set: setSharpness, min: 0, max: 200, display: (v) => v },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-theme-bg-overlay" role="dialog" aria-modal="true">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div className="relative z-10 bg-theme-bg rounded-xl border border-theme-border shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-theme-border">
          <h3 className="font-semibold text-theme-fg">{t(locale, 'studio.adjustments')}</h3>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-theme-fg-subtle hover:text-theme-fg hover:bg-theme-bg-hover" aria-label="Close">
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
          <div className="w-full sm:w-64 shrink-0 space-y-4 overflow-auto">
            {sections.map((sec) => (
              <div key={sec.titleKey}>
                <p className="text-xs font-medium text-theme-fg-muted mb-2">{t(locale, sec.titleKey)}</p>
                <div className="space-y-3">
                  {sec.sliders.map((s) => (
                    <div key={s.label}>
                      <label className="flex items-center justify-between text-xs text-theme-fg-muted mb-1">
                        <span>{s.label}</span>
                        <span>{s.display(s.value)}{s.display(s.value) === s.value ? '%' : ''}</span>
                      </label>
                      <input
                        type="range"
                        min={s.min}
                        max={s.max}
                        value={s.value}
                        onChange={(e) => s.set(Number(e.target.value))}
                        className="w-full h-2 rounded-lg appearance-none bg-theme-bg-hover accent-theme-accent"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-theme-border">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-theme-border text-theme-fg hover:bg-theme-bg-hover">
            {t(locale, 'dialog.cancel')}
          </button>
          <button type="button" onClick={handleApply} disabled={loading || applying} className="px-4 py-2 rounded-lg bg-theme-accent text-theme-fg-inverse hover:opacity-90 disabled:opacity-50">
            {applying ? '...' : t(locale, 'studio.apply')}
          </button>
        </div>
      </div>
    </div>
  );
}
