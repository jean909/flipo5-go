'use client';

import { t } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { Select } from '@/components/Select';

export interface VideoSettings {
  duration: number;
  aspectRatio: string;
  resolution: '720p' | '480p';
}

const DURATIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;
const DURATIONS_KLING = [5, 10] as const; // Kling only supports 5s or 10s
const ASPECT_RATIOS = ['16:9', '4:3', '1:1', '9:16', '3:4', '3:2', '2:3'] as const;

interface VideoSettingsRowProps {
  locale: Locale;
  settings: VideoSettings;
  onChange: (s: VideoSettings) => void;
  hasImage?: boolean;
  hasVideo?: boolean;
  videoModel?: '1' | '2';
  onVideoModelChange?: (m: '1' | '2') => void;
}

export function VideoSettingsRow({ locale, settings, onChange, hasImage, hasVideo, videoModel = '1', onVideoModelChange }: VideoSettingsRowProps) {
  const durationDisabled = !!hasVideo && videoModel === '1';
  const aspectDisabled = (!!hasVideo || !!hasImage) && videoModel === '1';
  const resolutionDisabled = !!hasVideo;
  const disabledCls = 'opacity-60 pointer-events-none';
  const durationOptions = videoModel === '2' ? DURATIONS_KLING : DURATIONS;
  const durationValue = videoModel === '2' && !DURATIONS_KLING.includes(settings.duration as 5 | 10) ? 5 : settings.duration;

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {onVideoModelChange && (
        <div className="flex items-center gap-2">
          {(['1', '2'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onVideoModelChange(m)}
              className={videoModel === m ? 'px-3 py-1.5 rounded-lg border bg-theme-bg-hover-strong border-theme-border-hover text-theme-fg font-medium' : 'px-3 py-1.5 rounded-lg border border-theme-border bg-theme-bg-subtle text-theme-fg-muted hover:bg-theme-bg-hover'}
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
          value={settings.aspectRatio}
          options={ASPECT_RATIOS.map((r) => ({ value: r, label: r }))}
          onChange={(v) => onChange({ ...settings, aspectRatio: v })}
          size="sm"
          className="min-w-[80px]"
        />
      </div>
      {videoModel === '1' && (
        <div className={`flex items-center gap-2 ${resolutionDisabled ? disabledCls : ''}`}>
          <span className="text-theme-fg-muted">{t(locale, 'video.resolution')}</span>
          <Select
            value={settings.resolution}
            options={[
              { value: '720p', label: '720p' },
              { value: '480p', label: '480p' },
            ]}
            onChange={(v) => onChange({ ...settings, resolution: v as '720p' | '480p' })}
            size="sm"
            className="min-w-[70px]"
          />
        </div>
      )}
    </div>
  );
}
