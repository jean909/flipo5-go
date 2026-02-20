'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { downloadMediaUrl } from '@/lib/api';

type Rotation = 0 | 90 | 180 | 270;

interface CropRotateModalProps {
  imageUrl: string;
  itemId: string;
  onClose: () => void;
  onSuccess: () => void;
  onUpload: (itemId: string, file: File) => Promise<void>;
  locale: Locale;
}

export function CropRotateModal({ imageUrl, itemId, onClose, onSuccess, onUpload, locale }: CropRotateModalProps) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rotation, setRotation] = useState<Rotation>(0);
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [drag, setDrag] = useState<{ startX: number; startY: number } | null>(null);
  const [applying, setApplying] = useState(false);
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });

  const rotatedSize = rotation === 90 || rotation === 270
    ? { w: naturalSize.h, h: naturalSize.w }
    : { w: naturalSize.w, h: naturalSize.h };

  useEffect(() => {
    if (rotatedSize.w > 0 && rotatedSize.h > 0) {
      setCrop((prev) => {
        if (prev.w === rotatedSize.w && prev.h === rotatedSize.h) return prev;
        return { x: 0, y: 0, w: rotatedSize.w, h: rotatedSize.h };
      });
    }
  }, [rotation, rotatedSize.w, rotatedSize.h]);

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
          .then((r) => r.ok ? r.blob() : Promise.reject(new Error('Fetch failed')))
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

  const onImageLoad = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    setNaturalSize({ w, h });
    const rw = rotation === 90 || rotation === 270 ? h : w;
    const rh = rotation === 90 || rotation === 270 ? w : h;
    setCrop({ x: 0, y: 0, w: rw, h: rh });
    setLoading(false);
  }, [rotation]);

  useEffect(() => {
    if (!blobUrl || !imgRef.current) return;
    const img = imgRef.current;
    if (img.complete && img.naturalWidth) {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      setNaturalSize({ w, h });
      const rw = rotation === 90 || rotation === 270 ? h : w;
      const rh = rotation === 90 || rotation === 270 ? w : h;
      setCrop((prev) => (prev.w === 0 ? { x: 0, y: 0, w: rw, h: rh } : prev));
      setLoading(false);
    }
  }, [blobUrl, rotation]);

  useEffect(() => {
    if (!canvasRef.current || !imgRef.current || naturalSize.w === 0 || rotatedSize.w === 0) return;
    const img = imgRef.current;
    const canvas = canvasRef.current;
    const maxW = 800;
    const maxH = 500;
    const scale = Math.min(1, maxW / rotatedSize.w, maxH / rotatedSize.h);
    const dw = Math.round(rotatedSize.w * scale);
    const dh = Math.round(rotatedSize.h * scale);
    canvas.width = dw;
    canvas.height = dh;
    setDisplaySize({ w: dw, h: dh });
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.scale(dw / rotatedSize.w, dh / rotatedSize.h);
    ctx.translate(rotatedSize.w / 2, rotatedSize.h / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-naturalSize.w / 2, -naturalSize.h / 2);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }, [blobUrl, naturalSize, rotation, rotatedSize.w, rotatedSize.h]);

  const getImageCoords = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas || rotatedSize.w === 0 || displaySize.w === 0) return null;
    const r = canvas.getBoundingClientRect();
    const scaleX = rotatedSize.w / r.width;
    const scaleY = rotatedSize.h / r.height;
    const x = Math.max(0, Math.min(rotatedSize.w, (clientX - r.left) * scaleX));
    const y = Math.max(0, Math.min(rotatedSize.h, (clientY - r.top) * scaleY));
    return { x, y };
  }, [rotatedSize, displaySize.w]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const coords = getImageCoords(e.clientX, e.clientY);
    if (coords) setDrag({ startX: coords.x, startY: coords.y });
  }, [getImageCoords]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drag) return;
    const coords = getImageCoords(e.clientX, e.clientY);
    if (!coords) return;
    const x = Math.min(drag.startX, coords.x);
    const y = Math.min(drag.startY, coords.y);
    const w = Math.max(1, Math.abs(coords.x - drag.startX));
    const h = Math.max(1, Math.abs(coords.y - drag.startY));
    setCrop({
      x: Math.max(0, Math.min(rotatedSize.w - w, x)),
      y: Math.max(0, Math.min(rotatedSize.h - h, y)),
      w: Math.min(w, rotatedSize.w - x),
      h: Math.min(h, rotatedSize.h - y),
    });
  }, [drag, getImageCoords, rotatedSize]);

  const handleMouseUp = useCallback(() => setDrag(null), []);

  const handleApply = useCallback(async () => {
    if (!blobUrl || naturalSize.w === 0) return;
    setApplying(true);
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Image load failed'));
        img.src = blobUrl;
      });
      const rot = rotation;
      const rw = rot === 90 || rot === 270 ? naturalSize.h : naturalSize.w;
      const rh = rot === 90 || rot === 270 ? naturalSize.w : naturalSize.h;
      const canvas1 = document.createElement('canvas');
      canvas1.width = rw;
      canvas1.height = rh;
      const ctx1 = canvas1.getContext('2d');
      if (!ctx1) throw new Error('Canvas failed');
      ctx1.translate(rw / 2, rh / 2);
      ctx1.rotate((rot * Math.PI) / 180);
      ctx1.translate(-naturalSize.w / 2, -naturalSize.h / 2);
      ctx1.drawImage(img, 0, 0);
      const canvas2 = document.createElement('canvas');
      canvas2.width = Math.round(crop.w);
      canvas2.height = Math.round(crop.h);
      const ctx2 = canvas2.getContext('2d');
      if (!ctx2) throw new Error('Canvas failed');
      ctx2.drawImage(canvas1, crop.x, crop.y, crop.w, crop.h, 0, 0, canvas2.width, canvas2.height);
      const blob = await new Promise<Blob>((res, rej) => {
        canvas2.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png');
      });
      const file = new File([blob], 'crop-rotate.png', { type: 'image/png' });
      await onUpload(itemId, file);
      onSuccess();
      onClose();
    } catch (e) {
      setError((e as Error)?.message ?? 'Apply failed');
    } finally {
      setApplying(false);
    }
  }, [blobUrl, naturalSize, rotation, crop, itemId, onUpload, onSuccess, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const cropStyle = rotatedSize.w > 0 && rotatedSize.h > 0
    ? {
        left: `${(crop.x / rotatedSize.w) * 100}%`,
        top: `${(crop.y / rotatedSize.h) * 100}%`,
        width: `${(crop.w / rotatedSize.w) * 100}%`,
        height: `${(crop.h / rotatedSize.h) * 100}%`,
      }
    : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-theme-bg-overlay" role="dialog" aria-modal="true">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div className="relative z-10 bg-theme-bg rounded-xl border border-theme-border shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-theme-border">
          <h3 className="font-semibold text-theme-fg">{t(locale, 'studio.cropRotate')}</h3>
          <button type="button" onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-theme-fg-subtle hover:text-theme-fg hover:bg-theme-bg-hover" aria-label="Close">×</button>
        </div>
        {error && (
          <div className="px-4 py-2 text-sm text-theme-danger bg-theme-danger-muted">{error}</div>
        )}
        <div className="flex items-center gap-2 p-2 border-b border-theme-border flex-wrap">
          <span className="text-xs text-theme-fg-subtle">{t(locale, 'studio.rotate')}:</span>
          <button type="button" onClick={() => setRotation((r) => ((r - 90 + 360) % 360) as Rotation)} className="px-3 py-1.5 rounded-lg border border-theme-border bg-theme-bg-hover text-theme-fg text-sm hover:bg-theme-bg-hover-strong">
            −90°
          </button>
          <button type="button" onClick={() => setRotation((r) => ((r + 90) % 360) as Rotation)} className="px-3 py-1.5 rounded-lg border border-theme-border bg-theme-bg-hover text-theme-fg text-sm hover:bg-theme-bg-hover-strong">
            +90°
          </button>
          <span className="text-xs text-theme-fg-subtle ml-2">{t(locale, 'studio.crop')}:</span>
          <span className="text-xs text-theme-fg-subtle">{t(locale, 'studio.cropHint')}</span>
        </div>
        <div ref={containerRef} className="flex-1 min-h-0 overflow-auto p-4 flex items-center justify-center bg-theme-bg-subtle">
          {loading && !blobUrl && (
            <p className="text-theme-fg-subtle">{t(locale, 'common.loading')}</p>
          )}
          {blobUrl && (
            <>
              <img
                ref={imgRef}
                src={blobUrl}
                alt=""
                className="hidden"
                onLoad={onImageLoad}
              />
              <div
                className="relative inline-block select-none"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                style={{ cursor: 'crosshair' }}
              >
                <canvas ref={canvasRef} className="block max-w-full max-h-[60vh] w-full h-auto" />
                {rotatedSize.w > 0 && cropStyle && (
                  <div className="absolute inset-0 pointer-events-none">
                    <div
                      className="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
                      style={cropStyle}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-theme-border">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-theme-border text-theme-fg hover:bg-theme-bg-hover">
            {t(locale, 'dialog.cancel')}
          </button>
          <button type="button" onClick={handleApply} disabled={loading || applying || naturalSize.w === 0} className="px-4 py-2 rounded-lg bg-theme-accent text-theme-fg-inverse hover:opacity-90 disabled:opacity-50">
            {applying ? '...' : t(locale, 'studio.apply')}
          </button>
        </div>
      </div>
    </div>
  );
}
