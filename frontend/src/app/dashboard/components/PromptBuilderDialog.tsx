'use client';

import { useState } from 'react';
import { t } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { generatePromptVariants } from '@/lib/api';

export type PromptBuilderMode = 'image' | 'video';

interface PromptBuilderDialogProps {
  open: boolean;
  onClose: () => void;
  onPick: (prompt: string) => void;
  locale: Locale;
  mode: PromptBuilderMode;
}

const ANGLE_OPTIONS = [
  { value: '', labelKey: 'promptBuilder.angleNone' },
  { value: 'front view', labelKey: 'promptBuilder.angleFront' },
  { value: 'side view', labelKey: 'promptBuilder.angleSide' },
  { value: "bird's eye view", labelKey: 'promptBuilder.angleBird' },
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

export function PromptBuilderDialog({ open, onClose, onPick, locale, mode }: PromptBuilderDialogProps) {
  const [step, setStep] = useState(1);
  const [description, setDescription] = useState('');
  const [angle, setAngle] = useState('');
  const [angleCustom, setAngleCustom] = useState('');
  const [movement, setMovement] = useState('');
  const [movementCustom, setMovementCustom] = useState('');
  const [variants, setVariants] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const angleVal = angle === '_custom' ? angleCustom.trim() : angle;
  const movementVal = movement === '_custom' ? movementCustom.trim() : movement;
  const isVideo = mode === 'video';
  const maxStep = isVideo ? 3 : 2;

  const handleGenerate = async () => {
    setError(null);
    setGenerating(true);
    setStep(maxStep + 1); // loading step
    try {
      const { prompts } = await generatePromptVariants({
        type: mode,
        description: description.trim(),
        angle: angleVal || undefined,
        movement: isVideo ? (movementVal || undefined) : undefined,
      });
      setVariants(prompts && prompts.length > 0 ? prompts : [description.trim()]);
      setStep(maxStep + 2); // results step
    } catch (e) {
      setError((e as Error)?.message ?? t(locale, 'promptBuilder.error'));
      setStep(isVideo ? 3 : 2);
    } finally {
      setGenerating(false);
    }
  };

  const handlePick = (prompt: string) => {
    onPick(prompt.trim());
    reset();
    onClose();
  };

  const reset = () => {
    setStep(1);
    setDescription('');
    setAngle('');
    setAngleCustom('');
    setMovement('');
    setMovementCustom('');
    setVariants([]);
    setError(null);
  };

  const handleClose = () => {
    onClose();
    reset();
  };

  if (!open) return null;

  const title = mode === 'video' ? t(locale, 'promptBuilder.titleVideo') : t(locale, 'promptBuilder.titleImage');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-theme-bg-overlay" role="dialog" aria-modal="true">
      <div className="absolute inset-0" onClick={handleClose} aria-hidden />
      <div className="relative z-10 bg-theme-bg rounded-2xl border border-theme-border shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-theme-border shrink-0">
          <div>
            <h3 className="font-semibold text-theme-fg">{title}</h3>
            <p className="text-xs text-theme-fg-subtle mt-0.5">
              {step <= maxStep && `Step ${step} of ${maxStep}`}
            </p>
          </div>
          <button type="button" onClick={handleClose} className="p-2 rounded-lg text-theme-fg-subtle hover:text-theme-fg hover:bg-theme-bg-hover" aria-label="Close">×</button>
        </div>
        <div className="p-4 overflow-y-auto flex-1 min-h-0">
          {error && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-theme-danger-muted text-theme-danger text-sm">
              {error}
            </div>
          )}

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
              <div className="flex justify-between pt-2">
                <button type="button" onClick={() => setStep(1)} className="px-4 py-2 rounded-lg border border-theme-border text-theme-fg hover:bg-theme-bg-hover text-sm">
                  {t(locale, 'promptBuilder.back')}
                </button>
                {isVideo ? (
                  <button type="button" onClick={() => setStep(3)} className="px-4 py-2 rounded-lg bg-theme-accent text-theme-fg-inverse hover:opacity-90 text-sm font-medium">
                    {t(locale, 'promptBuilder.next')}
                  </button>
                ) : (
                  <button type="button" onClick={handleGenerate} disabled={generating} className="px-4 py-2 rounded-lg bg-theme-accent text-theme-fg-inverse hover:opacity-90 disabled:opacity-50 text-sm font-medium">
                    {t(locale, 'promptBuilder.generate')}
                  </button>
                )}
              </div>
            </div>
          )}

          {step === 3 && isVideo && (
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
              <div className="flex justify-between pt-2">
                <button type="button" onClick={() => setStep(2)} className="px-4 py-2 rounded-lg border border-theme-border text-theme-fg hover:bg-theme-bg-hover text-sm">
                  {t(locale, 'promptBuilder.back')}
                </button>
                <button type="button" onClick={handleGenerate} disabled={generating} className="px-4 py-2 rounded-lg bg-theme-accent text-theme-fg-inverse hover:opacity-90 disabled:opacity-50 text-sm font-medium">
                  {t(locale, 'promptBuilder.generate')}
                </button>
              </div>
            </div>
          )}

          {step === maxStep + 1 && generating && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-10 h-10 border-2 border-theme-accent border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-sm text-theme-fg-muted">{t(locale, 'promptBuilder.generating')}</p>
            </div>
          )}

          {step === maxStep + 2 && !generating && (
            <div className="space-y-4">
              <p className="text-sm text-theme-fg-muted">{t(locale, 'promptBuilder.chooseOne')}</p>
              <ul className="space-y-3">
                {variants.map((v, i) => (
                  <li key={i} className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <span className="flex-1 px-3 py-2.5 rounded-lg border border-theme-border bg-theme-bg-subtle text-theme-fg text-sm leading-relaxed">{v}</span>
                    <button type="button" onClick={() => handlePick(v)} className="shrink-0 px-3 py-2 rounded-lg bg-theme-accent text-theme-fg-inverse hover:opacity-90 text-sm font-medium whitespace-nowrap">
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
