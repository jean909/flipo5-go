'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale } from './LocaleContext';
import { t } from '@/lib/i18n';
import {
  readConsentDecision,
  persistConsentDecision,
  setConsentDefaultDenied,
  updateConsent,
  type ConsentDecision,
} from '@/lib/consent';

export function CookieConsentBanner() {
  const { locale } = useLocale();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setConsentDefaultDenied();
    const saved = readConsentDecision();
    if (saved) {
      updateConsent(saved);
      setVisible(false);
      return;
    }
    setVisible(true);
  }, []);

  const applyDecision = (decision: ConsentDecision) => {
    persistConsentDecision(decision);
    updateConsent(decision);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 inset-x-4 z-[80] md:inset-x-auto md:right-4 md:max-w-md rounded-2xl border border-theme-border bg-theme-bg-elevated shadow-2xl p-4">
      <h3 className="text-sm font-semibold text-theme-fg">{t(locale, 'cookie.title')}</h3>
      <p className="mt-1.5 text-xs text-theme-fg-muted">{t(locale, 'cookie.description')}</p>
      <p className="mt-1 text-[11px] text-theme-fg-subtle">
        <Link href="/cookie-policy" className="underline hover:text-theme-fg">
          {t(locale, 'cookie.learnMore')}
        </Link>
      </p>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => applyDecision('denied')}
          className="btn-tap px-3 py-2 rounded-xl text-xs font-medium border border-theme-border text-theme-fg-muted hover:text-theme-fg hover:border-theme-border-hover hover:bg-theme-bg-hover"
        >
          {t(locale, 'cookie.reject')}
        </button>
        <button
          type="button"
          onClick={() => applyDecision('granted')}
          className="btn-tap px-3 py-2 rounded-xl text-xs font-medium border border-theme-border-hover bg-theme-accent-muted text-theme-accent hover:bg-theme-accent-hover"
        >
          {t(locale, 'cookie.accept')}
        </button>
      </div>
    </div>
  );
}
