'use client';

import { useState } from 'react';
import { t } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';

interface PromptBuilderDialogProps {
  open: boolean;
  onClose: () => void;
  onPick: (prompt: string) => void;
  locale: Locale;
  isVideo: boolean;
}

const ANGLE_OPTIONS = [
  { value: '', labelKey: 'promptBuilder.angleNone' },
  { value: 'front view', labelKey: 'promptBuilder.angleFront' },
  { value: 'side view', labelKey: 'promptBuilder.angleSide' },
  { value: 'bird\'s eye view', labelKey: 'promptBuilder.angleBird' },
  { value: 'close-up', labelKey: 'promptBuilder.angleCloseup' },
  { value: 'wide shot', labelKey: 'promptBuilder.angleWide' },
  { value: 'over the shoulder', labelKey: 'promptBuilder.angleOverShoulder' },
];

const MOVEMENT_OPTIONS = [
  { value: '', labelKey: 'promptBuilder.movementNone' },
  { value: 'static camera', labelKey: 'promptBuilder.movementStatic' },
  { value: 'slow zoom in', labelKey: 'promptBuilder.movementZoomIn' },
  { value: 'pan left to right', labelKey: 'promptBuilder.movementPan' },
  { value: 'tracking shot', labelKey: 'promptBuilder.movementTracking' },
  { value: 'handheld', labelKey: 'promptBuilder.movementHandheld' },
];

function buildVariants(description: string, angle: string, movement: string): string[] {
  const d = description.trim();
  const a = angle.trim();
  const m = movement.trim();
  if (!d) return [];
  const variants = [
    [d, a, m].filter(Boolean).join('. '),
    a ? `${a} shot of ${d}${m ? `. ${m}.` : '.'}` : d + (m ? `. ${m}.` : ''),
    d + (a ? `, ${a} framing` : '') + (m ? `, ${m}.` : '.'),
    m ? `${m}. ${d}${a ? `, ${a}.` : '.'}` : d + (a ? `. ${a}.` : ''),
    d + (a || m ? `. ${a ? `Angle: ${a}. ` : ''}${m ? `Movement: ${m}.` : ''}` : ''),
  ];
  const unique = [...new Set(variants)];
  while (unique.length < 5) unique.push(unique[0] || d);
  return unique.slice(0, 5);
}

