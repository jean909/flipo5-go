'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';

type ToastApi = { showToast: (i18nKey: string) => void };

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const { locale } = useLocale();
  const [message, setMessage] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const removeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    if (removeTimer.current) {
      clearTimeout(removeTimer.current);
      removeTimer.current = null;
    }
  };

  const showToast = useCallback(
    (i18nKey: string) => {
      const text = t(locale, i18nKey);
      clearTimers();
      setMessage(text);
      setVisible(true);
      hideTimer.current = setTimeout(() => setVisible(false), 2100);
      removeTimer.current = setTimeout(() => {
        setMessage(null);
        setVisible(false);
        removeTimer.current = null;
      }, 2400);
    },
    [locale],
  );

  useEffect(() => () => clearTimers(), []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {message != null && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className={`fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-[200] max-w-[min(92vw,260px)] -translate-x-1/2 pointer-events-none transition-opacity duration-300 ease-out ${
            visible ? 'opacity-[0.55]' : 'opacity-0'
          }`}
        >
          <div className="rounded-md border border-white/[0.04] bg-black/50 px-2.5 py-1 text-[11px] font-medium leading-snug tracking-wide text-neutral-600 shadow-none backdrop-blur-sm">
            {message}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  return { showToast: ctx?.showToast ?? (() => {}) };
}
