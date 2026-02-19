'use client';

import { useState } from 'react';
import { t } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import type { LogoOverlayItem } from './MultiLogoPlacer';
import { ThemeColorPicker } from './ThemeColorPicker';

// Font size in pt (Word/Excel style). Stored as proportion of image height: pt/400.
const FONT_PT_OPTIONS = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48];
const PT_TO_PROPORTION = (pt: number) => pt / 400;

const FONT_OPTIONS: { id: string; label: string; family: string }[] = [
  { id: 'arial', label: 'Arial', family: 'Arial' },
  { id: 'helvetica', label: 'Helvetica', family: 'Helvetica' },
  { id: 'verdana', label: 'Verdana', family: 'Verdana' },
  { id: 'tahoma', label: 'Tahoma', family: 'Tahoma' },
  { id: 'trebuchet', label: 'Trebuchet MS', family: 'Trebuchet MS' },
  { id: 'georgia', label: 'Georgia', family: 'Georgia' },
  { id: 'times', label: 'Times New Roman', family: 'Times New Roman' },
  { id: 'impact', label: 'Impact', family: 'Impact' },
  { id: 'comic', label: 'Comic Sans MS', family: 'Comic Sans MS' },
  { id: 'courier', label: 'Courier New', family: 'Courier New' },
  { id: 'palatino', label: 'Palatino Linotype', family: 'Palatino Linotype' },
  { id: 'garamond', label: 'Garamond', family: 'Garamond' },
  { id: 'lucida', label: 'Lucida Sans', family: 'Lucida Sans Unicode' },
  { id: 'franklin', label: 'Franklin Gothic', family: 'Franklin Gothic Medium' },
];

interface TextDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (overlay: Extract<LogoOverlayItem, { type: 'text' }>) => void;
  locale: Locale;
}

export function TextDialog({ open, onClose, onAdd, locale }: TextDialogProps) {
  const [text, setText] = useState('');
  const [fontSizePt, setFontSizePt] = useState(16);
  const [fontFamily, setFontFamily] = useState('Arial');
  const [color, setColor] = useState('#ffffff');

  if (!open) return null;

  const handleAdd = () => {
    const trimmed = text.trim() || 'Text';
    onAdd({
      id: crypto.randomUUID(),
      type: 'text',
      text: trimmed,
      fontSize: PT_TO_PROPORTION(fontSizePt),
      fontFamily,
      color,
      pos: { x: 0.5, y: 0.5 },
      size: { w: 0.4, h: 0.12 },
      rotation: 0,
    });
    setText('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div
        className="bg-theme-bg border border-theme-border rounded-xl shadow-xl max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-theme-border">
          <h2 className="text-lg font-semibold text-theme-fg">{t(locale, 'studio.textDialogTitle')}</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-theme-bg-hover text-theme-fg" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-theme-fg-muted mb-1">{t(locale, 'studio.textPlaceholder')}</label>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t(locale, 'studio.textPlaceholder')}
              className="w-full px-3 py-2 rounded-lg border border-theme-border bg-theme-bg-hover text-theme-fg text-sm focus:border-theme-accent focus:ring-1 focus:ring-theme-accent/30 outline-none"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-theme-fg-muted mb-1">{t(locale, 'studio.fontSize')}</label>
            <select
              value={fontSizePt}
              onChange={(e) => setFontSizePt(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-theme-border bg-theme-bg-hover text-theme-fg text-sm focus:border-theme-accent focus:ring-1 focus:ring-theme-accent/30 outline-none appearance-none cursor-pointer"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23888'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.5rem center', backgroundSize: '1.25rem', paddingRight: '2rem' }}
            >
              {FONT_PT_OPTIONS.map((pt) => (
                <option key={pt} value={pt}>{pt} pt</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-theme-fg-muted mb-1">{t(locale, 'studio.fontStyle')}</label>
            <select
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-theme-border bg-theme-bg-hover text-theme-fg text-sm focus:border-theme-accent focus:ring-1 focus:ring-theme-accent/30 outline-none appearance-none cursor-pointer"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23888'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.5rem center', backgroundSize: '1.25rem', paddingRight: '2rem' }}
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.id} value={f.family}>{f.label}</option>
              ))}
            </select>
          </div>
          <div>
            <ThemeColorPicker
              label={t(locale, 'studio.textColor')}
              value={color}
              onChange={setColor}
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-3 py-2 rounded-lg border border-theme-border bg-theme-bg-hover text-theme-fg text-sm font-medium hover:bg-theme-bg-hover-strong">
              {t(locale, 'dialog.cancel')}
            </button>
            <button type="button" onClick={handleAdd} className="flex-1 px-3 py-2 rounded-lg bg-theme-accent text-theme-fg-on-accent text-sm font-medium hover:opacity-90">
              {t(locale, 'studio.addText')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