export function PromptBuilderDialog({ open, onClose, onPick, locale, isVideo }: PromptBuilderDialogProps) {
  const [step, setStep] = useState(1);
  const [description, setDescription] = useState('');
  const [angle, setAngle] = useState('');
  const [angleCustom, setAngleCustom] = useState('');
  const [movement, setMovement] = useState('');
  const [movementCustom, setMovementCustom] = useState('');
  const [variants, setVariants] = useState<string[]>([]);

  const angleVal = angle === '_custom' ? angleCustom.trim() : angle;
  const movementVal = movement === '_custom' ? movementCustom.trim() : movement;

  const handleGenerate = () => {
    const list = buildVariants(description, angleVal, movementVal);
    setVariants(list.length >= 5 ? list.slice(0, 5) : [...list, ...Array(5 - list.length).fill(description || '')]);
    setStep(5);
  };

  const handlePick = (prompt: string) => {
    onPick(prompt.trim());
    onClose();
    setStep(1);
    setDescription('');
    setAngle('');
    setAngleCustom('');
    setMovement('');
    setMovementCustom('');
    setVariants([]);
  };

  const handleClose = () => {
    onClose();
    setStep(1);
    setDescription('');
    setAngle('');
    setAngleCustom('');
    setMovement('');
    setMovementCustom('');
    setVariants([]);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-theme-bg-overlay" role="dialog" aria-modal="true">
      <div className="absolute inset-0" onClick={handleClose} aria-hidden />
      <div className="relative z-10 bg-theme-bg rounded-2xl border border-theme-border shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-theme-border">
          <h3 className="font-semibold text-theme-fg">{t(locale, 'promptBuilder.title')}</h3>
          <button type="button" onClick={handleClose} className="p-2 rounded-lg text-theme-fg-subtle hover:text-theme-fg hover:bg-theme-bg-hover" aria-label="Close">×</button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-theme-fg-muted">{t(locale, 'promptBuilder.step1Question')}</p>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t(locale, 'image.placeholder')}
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-theme-border bg-theme-bg-subtle text-theme-fg placeholder:text-theme-fg-subtle text-sm focus:outline-none focus:ring-1 focus:ring-theme-border-strong resize-none"
                autoFocus
              />
              <div className="flex justify-end">
                <button type="button" onClick={() => setStep(2)} disabled={!description.trim()} className="px-4 py-2 rounded-lg bg-theme-accent text-theme-fg-inverse hover:opacity-90 disabled:opacity-50 text-sm font-medium">
                  {t(locale, 'promptBuilder.next')}
                </button>
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-theme-fg-muted">{t(locale, 'promptBuilder.step2Question')}</p>
              <p className="text-xs text-theme-fg-subtle">{t(locale, 'promptBuilder.step2Examples')}</p>
              <div className="flex flex-wrap gap-2">
                {ANGLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value || 'none'}
                    type="button"
                    onClick={() => setAngle(opt.value)}
                    className={`px-3 py-1.5 rounded-lg border text-sm ${angle === opt.value ? 'border-theme-accent bg-theme-accent/10 text-theme-accent' : 'border-theme-border bg-theme-bg-hover text-theme-fg hover:bg-theme-bg-hover-strong'}`}
                  >
                    {t(locale, opt.labelKey)}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setAngle('_custom')}
                  className={`px-3 py-1.5 rounded-lg border text-sm ${angle === '_custom' ? 'border-theme-accent bg-theme-accent/10 text-theme-accent' : 'border-theme-border bg-theme-bg-hover text-theme-fg hover:bg-theme-bg-hover-strong'}`}
                >
                  Custom
                </button>
              </div>
              {angle === '_custom' && (
                <input
                  type="text"
                  value={angleCustom}
                  onChange={(e) => setAngleCustom(e.target.value)}
                  placeholder="e.g. low angle"
                  className="w-full px-3 py-2 rounded-lg border border-theme-border bg-theme-bg-subtle text-theme-fg text-sm focus:outline-none focus:ring-1 focus:ring-theme-border-strong"
                />
              )}
              <div className="flex justify-between">
                <button type="button" onClick={() => setStep(1)} className="px-4 py-2 rounded-lg border border-theme-border text-theme-fg hover:bg-theme-bg-hover text-sm">
                  {t(locale, 'promptBuilder.back')}
                </button>
                <button type="button" onClick={() => setStep(3)} className="px-4 py-2 rounded-lg bg-theme-accent text-theme-fg-inverse hover:opacity-90 text-sm font-medium">
                  {t(locale, 'promptBuilder.next')}
                </button>
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-theme-fg-muted">{t(locale, 'promptBuilder.step3Question')}</p>
              <p className="text-xs text-theme-fg-subtle">{t(locale, 'promptBuilder.step3Examples')}</p>
              <div className="flex flex-wrap gap-2">
                {MOVEMENT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value || 'none'}
                    type="button"
                    onClick={() => setMovement(opt.value)}
                    className={`px-3 py-1.5 rounded-lg border text-sm ${movement === opt.value ? 'border-theme-accent bg-theme-accent/10 text-theme-accent' : 'border-theme-border bg-theme-bg-hover text-theme-fg hover:bg-theme-bg-hover-strong'}`}
                  >
                    {t(locale, opt.labelKey)}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setMovement('_custom')}
                  className={`px-3 py-1.5 rounded-lg border text-sm ${movement === '_custom' ? 'border-theme-accent bg-theme-accent/10 text-theme-accent' : 'border-theme-border bg-theme-bg-hover text-theme-fg hover:bg-theme-bg-hover-strong'}`}
                >
                  Custom
                </button>
              </div>
              {movement === '_custom' && (
                <input
                  type="text"
                  value={movementCustom}
                  onChange={(e) => setMovementCustom(e.target.value)}
                  placeholder="e.g. dolly forward"
                  className="w-full px-3 py-2 rounded-lg border border-theme-border bg-theme-bg-subtle text-theme-fg text-sm focus:outline-none focus:ring-1 focus:ring-theme-border-strong"
                />
              )}
              <div className="flex justify-between">
                <button type="button" onClick={() => setStep(2)} className="px-4 py-2 rounded-lg border border-theme-border text-theme-fg hover:bg-theme-bg-hover text-sm">
                  {t(locale, 'promptBuilder.back')}
                </button>
                <button type="button" onClick={handleGenerate} className="px-4 py-2 rounded-lg bg-theme-accent text-theme-fg-inverse hover:opacity-90 text-sm font-medium">
                  {t(locale, 'promptBuilder.generate')}
                </button>
              </div>
            </div>
          )}
          {step === 5 && (
            <div className="space-y-4">
              <p className="text-sm text-theme-fg-muted">{t(locale, 'promptBuilder.chooseOne')}</p>
              <ul className="space-y-2">
                {variants.map((v, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="flex-1 px-3 py-2 rounded-lg border border-theme-border bg-theme-bg-subtle text-theme-fg text-sm">{v}</span>
                    <button type="button" onClick={() => handlePick(v)} className="shrink-0 px-3 py-2 rounded-lg bg-theme-accent text-theme-fg-inverse hover:opacity-90 text-sm font-medium">
                      {t(locale, 'promptBuilder.useThis')}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
