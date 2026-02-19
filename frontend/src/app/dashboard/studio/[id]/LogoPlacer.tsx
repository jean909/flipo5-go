'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface LogoPlacerProps {
  baseImageUrl: string;
  logoUrl: string;
  contentSize: { w: number; h: number };
  onApply: (canvas: HTMLCanvasElement) => void;
  onClose: () => void;
  applying: boolean;
}

/** Position and size in 0..1 relative to base image. Center (0.5,0.5), size (0.2,0.2) = 20% */
const DEFAULT_POS = { x: 0.5, y: 0.5 };
const DEFAULT_SIZE = { w: 0.2, h: 0.2 };

export function LogoPlacer({
  baseImageUrl,
  logoUrl,
  contentSize,
  onApply,
  onClose,
  applying,
}: LogoPlacerProps) {
  const [pos, setPos] = useState(DEFAULT_POS);
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [baseSize, setBaseSize] = useState<{ w: number; h: number } | null>(null);
  const [logoSize, setLogoSize] = useState<{ w: number; h: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, pos: DEFAULT_POS });
  const resizeStart = useRef({ x: 0, y: 0, size: DEFAULT_SIZE });
  const baseImgRef = useRef<HTMLImageElement>(null);
  const logoImgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = baseImgRef.current;
    if (!img?.complete) return;
    setBaseSize({ w: img.naturalWidth, h: img.naturalHeight });
  }, [baseImageUrl]);
  useEffect(() => {
    const img = logoImgRef.current;
    if (!img?.complete) return;
    setLogoSize({ w: img.naturalWidth, h: img.naturalHeight });
  }, [logoUrl]);

  const onBaseLoad = useCallback(() => {
    const img = baseImgRef.current;
    if (img) setBaseSize({ w: img.naturalWidth, h: img.naturalHeight });
  }, []);
  const onLogoLoad = useCallback(() => {
    const img = logoImgRef.current;
    if (img) setLogoSize({ w: img.naturalWidth, h: img.naturalHeight });
  }, []);

  const handleApply = useCallback(() => {
    if (!baseSize || !logoSize) return;
    const baseImg = baseImgRef.current;
    const logoImg = logoImgRef.current;
    if (!baseImg || !logoImg) return;
    const canvas = document.createElement('canvas');
    canvas.width = baseSize.w;
    canvas.height = baseSize.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(baseImg, 0, 0);
    const x = (pos.x - size.w / 2) * baseSize.w;
    const y = (pos.y - size.h / 2) * baseSize.h;
    const w = size.w * baseSize.w;
    const h = size.h * baseSize.h;
    ctx.drawImage(logoImg, 0, 0, logoSize.w, logoSize.h, x, y, w, h);
    onApply(canvas);
  }, [baseSize, logoSize, pos, size, onApply]);

  const boxW = contentSize.w;
  const boxH = contentSize.h;
  const leftPct = (pos.x - size.w / 2) * 100;
  const topPct = (pos.y - size.h / 2) * 100;

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="relative flex-1 flex items-center justify-center min-h-0">
        <div className="relative" style={{ width: boxW, height: boxH }}>
          <img
            ref={baseImgRef}
            src={baseImageUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            onLoad={onBaseLoad}
            draggable={false}
          />
          <img
            ref={logoImgRef}
            src={logoUrl}
            alt=""
            className="absolute w-full h-full object-contain pointer-events-none opacity-0"
            onLoad={onLogoLoad}
            draggable={false}
            aria-hidden
          />
          <div
            className="absolute border-2 border-theme-accent cursor-move flex items-center justify-center bg-black/20"
            style={{
              left: `${leftPct}%`,
              top: `${topPct}%`,
              width: `${size.w * 100}%`,
              height: `${size.h * 100}%`,
            }}
            onMouseDown={(e) => {
              if ((e.target as HTMLElement).closest('[data-resize-handle]')) return;
              e.preventDefault();
              setDragging(true);
              dragStart.current = { x: e.clientX, y: e.clientY, pos: { ...pos } };
            }}
          >
            <img
              src={logoUrl}
              alt=""
              className="max-w-full max-h-full object-contain pointer-events-none"
              draggable={false}
            />
            <div
              data-resize-handle
              className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize border-t-2 border-l-2 border-theme-accent bg-theme-bg"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setResizing(true);
                resizeStart.current = { x: e.clientX, y: e.clientY, size: { ...size } };
              }}
            />
          </div>
        </div>
      </div>
      {typeof window !== 'undefined' && (
        <LogoPlacerListeners
          dragging={dragging}
          resizing={resizing}
          setDragging={setDragging}
          setResizing={setResizing}
          setPos={setPos}
          setSize={setSize}
          dragStart={dragStart}
          resizeStart={resizeStart}
          boxW={boxW}
          boxH={boxH}
        />
      )}
      <div className="flex items-center justify-between gap-2 p-2 border-t border-theme-border bg-theme-bg">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-2 rounded-lg border border-theme-border bg-theme-bg-hover text-theme-fg text-sm font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleApply}
          disabled={applying || !baseSize || !logoSize}
          className="px-4 py-2 rounded-lg bg-theme-accent text-theme-fg-on-accent font-medium text-sm disabled:opacity-50"
        >
          {applying ? 'Applying…' : 'Apply'}
        </button>
      </div>
    </div>
  );
}

function LogoPlacerListeners({
  dragging,
  resizing,
  setDragging,
  setResizing,
  setPos,
  setSize,
  dragStart,
  resizeStart,
  boxW,
  boxH,
}: {
  dragging: boolean;
  resizing: boolean;
  setDragging: (v: boolean) => void;
  setResizing: (v: boolean) => void;
  setPos: (v: { x: number; y: number }) => void;
  setSize: (v: { w: number; h: number }) => void;
  dragStart: React.MutableRefObject<{ x: number; y: number; pos: { x: number; y: number } }>;
  resizeStart: React.MutableRefObject<{ x: number; y: number; size: { w: number; h: number } }>;
  boxW: number;
  boxH: number;
}) {
  useEffect(() => {
    if (!dragging && !resizing) return;
    const onMove = (e: MouseEvent) => {
      if (dragging) {
        const dx = (e.clientX - dragStart.current.x) / boxW;
        const dy = (e.clientY - dragStart.current.y) / boxH;
        setPos({
          x: Math.max(0, Math.min(1, dragStart.current.pos.x + dx)),
          y: Math.max(0, Math.min(1, dragStart.current.pos.y + dy)),
        });
      }
      if (resizing) {
        const dx = (e.clientX - resizeStart.current.x) / boxW;
        const dy = (e.clientY - resizeStart.current.y) / boxH;
        const d = (dx + dy) / 2;
        const w = Math.max(0.05, Math.min(0.8, resizeStart.current.size.w + d));
        const h = Math.max(0.05, Math.min(0.8, resizeStart.current.size.h + d));
        setSize({ w, h });
      }
    };
    const onUp = () => {
      setDragging(false);
      setResizing(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, resizing, setPos, setSize, boxW, boxH, setDragging, setResizing]);
  return null;
}
