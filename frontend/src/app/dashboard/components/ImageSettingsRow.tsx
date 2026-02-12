'use client';

import { t } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { Select } from '@/components/Select';

export interface ImageSettings {
  size: '2K' | '4K' | 'HD';
  aspectRatio: string;
}

interface ImageSettingsRowProps {
  locale: Locale;
  settings: ImageSettings;
  onChange: (s: ImageSettings) => void;
}

export function ImageSettingsRow({ locale, settings, onChange }: ImageSettingsRowProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-theme-fg-muted">{t(locale, 'image.resolution')}</span>
        <div className="flex rounded-lg border border-theme-border overflow-hidden">
          {(['2K', '4K', 'HD'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange({ ...settings, size: s })}
              className={`px-3 py-1.5 text-sm transition-colors ${
                settings.size === s
                  ? 'bg-theme-bg-hover-strong text-theme-fg'
                  : 'bg-theme-bg-subtle text-theme-fg-muted hover:bg-theme-bg-hover hover:text-theme-fg'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-theme-fg-muted">{t(locale, 'image.aspectRatio')}</span>
        <Select
          value={settings.aspectRatio}
          options={[
            { value: '1:1', label: t(locale, 'image.aspect1:1') },
            { value: '16:9', label: t(locale, 'image.aspect16:9') },
            { value: '9:16', label: t(locale, 'image.aspect9:16') },
            { value: '4:3', label: t(locale, 'image.aspect4:3') },
            { value: '3:4', label: t(locale, 'image.aspect3:4') },
            { value: 'match_input_image', label: t(locale, 'image.aspectMatch') },
          ]}
          onChange={(v) => onChange({ ...settings, aspectRatio: v })}
          size="sm"
          className="min-w-[120px]"
        />
      </div>
    </div>
  );
}
