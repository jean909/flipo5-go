'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { downloadMediaUrl } from '@/lib/api';
import { t } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';

export type PaintTool = 'clone' | 'colorize' | 'highlight';

interface PaintCanvasProps {
  imageUrl: string;
  tool: PaintTool;
  brushSize: number;
  colorizeColor: string;
  highlightColor: string;
  highlightOpacity: number;
  onApply: (canvas: HTMLCanvasElement) => void;
  /** When set and tool is highlight, Apply exports mask (white = drawn) and calls this instead of onApply */
  onExportMask?: (maskBlob: Blob) => void;
  /** When set and tool is highlight: show floating OK at bottom; on OK click export mask and call this (parent closes canvas) */
  onMaskOk?: (maskBlob: Blob) => void;
  onClose: () => void;
  applying: boolean;
  locale: Locale;
  /** Match zoom/pan from main view so image doesn't jump when entering brush */
  initialScale?: number;
  initialPan?: { x: number; y: number };
  /** When set, use this exact size (parent already applied scale/pan) so view doesn't resize */
  contentSize?: { w: number; h: number };
}

export function PaintCanvas({
  imageUrl,
  tool,
  brushSize,
  colorizeColor,
  highlightColor,
  highlightOpacity,
  onApply,
  onExportMask,
  onMaskOk,
  onClose,
  applying,
  locale,
  initialScale = 1,
  initialPan = { x: 0, y: 0 },
  contentSize,
}: PaintCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const cloneSource = useRef<{ x: number; y: number } | null>(null);
  const strokeStart = useRef<{ x: number; y: number } | null>(null);
  const dims = useRef<{ w: number; h: number; scale: number }>({ w: 0, h: 0, scale: 1 });

  useEffect(() => {
    let url: string | null = null;
    setLoading(true);
    setError(null);
    const setBlob = (blob: Blob) => {
      if (!blob.type.startsWith('image/')) {
        setError('Invalid image');
        setLoading(false);
        return;
      }
      url = URL.createObjectURL(blob);
      setBlobUrl(url);
    };
    const fail = () => {
      setError('Could not load image');
      setLoading(false);
    };
    const apiUrl = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_API_URL || '' : '';
    const isOurMediaProxy = imageUrl.includes('/api/media') || (apiUrl && imageUrl.startsWith(apiUrl));
    const isExternal = imageUrl.startsWith('http://') || imageUrl.startsWith('https://');
    let load: Promise<void>;
    if (isOurMediaProxy) {
      // No credentials: token is in URL; credentials + CORS * would be rejected by browser
      load = fetch(imageUrl)
        .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('Fetch failed'))))
        .then(setBlob)
        .catch(fail);
    } else if (isExternal) {
      load = fetch(imageUrl, { credentials: 'include' })
        .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('Fetch failed'))))
        .then(setBlob)
        .catch(() => downloadMediaUrl(imageUrl).then(setBlob).catch(fail));
    } else {
      load = fetch(imageUrl, { credentials: 'include' })
        .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('Fetch failed'))))
        .then(setBlob)
        .catch(() => downloadMediaUrl(imageUrl).then(setBlob).catch(fail));
    }
    const timeoutMs = 15000;
    const timeoutId = setTimeout(fail, timeoutMs);
    load.finally(() => clearTimeout(timeoutId)).catch(() => {});
    return () => {
      clearTimeout(timeoutId);
      if (url) URL.revokeObjectURL(url);
    };
  }, [imageUrl]);

  const initCanvases = useCallback(() => {
    const img = imgRef.current;
    const base = baseRef.current;
    const overlay = overlayRef.current;
    if (!img?.complete || !img.naturalWidth || !base || !overlay) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    base.width = w;
    base.height = h;
    overlay.width = w;
    overlay.height = h;
    const ctx = base.getContext('2d', { willReadFrequently: true });
    if (ctx) ctx.drawImage(img, 0, 0);
    const overlayCtx = overlay.getContext('2d', { willReadFrequently: false });
    if (overlayCtx) overlayCtx.clearRect(0, 0, w, h);
    dims.current = { w, h, scale: 1 };
  }, []);

  const onImageLoad = useCallback(() => {
    setLoading(false);
    initCanvases();
  }, [initCanvases]);

  const onImageError = useCallback(() => {
    setLoading(false);
    setError('Image failed to load');
  }, []);

  const toCanvasCoords = useCallback((e: React.MouseEvent) => {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect || !overlayRef.current) return null;
    const scaleX = overlayRef.current.width / rect.width;
    const scaleY = overlayRef.current.height / rect.height;
    return {
      x: Math.floor((e.clientX - rect.left) * scaleX),
      y: Math.floor((e.clientY - rect.top) * scaleY),
    };
  }, []);

  const drawClone = useCallback((x: number, y: number) => {
    const src = cloneSource.current;
    const start = strokeStart.current;
    const base = baseRef.current;
    const overlay = overlayRef.current;
    if (!src || !start || !base || !overlay) return;
    const ctx = overlay.getContext('2d', { willReadFrequently: false });
    const baseCtx = base.getContext('2d', { willReadFrequently: true });
    if (!ctx || !baseCtx) return;
    const r = Math.max(2, Math.floor(brushSize / 2));
    const sx = src.x + (x - start.x);
    const sy = src.y + (y - start.y);
    const sx0 = Math.max(0, sx - r);
    const sy0 = Math.max(0, sy - r);
    const dx0 = Math.max(0, x - r);
    const dy0 = Math.max(0, y - r);
    const size = r * 2;
    const data = baseCtx.getImageData(sx0, sy0, size, size);
    ctx.putImageData(data, dx0, dy0);
  }, [brushSize]);

  const drawBrush = useCallback((x: number, y: number) => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d', { willReadFrequently: false });
    if (!ctx) return;
    const r = Math.max(2, Math.floor(brushSize / 2));
    if (tool === 'colorize') {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = colorizeColor;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else if (tool === 'highlight') {
      const hex = highlightColor.replace('#', '');
      const rr = parseInt(hex.slice(0, 2), 16);
      const gg = parseInt(hex.slice(2, 4), 16);
      const bb = parseInt(hex.slice(4, 6), 16);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgba(${rr},${gg},${bb},${highlightOpacity})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [tool, brushSize, colorizeColor, highlightColor, highlightOpacity]);

  const handlePointerDown = useCallback((e: React.MouseEvent) => {
    const pos = toCanvasCoords(e);
    if (!pos) return;
    if (e.altKey && tool === 'clone') {
      cloneSource.current = { x: pos.x, y: pos.y };
      return;
    }
    isDrawing.current = true;
    lastPos.current = pos;
    strokeStart.current = { x: pos.x, y: pos.y };
    if (tool === 'clone') drawClone(pos.x, pos.y);
    else drawBrush(pos.x, pos.y);
  }, [tool, toCanvasCoords, drawClone, drawBrush]);

  const handlePointerMove = useCallback((e: React.MouseEvent) => {
    const pos = toCanvasCoords(e);
    if (!pos || !isDrawing.current) return;
    if (tool === 'clone') {
      const prev = lastPos.current;
      const steps = Math.max(1, Math.floor(Math.hypot(pos.x - (prev?.x ?? pos.x), pos.y - (prev?.y ?? pos.y)) / 2));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = Math.round((prev?.x ?? pos.x) + (pos.x - (prev?.x ?? pos.x)) * t);
        const y = Math.round((prev?.y ?? pos.y) + (pos.y - (prev?.y ?? pos.y)) * t);
        drawClone(x, y);
      }
    } else {
      const prev = lastPos.current;
      if (prev) {
        const steps = Math.max(1, Math.floor(Math.hypot(pos.x - prev.x, pos.y - prev.y) / 2));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const x = Math.round(prev.x + (pos.x - prev.x) * t);
          const y = Math.round(prev.y + (pos.y - prev.y) * t);
          drawBrush(x, y);
        }
      } else drawBrush(pos.x, pos.y);
    }
    lastPos.current = pos;
  }, [tool, toCanvasCoords, drawClone, drawBrush]);

  const handlePointerUp = useCallback(() => {
    isDrawing.current = false;
    lastPos.current = null;
    strokeStart.current = null;
  }, []);

  const exportMaskBlob = useCallback((): Promise<Blob | null> => {
    const overlay = overlayRef.current;
    if (!overlay) return Promise.resolve(null);
    const w = overlay.width;
    const h = overlay.height;
    const mask = document.createElement('canvas');
    mask.width = w;
    mask.height = h;
    const mCtx = mask.getContext('2d');
    if (!mCtx) return Promise.resolve(null);
    mCtx.fillStyle = '#000000';
    mCtx.fillRect(0, 0, w, h);
    const src = mCtx.getImageData(0, 0, w, h);
    const overlayCtx = overlay.getContext('2d');
    if (!overlayCtx) return Promise.resolve(null);
    const ov = overlayCtx.getImageData(0, 0, w, h);
    for (let i = 0; i < ov.data.length; i += 4) {
      if (ov.data[i + 3] > 10) {
        src.data[i] = 255;
        src.data[i + 1] = 255;
        src.data[i + 2] = 255;
        src.data[i + 3] = 255;
      }
    }
    mCtx.putImageData(src, 0, 0);
    return new Promise((resolve) => {
      mask.toBlob((b) => resolve(b), 'image/png');
    });
  }, []);

  const handleApply = useCallback(() => {
    const base = baseRef.current;
    const overlay = overlayRef.current;
    if (!base || !overlay) return;
    if (tool === 'highlight' && onExportMask) {
      exportMaskBlob().then((blob) => { if (blob) onExportMask(blob); });
      return;
    }
    const w = base.width;
    const h = base.height;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(base, 0, 0);
    ctx.drawImage(overlay, 0, 0);
    onApply(out);
  }, [tool, onApply, onExportMask, exportMaskBlob]);

  const handleFloatingOk = useCallback(() => {
    if (tool !== 'highlight' || !onMaskOk) return;
    exportMaskBlob().then((blob) => { if (blob) onMaskOk(blob); });
  }, [tool, onMaskOk, exportMaskBlob]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-theme-fg-subtle">
        <p>{error}</p>
        <button type="button" onClick={onClose} className="mt-2 px-3 py-1.5 rounded border border-theme-border hover:bg-theme-bg-hover text-sm">
          {t(locale, 'dialog.cancel')}
        </button>
      </div>
    );
  }

  if (!blobUrl) {
    return (
      <div className="flex items-center justify-center p-12 text-theme-fg-subtle">
        {t(locale, 'common.loading')}
      </div>
    );
  }

  const baseW = baseRef.current?.width ?? 0;
  const baseH = baseRef.current?.height ?? 0;
  const aspectRatio = baseW && baseH ? baseW / baseH : 1;

  const useParentSize = !!contentSize;
  return (
    <div className="w-full h-full flex items-center justify-center min-h-0">
      <div
        ref={containerRef}
        className="relative origin-center w-full max-w-full max-h-[calc(100vh-14rem)]"
        style={{
          ...(contentSize ? { width: contentSize.w, height: contentSize.h } : { aspectRatio: loading ? undefined : aspectRatio }),
          ...(!useParentSize ? { transform: `translate(${initialPan.x}px, ${initialPan.y}px) scale(${initialScale})` } : {}),
        }}
      >
      <img
        ref={(el) => { imgRef.current = el; }}
        src={blobUrl}
        alt=""
        className="hidden"
        onLoad={onImageLoad}
        onError={onImageError}
      />
      {loading && (
        <div className="flex items-center justify-center p-12 text-theme-fg-subtle">
          {t(locale, 'common.loading')}
        </div>
      )}
      {!loading && (
        <>
          <canvas
            ref={baseRef}
            className="absolute left-0 top-0 w-full h-full block"
            style={{ pointerEvents: 'none' }}
          />
          <canvas
            ref={overlayRef}
            className="absolute left-0 top-0 w-full h-full block cursor-crosshair"
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
          />
          <div className="absolute bottom-2 left-2 text-xs text-theme-fg-subtle bg-theme-bg-overlay/80 px-2 py-1 rounded">
            {tool === 'clone' && (cloneSource.current ? 'Clone: drag to paint. Alt+click to set new source.' : 'Alt+click to set source, then drag to clone.')}
          </div>
          <div className="absolute top-2 right-2 flex gap-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg border border-theme-border text-theme-fg hover:bg-theme-bg-hover text-sm">
              {t(locale, 'dialog.cancel')}
            </button>
            {!(tool === 'highlight' && onMaskOk) && (
              <button type="button" onClick={handleApply} disabled={applying} className="px-3 py-1.5 rounded-lg bg-theme-accent text-theme-fg-inverse hover:opacity-90 disabled:opacity-50 text-sm font-medium">
                {applying ? '...' : (tool === 'highlight' && onExportMask ? 'Edit with AI' : t(locale, 'studio.apply'))}
              </button>
            )}
          </div>
          {tool === 'highlight' && onMaskOk && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10">
              <button
                type="button"
                onClick={handleFloatingOk}
                disabled={applying}
                className="px-6 py-2.5 rounded-xl bg-theme-accent text-theme-fg-inverse font-medium shadow-lg hover:opacity-90 disabled:opacity-50 text-sm"
              >
                OK
              </button>
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
}
