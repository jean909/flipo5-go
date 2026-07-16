'use client';

import dynamic from 'next/dynamic';

const CookieConsentBanner = dynamic(
  () => import('./CookieConsentBanner').then((m) => ({ default: m.CookieConsentBanner })),
  { ssr: false },
);

export function CookieConsentLazy() {
  return <CookieConsentBanner />;
}
