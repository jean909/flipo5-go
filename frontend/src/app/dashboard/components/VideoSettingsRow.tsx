'use client';

import { t } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { Select } from '@/components/Select';

export interface VideoSettings {
  duration: number;
  aspectRatio: string;
  resolution: '720p' | '1080p';
}

/** Veo 3.1 allowed durations */
const DURATIONS_VEO = [4, 6, 8] as const;
const DURATIONS_KLING = [5, 10] as const;
const ASPECT_VEO = ['16:9', '9:16'] as const;
const ASPECT_KLING = ['16:9', '4:3', '1:1', '9:16', '3:4', '3:2', '2:3'] as const;

interface VideoSettingsRowProps {
  locale: Locale;
  settings: VideoSettings;
  onChange: (s: VideoSettings) => void;
  hasImage?: boolean;
  /** 2+ reference images → Veo R2V (forces 16:9 + 8s) */
  referenceCount?: number;
  hasVideo?: boolean;
  videoModel?: '1' | '2';
  onVideoModelChange?: (m: '1' | '2') => void;
}

export function VideoSettingsRow({
  locale,
  settings,
  onChange,
  hasImage,
  referenceCount = 0,
  hasVideo,
  videoModel = '1',
  onVideoModelChange,
}: VideoSettingsRowProps) {
  const isVeo = videoModel === '1';
  const r2vLocked = isVeo && referenceCount >= 2;
  const durationDisabled = (!!hasVideo && isVeo) || r2vLocked;
  const aspectDisabled = ((!!hasVideo || !!hasImage) && isVeo) || r2vLocked;
  const resolutionDisabled = !!hasVideo;
  const disabledCls = 'opacity-60 pointer-events-none';
  const durationOptions = isVeo ? DURATIONS_VEO : DURATIONS_KLING;
  const aspectOptions = isVeo ? ASPECT_VEO : ASPECT_KLING;

  let durationValue = settings.duration;
  if (isVeo) {
    if (r2vLocked) durationValue = 8;
    else if (!(DURATIONS_VEO as readonly number[]).includes(settings.duration)) durationValue = 8;
  } else if (!(DURATIONS_KLING as readonly number[]).includes(settings.duration as 5 | 10)) {
    durationValue = 5;
  }

  let aspectValue = settings.aspectRatio;
  if (isVeo) {
    if (r2vLocked) aspectValue = '16:9';
    else if (aspectValue !== '16:9' && aspectValue !== '9:16') aspectValue = '16:9';
  }

  const resolutionValue =
    isVeo && settings.resolution !== '720p' && settings.resolution !== '1080p' ? '1080p' : settings.resolution;

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {onVideoModelChange && (
        <div className="flex items-center gap-2">
          {(['1', '2'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onVideoModelChange(m)}
              className={`px-3 py-1.5 rounded-lg border transition-colors duration-150 ${videoModel === m ? 'bg-theme-bg-hover-strong border-theme-border-hover text-theme-fg font-medium' : 'border-theme-border bg-theme-bg-subtle text-theme-fg-muted hover:bg-theme-bg-hover'}`}
            >
              {t(locale, m === '1' ? 'video.model1' : 'video.model2')}
            </button>
          ))}
        </div>
      )}
      <div className={`flex items-center gap-2 ${durationDisabled ? disabledCls : ''}`}>
        <span className="text-theme-fg-muted">{t(locale, 'video.duration')}</span>
        <Select
          value={String(durationValue)}
          options={durationOptions.map((d) => ({ value: String(d), label: `${d}s` }))}
          onChange={(v) => onChange({ ...settings, duration: Number(v) })}
          size="sm"
          className="min-w-[70px]"
        />
      </div>
      <div className={`flex items-center gap-2 ${aspectDisabled ? disabledCls : ''}`}>
        <span className="text-theme-fg-muted">{t(locale, 'video.aspectRatio')}</span>
        <Select
          value={aspectValue}
          options={aspectOptions.map((r) => ({ value: r, label: r }))}
          onChange={(v) => onChange({ ...settings, aspectRatio: v })}
          size="sm"
          className="min-w-[80px]"
        />
      </div>
      {isVeo && (
        <div className={`flex items-center gap-2 ${resolutionDisabled ? disabledCls : ''}`}>
          <span className="text-theme-fg-muted">{t(locale, 'video.resolution')}</span>
          <Select
            value={resolutionValue}
            options={[
              { value: '1080p', label: '1080p' },
              { value: '720p', label: '720p' },
            ]}
            onChange={(v) => onChange({ ...settings, resolution: v as '720p' | '1080p' })}
            size="sm"
            className="min-w-[70px]"
          />
        </div>
      )}
    </div>
  );
}
