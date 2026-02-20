'use client';

import { createContext, useContext, useState, useCallback, useEffect, useMemo, ReactNode } from 'react';
import type { Locale } from '@/lib/i18n';

const LocaleContext = createContext<{
  locale: Locale;
  setLocale: (l: Locale) => void;
} | null>(null);

function getStoredLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  const stored = localStorage.getItem('locale');
  return stored === 'de' ? 'de' : 'en';
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');
  useEffect(() => {
    setLocaleState(getStoredLocale());
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    if (typeof window !== 'undefined') localStorage.setItem('locale', l);
  }, []);
  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return (
    <LocaleContext.Provider value={value}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) return { locale: 'en' as Locale, setLocale: () => {} };
  return ctx;
}
