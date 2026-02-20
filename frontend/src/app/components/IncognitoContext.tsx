'use client';

import { createContext, useContext, useState, useCallback, useEffect, useMemo, ReactNode } from 'react';
import { patchThread } from '@/lib/api';

const INCOGNITO_THREAD_KEY = 'flipo5_incognito_thread';

const IncognitoContext = createContext<{
  incognito: boolean;
  setIncognito: (v: boolean) => void;
  incognitoThreadId: string | null;
  setIncognitoThreadId: (id: string | null) => void;
} | null>(null);

export function IncognitoProvider({ children }: { children: ReactNode }) {
  const [incognito, setIncognitoState] = useState(false);
  const [incognitoThreadId, setIncognitoThreadIdState] = useState<string | null>(null);

  const setIncognito = useCallback((v: boolean) => {
    setIncognitoState(v);
    if (!v) {
      setIncognitoThreadIdState(null);
      if (typeof window !== 'undefined') window.sessionStorage.removeItem(INCOGNITO_THREAD_KEY);
    }
  }, []);

  const setIncognitoThreadId = useCallback((id: string | null) => {
    setIncognitoThreadIdState(id);
    if (typeof window !== 'undefined') {
      if (id) window.sessionStorage.setItem(INCOGNITO_THREAD_KEY, id);
      else window.sessionStorage.removeItem(INCOGNITO_THREAD_KEY);
    }
  }, []);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.sessionStorage.getItem(INCOGNITO_THREAD_KEY) : null;
    if (stored) {
      patchThread(stored, 'delete').finally(() => {
        if (typeof window !== 'undefined') window.sessionStorage.removeItem(INCOGNITO_THREAD_KEY);
      });
    }
  }, []);

  const value = useMemo(
    () => ({ incognito, setIncognito, incognitoThreadId, setIncognitoThreadId }),
    [incognito, setIncognito, incognitoThreadId, setIncognitoThreadId]
  );
  return (
    <IncognitoContext.Provider value={value}>
      {children}
    </IncognitoContext.Provider>
  );
}

export function useIncognito() {
  const ctx = useContext(IncognitoContext);
  return ctx ?? { incognito: false, setIncognito: () => {}, incognitoThreadId: null, setIncognitoThreadId: () => {} };
}
