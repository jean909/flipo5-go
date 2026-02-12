'use client';

import { useState, useEffect } from 'react';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';
import { getMe, updateSettings, type User, type AIConfiguration } from '@/lib/api';
import { Select } from '@/components/Select';

const AI_STYLES = [
  { value: 'friendly', labelKey: 'settings.aiStyleFriendly' },
  { value: 'direct', labelKey: 'settings.aiStyleDirect' },
  { value: 'logical', labelKey: 'settings.aiStyleLogical' },
  { value: 'brief', labelKey: 'settings.aiStyleBrief' },
  { value: 'detailed', labelKey: 'settings.aiStyleDetailed' },
] as const;

const AI_LANG_VALUES = ['browser', 'en', 'de', 'ro', 'fr', 'es', 'it'] as const;
const AI_LANG_LABELS: Record<string, string> = {
  browser: '', // use i18n
  en: 'English',
  de: 'Deutsch',
  ro: 'Română',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
};

const MAX_USER_DETAILS_CHARS = 80;

export default function SettingsPage() {
  const { locale, setLocale } = useLocale();
  const [user, setUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dataRetention, setDataRetention] = useState<boolean | null>(null);
  const [aiStyle, setAiStyle] = useState<string>('');
  const [aiLang, setAiLang] = useState<string>('browser');
  const [userDetails, setUserDetails] = useState('');

  useEffect(() => {
    getMe().then((u) => {
      if (!u) return;
      setUser(u);
      setDataRetention(u.data_retention_accepted ?? null);
      const cfg = u.ai_configuration;
      if (cfg) {
        setAiStyle(cfg.style || '');
        setAiLang(cfg.primary_language || 'browser');
        setUserDetails(cfg.user_details || '');
      }
    });
  }, []);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const aiConfig: Partial<AIConfiguration> = {};
      if (aiStyle) aiConfig.style = aiStyle;
      if (aiLang) aiConfig.primary_language = aiLang;
      if (userDetails.trim()) aiConfig.user_details = userDetails.trim();
      const updated = await updateSettings({
        data_retention_accepted: dataRetention ?? undefined,
        ai_configuration: Object.keys(aiConfig).length ? aiConfig : undefined,
      });
      setUser(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t(locale, 'common.failed');
      setError(msg === 'ai_config_cooldown' ? t(locale, 'settings.cooldown') : msg);
    } finally {
      setSaving(false);
    }
  }

  if (!user) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="text-theme-fg-subtle">{t(locale, 'common.loading')}</p>
      </div>
    );
  }

  const detailsChars = userDetails.length;
  const detailsOverLimit = detailsChars > MAX_USER_DETAILS_CHARS;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-6 scrollbar-subtle">
      <div className="max-w-xl mx-auto">
      <h1 className="font-display text-2xl font-bold text-theme-fg mb-8">{t(locale, 'settings.title')}</h1>

      <section className="rounded-2xl border border-theme-border bg-theme-bg-subtle p-6 mb-6">
        <h2 className="text-sm font-medium text-theme-fg-muted uppercase tracking-wider mb-2">{t(locale, 'settings.dataRetention')}</h2>
        <p className="text-sm text-theme-fg-subtle mb-4">{t(locale, 'settings.dataRetentionDesc')}</p>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="retention"
              checked={dataRetention === true}
              onChange={() => setDataRetention(true)}
              className="w-4 h-4 accent-white"
            />
            <span className="text-theme-fg-muted">{t(locale, 'settings.dataRetentionAccept')}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="retention"
              checked={dataRetention === false}
              onChange={() => setDataRetention(false)}
              className="w-4 h-4 accent-white"
            />
            <span className="text-theme-fg-muted">{t(locale, 'settings.dataRetentionDecline')}</span>
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-theme-border bg-theme-bg-subtle p-6 mb-6">
        <h2 className="text-sm font-medium text-theme-fg-muted uppercase tracking-wider mb-2">{t(locale, 'settings.aiConfig')}</h2>
        <p className="text-sm text-theme-fg-subtle mb-4">{t(locale, 'settings.aiConfigDesc')}</p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-theme-fg-muted mb-2">{t(locale, 'settings.aiStyle')}</label>
            <Select
              value={aiStyle}
              options={[
                { value: '', label: t(locale, 'common.none') },
                ...AI_STYLES.map((s) => ({ value: s.value, label: t(locale, s.labelKey) })),
              ]}
              onChange={setAiStyle}
            />
          </div>

          <div>
            <label className="block text-sm text-theme-fg-muted mb-2">{t(locale, 'settings.aiPrimaryLang')}</label>
            <Select
              value={aiLang}
              options={AI_LANG_VALUES.map((v) => ({
                value: v,
                label: v === 'browser' ? t(locale, 'settings.aiPrimaryLangBrowser') : AI_LANG_LABELS[v],
              }))}
              onChange={setAiLang}
            />
          </div>

          <div>
            <label className="block text-sm text-theme-fg-muted mb-2">{t(locale, 'settings.userDetails')}</label>
            <p className="text-xs text-theme-fg-subtle mb-1">{t(locale, 'settings.userDetailsDesc')}</p>
            <textarea
              value={userDetails}
              onChange={(e) => setUserDetails(e.target.value.slice(0, MAX_USER_DETAILS_CHARS))}
              placeholder={t(locale, 'settings.userDetailsPlaceholder')}
              rows={3}
              className={`w-full px-4 py-2.5 rounded-xl bg-theme-bg-elevated border text-theme-fg text-sm focus:outline-none focus:ring-1 resize-none ${
                detailsOverLimit ? 'border-theme-danger/50' : 'border-theme-border focus:ring-theme-border-strong'
              }`}
            />
            <p className={`text-xs mt-1 ${detailsOverLimit ? 'text-theme-danger' : 'text-theme-fg-subtle'}`}>
              {detailsChars} / {MAX_USER_DETAILS_CHARS} {t(locale, 'common.chars')}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-theme-border bg-theme-bg-subtle p-6 mb-6">
        <h2 className="text-sm font-medium text-theme-fg-muted uppercase tracking-wider mb-2">{t(locale, 'settings.uiLanguage')}</h2>
        <Select
          value={locale}
          options={[
            { value: 'en', label: t(locale, 'settings.langEn') },
            { value: 'de', label: t(locale, 'settings.langDe') },
          ]}
          onChange={(v) => setLocale(v as 'en' | 'de')}
          className="max-w-xs"
        />
      </section>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving || detailsOverLimit}
        className="px-6 py-3 rounded-xl text-sm font-medium bg-theme-bg-hover text-theme-fg hover:bg-theme-bg-hover-strong disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {saving ? t(locale, 'common.saving') : saved ? t(locale, 'settings.saved') : t(locale, 'settings.save')}
      </button>
      </div>
    </div>
  );
}
