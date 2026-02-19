'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type LogoOverlayItem =
  | {
      id: string;
      type: 'image';
      url: string;
      name: string;
      pos: { x: number; y: number };
      size: { w: number; h: number };
      rotation?: number;
    }
  | {
      id: string;
      type: 'text';
      text: string;
      fontSize: number; // proportion of base image height, e.g. 0.05
      fontFamily: string;
      color: string;
      pos: { x: number; y: number };
      size: { w: number; h: number };
      rotation?: number;
    };

interface MultiLogoPlacerProps {
  baseImageUrl: string;
  overlays: LogoOverlayItem[];
  getLogoDisplayUrl: (url: string) => string;
  onUpdate: (id: string, patch: { pos?: { x: number; y: number }; size?: { w: number; h: number }; rotation?: number; text?: string; fontSize?: number; fontFamily?: string; color?: string }) => void;
  onRemove: (id: string) => void;
  onApply: (canvas: HTMLCanvasElement) => void;
  onApplyElement?: (canvas: HTMLCanvasElement, id: string) => void;
  onClose: () => void;
  applying: boolean;
  contentSize: { w: number; h: number };
}

export function MultiLogoPlacer({
  baseImageUrl,
  overlays,
  getLogoDisplayUrl,
  onUpdate,
  onRemove,
  onApply,
  onApplyElement,
  onClose,
  applying,
  contentSize,
}: MultiLogoPlacerProps) {
  const baseImgRef = useRef<HTMLImageElement>(null);
  const overlayImgRefs = useRef<Record<string, HTMLImageElement | null>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const [baseSize, setBaseSize] = useState<{ w: number; h: number } | null>(null);
  const [activeDrag, setActiveDrag] = useState<string | null>(null);
  const [activeResize, setActiveResize] = useState<string | null>(null);
  const [activeRotate, setActiveRotate] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const textEditInputRef = useRef<HTMLInputElement | null>(null);
  const dragStart = useRef({ x: 0, y: 0, pos: { x: 0, y: 0 } });
  const resizeStart = useRef({ x: 0, y: 0, size: { w: 0, h: 0 } });
  const rotateStart = useRef({ angle: 0, mouseAngle: 0 });

  const onBaseLoad = useCallback(() => {
    const img = baseImgRef.current;
    if (img) setBaseSize({ w: img.naturalWidth, h: img.naturalHeight });
  }, []);

  useEffect(() => {
    const img = baseImgRef.current;
    if (img?.complete) setBaseSize({ w: img.naturalWidth, h: img.naturalHeight });
  }, [baseImageUrl]);

  useEffect(() => {
    if (editingTextId) {
      const t = setTimeout(() => {
        textEditInputRef.current?.focus();
        textEditInputRef.current?.select();
      }, 50);
      return () => clearTimeout(t);
    }
  }, [editingTextId]);

  const drawOverlay = useCallback((ctx: CanvasRenderingContext2D, o: LogoOverlayItem, baseSize: { w: number; h: number }) => {
    const cx = o.pos.x * baseSize.w;
    const cy = o.pos.y * baseSize.h;
    const deg = o.rotation ?? 0;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((deg * Math.PI) / 180);
    if (o.type === 'image') {
      const logoImg = overlayImgRefs.current[o.id];
      if (!logoImg?.complete) { ctx.restore(); return; }
      const w = o.size.w * baseSize.w;
      const h = o.size.h * baseSize.h;
      ctx.drawImage(logoImg, 0, 0, logoImg.naturalWidth, logoImg.naturalHeight, -w / 2, -h / 2, w, h);
    } else {
      const px = o.fontSize * baseSize.h;
      ctx.font = `bold ${px}px ${o.fontFamily}, sans-serif`;
      ctx.fillStyle = o.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(o.text, 0, 0);
    }
    ctx.restore();
  }, []);

  const handleApply = useCallback(() => {
    if (!baseSize) return;
    const baseImg = baseImgRef.current;
    if (!baseImg) return;
    const canvas = document.createElement('canvas');
    canvas.width = baseSize.w;
    canvas.height = baseSize.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(baseImg, 0, 0);
    for (const o of overlays) drawOverlay(ctx, o, baseSize);
    onApply(canvas);
  }, [baseSize, overlays, onApply, drawOverlay]);

  const handleApplySingle = useCallback((id: string) => {
    if (!baseSize || !onApplyElement) return;
    const baseImg = baseImgRef.current;
    if (!baseImg) return;
    const o = overlays.find((x) => x.id === id);
    if (!o) return;
    const canvas = document.createElement('canvas');
    canvas.width = baseSize.w;
    canvas.height = baseSize.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(baseImg, 0, 0);
    drawOverlay(ctx, o, baseSize);
    onApplyElement(canvas, id);
  }, [baseSize, overlays, onApplyElement, drawOverlay]);

  useEffect(() => {
    if (!activeDrag && !activeResize && !activeRotate) return;
    const rect = containerRef.current?.getBoundingClientRect();
    const onMove = (e: MouseEvent) => {
      const { w: boxW, h: boxH } = contentSize;
      if (activeDrag) {
        const dx = (e.clientX - dragStart.current.x) / boxW;
        const dy = (e.clientY - dragStart.current.y) / boxH;
        onUpdate(activeDrag, {
          pos: {
            x: Math.max(0, Math.min(1, dragStart.current.pos.x + dx)),
            y: Math.max(0, Math.min(1, dragStart.current.pos.y + dy)),
          },
        });
      }
      if (activeResize) {
        const dx = (e.clientX - resizeStart.current.x) / boxW;
        const dy = (e.clientY - resizeStart.current.y) / boxH;
        const d = (dx + dy) / 2;
        const w = Math.max(0.05, Math.min(0.8, resizeStart.current.size.w + d));
        const h = Math.max(0.05, Math.min(0.8, resizeStart.current.size.h + d));
        onUpdate(activeResize, { size: { w, h } });
      }
      if (activeRotate && rect) {
        const mx = (e.clientX - rect.left) / rect.width * boxW;
        const my = (e.clientY - rect.top) / rect.height * boxH;
        const o = overlays.find((x) => x.id === activeRotate);
        if (o) {
          const cx = o.pos.x * boxW;
          const cy = o.pos.y * boxH;
          const angleDeg = (Math.atan2(my - cy, mx - cx) * 180) / Math.PI;
          const delta = angleDeg - rotateStart.current.mouseAngle;
          let r = rotateStart.current.angle + delta;
          while (r > 180) r -= 360;
          while (r < -180) r += 360;
          onUpdate(activeRotate, { rotation: r });
        }
      }
    };
    const onUp = () => {
      setActiveDrag(null);
      setActiveResize(null);
      setActiveRotate(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [activeDrag, activeResize, activeRotate, contentSize, onUpdate, overlays]);

  const boxW = contentSize.w;
  const boxH = contentSize.h;

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="relative flex-1 flex items-center justify-center min-h-0">
        <div ref={containerRef} className="relative" style={{ width: boxW, height: boxH }}>
          <img
            ref={baseImgRef}
            src={baseImageUrl}
            alt=""
            crossOrigin="anonymous"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            onLoad={onBaseLoad}
            draggable={false}
          />
          {overlays.map((o) => {
            const leftPct = (o.pos.x - o.size.w / 2) * 100;
            const topPct = (o.pos.y - o.size.h / 2) * 100;
            const rot = o.rotation ?? 0;
            const isImage = o.type === 'image';
            const displayUrl = isImage ? getLogoDisplayUrl(o.url) : '';
            return (
              <div
                key={o.id}
                className="absolute border-2 border-theme-accent cursor-move flex items-center justify-center bg-black/20 group"
                style={{
                  left: `${leftPct}%`,
                  top: `${topPct}%`,
                  width: `${o.size.w * 100}%`,
                  height: `${o.size.h * 100}%`,
                  transform: `rotate(${rot}deg)`,
                }}
                onMouseDown={(e) => {
                  if ((e.target as HTMLElement).closest('[data-resize-handle]') || (e.target as HTMLElement).closest('[data-remove-handle]') || (e.target as HTMLElement).closest('[data-rotate-handle]') || (e.target as HTMLElement).closest('[data-apply-handle]') || (e.target as HTMLElement).closest('[data-text-edit-input]')) return;
                  if (o.type === 'text' && editingTextId === o.id) return;
                  e.preventDefault();
                  setActiveDrag(o.id);
                  dragStart.current = { x: e.clientX, y: e.clientY, pos: { ...o.pos } };
                }}
                onDoubleClick={(e) => {
                  if (o.type !== 'text') return;
                  e.stopPropagation();
                  e.preventDefault();
                  setEditingTextId(o.id);
                }}
              >
                {isImage ? (
                  <>
                    <img
                      ref={(el) => { overlayImgRefs.current[o.id] = el; }}
                      src={displayUrl}
                      alt=""
                      crossOrigin="anonymous"
                      className="absolute w-full h-full object-contain pointer-events-none opacity-0"
                      draggable={false}
                      aria-hidden
                    />
                    <img src={displayUrl} alt={o.name} crossOrigin="anonymous" className="max-w-full max-h-full object-contain pointer-events-none" draggable={false} />
                  </>
                ) : editingTextId === o.id ? (
                  <input
                    data-text-edit-input
                    ref={(el) => { if (o.id === editingTextId) textEditInputRef.current = el; }}
                    type="text"
                    value={o.text}
                    onChange={(e) => onUpdate(o.id, { text: e.target.value })}
                    onBlur={() => setEditingTextId(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        (e.target as HTMLInputElement).blur();
                      }
                      e.stopPropagation();
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full min-w-0 bg-transparent border-none outline-none text-center font-bold leading-none focus:ring-0 p-0"
                    style={{
                      fontFamily: `${o.fontFamily}, sans-serif`,
                      fontSize: o.size.h > 0 ? `${(o.fontSize / o.size.h) * 100}%` : '50%',
                      color: o.color,
                    }}
                  />
                ) : (
                  <span
                    className="pointer-events-none text-center font-bold whitespace-nowrap overflow-hidden max-w-full max-h-full leading-none select-none"
                    style={{
                      fontFamily: `${o.fontFamily}, sans-serif`,
                      fontSize: o.size.h > 0 ? `${(o.fontSize / o.size.h) * 100}%` : '50%',
                      color: o.color,
                    }}
                  >
                    {o.text || 'Text'}
                  </span>
                )}
                <button
                  data-remove-handle
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onRemove(o.id); }}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-theme-danger text-white flex items-center justify-center text-xs font-bold opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity z-10"
                  aria-label="Remove"
                >
                  ×
                </button>
                {onApplyElement && (
                  <button
                    data-apply-handle
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleApplySingle(o.id); }}
                    className="absolute -top-1 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-theme-accent text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity z-10"
                    aria-label="Apply"
                    title="Apply to image"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                  </button>
                )}
                <div
                  data-rotate-handle
                  className="absolute -top-1 -left-1 w-5 h-5 cursor-grab rounded border border-theme-accent bg-theme-bg flex items-center justify-center active:cursor-grabbing opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity z-10"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const rect = containerRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    const mx = (e.clientX - rect.left) / rect.width * boxW;
                    const my = (e.clientY - rect.top) / rect.height * boxH;
                    const cx = o.pos.x * boxW;
                    const cy = o.pos.y * boxH;
                    const mouseAngle = (Math.atan2(my - cy, mx - cx) * 180) / Math.PI;
                    rotateStart.current = { angle: rot, mouseAngle };
                    setActiveRotate(o.id);
                  }}
                  title="Rotate"
                >
                  <svg className="w-4 h-4 text-theme-fg" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </div>
                <div
                  data-resize-handle
                  className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize border-t-2 border-l-2 border-theme-accent bg-theme-bg"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setActiveResize(o.id);
                    resizeStart.current = { x: e.clientX, y: e.clientY, size: { ...o.size } };
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 p-2 border-t border-theme-border bg-theme-bg">
        <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg border border-theme-border bg-theme-bg-hover text-theme-fg text-sm font-medium">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleApply}
          disabled={applying || overlays.length === 0}
          className="px-4 py-2 rounded-lg bg-theme-accent text-theme-fg-on-accent font-medium text-sm disabled:opacity-50"
        >
          {applying ? 'Applying…' : 'Apply'}
        </button>
      </div>
    </div>
  );
}
