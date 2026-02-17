'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface ThemeColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  label?: string;
}

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const v = max;
  const s = max === 0 ? 0 : d / max;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h: h * 360, s, v };
}

function hsvToHex(h: number, s: number, v: number): string {
  const i = Math.floor(h / 60) % 6;
  const f = h / 60 - Math.floor(h / 60);
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r = 0, g = 0, b = 0;
  switch (i) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    default: r = v; g = p; b = q;
  }
  const toByte = (x: number) => Math.min(255, Math.round(x * 255));
  return '#' + [toByte(r), toByte(g), toByte(b)].map((n) => n.toString(16).padStart(2, '0')).join('');
}

export function ThemeColorPicker({ value, onChange, label }: ThemeColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState(value);
  const boxRef = useRef<HTMLDivElement>(null);
  const { h, s, v } = hexToHsv(value);

  useEffect(() => {
    setInput(value);
  }, [value]);

  const updateFromHsv = useCallback((hue: number, sat: number, val: number) => {
    onChange(hsvToHex(hue, sat, val));
  }, [onChange]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open]);

  const onBoxClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    updateFromHsv(h, x, 1 - y);
  };

  const onHueClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    updateFromHsv(Math.min(360, Math.max(0, x * 360)), s, v);
  };

  return (
    <div className="relative" ref={boxRef}>
      {label && <label className="block text-xs font-medium text-theme-fg-muted mb-1">{label}</label>}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full h-9 rounded-lg border border-theme-border bg-theme-bg-subtle hover:bg-theme-bg-hover flex items-center gap-2 px-2"
      >
        <span className="w-6 h-6 rounded border border-theme-border shrink-0" style={{ backgroundColor: value }} />
        <span className="text-xs text-theme-fg font-mono truncate">{value}</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 p-3 rounded-xl border border-theme-border bg-theme-bg shadow-xl min-w-[200px]">
          <div
            className="w-full aspect-square rounded-lg border border-theme-border cursor-crosshair mb-2 overflow-hidden"
            style={{
              background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${h}, 100%, 50%))`,
            }}
            onClick={onBoxClick}
          />
          <div
            className="w-full h-3 rounded-full border border-theme-border cursor-pointer mb-2"
            style={{
              background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
            }}
            onClick={onHueClick}
          />
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => {
                const v = e.target.value;
                setInput(v);
                if (/^#[0-9A-Fa-f]{6}$/.test(v)) onChange(v);
              }}
              className="flex-1 px-2 py-1 rounded border border-theme-border bg-theme-bg text-theme-fg text-xs font-mono"
            />
          </div>
        </div>
      )}
    </div>
  );
}
