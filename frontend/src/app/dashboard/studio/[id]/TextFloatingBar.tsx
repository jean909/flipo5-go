'use client';

import { useMemo } from 'react';
import { t } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { ThemeColorPicker } from './ThemeColorPicker';
import type { LogoOverlayItem } from './MultiLogoPlacer';

const PT_TO_PROP = (pt: number) => pt / 400;
const PROP_TO_PT = (p: number) => Math.round(p * 400);

const FONT_OPTIONS: { label: string; family: string }[] = [
  { label: 'Arial', family: 'Arial' },
  { label: 'Helvetica', family: 'Helvetica' },
  { label: 'Verdana', family: 'Verdana' },
  { label: 'Tahoma', family: 'Tahoma' },
  { label: 'Georgia', family: 'Georgia' },
  { label: 'Times New Roman', family: 'Times New Roman' },
  { label: 'Impact', family: 'Impact' },
  { label: 'Comic Sans MS', family: 'Comic Sans MS' },
  { label: 'Courier New', family: 'Courier New' },
];

const SIZE_PRESETS = [12, 14, 16, 18, 24];

interface TextFloatingBarProps {
  overlay: Extract<LogoOverlayItem, { type: 'text' }>;
  onUpdate: (patch: { fontSize?: number; fontFamily?: string; color?: string }) => void;
  onApply: () => void;
  locale: Locale;
}

export function TextFloatingBar({ overlay, onUpdate, onApply, locale }: TextFloatingBarProps) {
  const pt = useMemo(() => Math.min(72, Math.max(8, PROP_TO_PT(overlay.fontSize))), [overlay.fontSize]);

  return (
    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 px-4 py-2 rounded-xl border border-theme-border bg-theme-bg shadow-lg">
      <div className="flex items-center gap-2">
        <label className="text-xs text-theme-fg-muted whitespace-nowrap">{t(locale, 'studio.fontSize')}</label>
        <div className="flex items-center gap-1">
          {SIZE_PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onUpdate({ fontSize: PT_TO_PROP(n) })}
              className={`w-8 h-8 rounded-lg border text-xs font-medium ${pt === n ? 'border-theme-accent bg-theme-accent/15 text-theme-accent' : 'border-theme-border bg-theme-bg-hover text-theme-fg hover:border-theme-border-hover'}`}
            >
              {n}
            </button>
          ))}
        </div>
        <input
          type="number"
          min={8}
          max={72}
          value={pt}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isNaN(v)) onUpdate({ fontSize: PT_TO_PROP(Math.min(72, Math.max(8, v))) });
          }}
          className="w-12 px-2 py-1.5 rounded-lg border border-theme-border bg-theme-bg-hover text-theme-fg text-xs text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>
      <div className="w-px h-6 bg-theme-border" />
      <div className="flex items-center gap-2">
        <label className="text-xs text-theme-fg-muted whitespace-nowrap">{t(locale, 'studio.fontStyle')}</label>
        <select
          value={overlay.fontFamily}
          onChange={(e) => onUpdate({ fontFamily: e.target.value })}
          className="px-3 py-1.5 rounded-lg border border-theme-border bg-theme-bg-hover text-theme-fg text-sm min-w-[140px] focus:border-theme-accent focus:ring-1 focus:ring-theme-accent/30 outline-none appearance-none cursor-pointer"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23999'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 0.4rem center',
            backgroundSize: '1rem',
            paddingRight: '1.75rem',
          }}
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f.family} value={f.family} className="bg-theme-bg text-theme-fg">
              {f.label}
            </option>
          ))}
        </select>
      </div>
      <div className="w-px h-6 bg-theme-border" />
      <ThemeColorPicker value={overlay.color} onChange={(c) => onUpdate({ color: c })} label={t(locale, 'studio.textColor')} />
      <button
        type="button"
        onClick={onApply}
        className="px-4 py-2 rounded-lg bg-theme-accent text-theme-fg-on-accent text-sm font-medium hover:opacity-90"
      >
        Apply
      </button>
    </div>
  );
}
