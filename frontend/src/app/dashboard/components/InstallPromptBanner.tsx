'use client';

import { useState, useEffect } from 'react';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';

const STORAGE_KEY = 'flipo5-pwa-dismissed';

export function InstallPromptBanner() {
  const { locale } = useLocale();
  const [visible, setVisible] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<{ prompt: () => Promise<void> } | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    const ua = navigator.userAgent;
    const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const ios = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
    setIsMobile(mobile);
    setIsIOS(!!ios);

    if (!mobile) return;
    const dismissed = sessionStorage.getItem(STORAGE_KEY);
    if (dismissed) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt({ prompt: () => (e as unknown as { prompt: () => Promise<void> }).prompt() });
    };
    window.addEventListener('beforeinstallprompt', handler);
    setVisible(true);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!visible || !isMobile) return null;

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      setDeferredPrompt(null);
    }
    setVisible(false);
    sessionStorage.setItem(STORAGE_KEY, '1');
  };

  const showInstallButton = deferredPrompt || isIOS;

  const handleDismiss = () => {
    setVisible(false);
    sessionStorage.setItem(STORAGE_KEY, '1');
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 md:hidden"
      role="banner"
      aria-label={t(locale, 'pwa.installPrompt')}
    >
      <div className="rounded-xl border border-theme-border bg-theme-bg-elevated shadow-lg p-3 flex flex-col gap-2">
        <p className="text-sm text-theme-fg">{t(locale, 'pwa.installPrompt')}</p>
        {isIOS ? (
          <p className="text-xs text-theme-fg-muted">{t(locale, 'pwa.iosHint')}</p>
        ) : null}
        <div className="flex items-center gap-2">
          {showInstallButton && (
            <button
              type="button"
              onClick={handleInstall}
              className="flex-1 min-h-[44px] rounded-lg bg-theme-accent text-theme-accent-fg font-medium text-sm px-4 touch-manipulation"
            >
              {t(locale, 'pwa.installButton')}
            </button>
          )}
          <button
            type="button"
            onClick={handleDismiss}
            className="min-h-[44px] px-4 rounded-lg border border-theme-border bg-theme-bg-subtle text-theme-fg-muted hover:bg-theme-bg-hover text-sm touch-manipulation"
          >
            {t(locale, 'pwa.dismiss')}
          </button>
        </div>
      </div>
    </div>
  );
}
