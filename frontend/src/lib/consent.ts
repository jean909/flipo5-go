export type ConsentDecision = 'granted' | 'denied';

export const CONSENT_STORAGE_KEY = 'flipo5_cookie_consent_v2';
export const CONSENT_COOKIE_NAME = 'flipo5_cookie_consent_v2';
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

const CONSENT_COOKIE_PREFIX = `${CONSENT_COOKIE_NAME}=`;

export function readConsentFromCookie(): ConsentDecision | null {
  if (typeof document === 'undefined') return null;
  const raw = document.cookie
    .split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith(CONSENT_COOKIE_PREFIX));
  if (!raw) return null;
  const value = decodeURIComponent(raw.slice(CONSENT_COOKIE_PREFIX.length));
  return value === 'granted' || value === 'denied' ? value : null;
}

export function readConsentDecision(): ConsentDecision | null {
  if (typeof window === 'undefined') return null;
  try {
    const ls = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (ls === 'granted' || ls === 'denied') return ls;
  } catch {
    // no-op
  }
  return readConsentFromCookie();
}

export function persistConsentDecision(decision: ConsentDecision): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, decision);
  } catch {
    // no-op
  }
  if (typeof document !== 'undefined') {
    document.cookie = `${CONSENT_COOKIE_NAME}=${encodeURIComponent(decision)}; Max-Age=${CONSENT_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
  }
}

type GtagFunction = (...args: unknown[]) => void;

function getSafeGtag(): GtagFunction {
  if (typeof window === 'undefined') return () => {};
  const w = window as typeof window & {
    dataLayer?: unknown[];
    gtag?: GtagFunction;
  };
  w.dataLayer = w.dataLayer ?? [];
  w.gtag =
    w.gtag ??
    ((...args: unknown[]) => {
      w.dataLayer?.push(args);
    });
  return w.gtag;
}

export function setConsentDefaultDenied(): void {
  const gtag = getSafeGtag();
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    functionality_storage: 'denied',
    personalization_storage: 'denied',
    security_storage: 'granted',
    wait_for_update: 500,
  });
}

export function updateConsent(decision: ConsentDecision): void {
  const gtag = getSafeGtag();
  const granted = decision === 'granted' ? 'granted' : 'denied';
  gtag('consent', 'update', {
    ad_storage: granted,
    ad_user_data: granted,
    ad_personalization: granted,
    analytics_storage: granted,
    functionality_storage: granted,
    personalization_storage: granted,
    security_storage: 'granted',
  });
}
