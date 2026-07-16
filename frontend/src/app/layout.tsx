import type { Metadata, Viewport } from 'next';
import { Syne, DM_Sans } from 'next/font/google';
import './globals.css';
import { LocaleProvider } from './components/LocaleContext';
import { ToastProvider } from './components/ToastContext';
import { IncognitoProvider } from './components/IncognitoContext';
import { CookieConsentLazy } from './components/CookieConsentLazy';
import { SITE_URL, SITE_NAME, DEFAULT_DESCRIPTION, absoluteUrl, DEFAULT_OG_IMAGE } from '@/lib/seo';

/** Display font for LCP headlines — single weight keeps the critical font chain to one file. */
const syne = Syne({
  subsets: ['latin'],
  variable: '--font-syne',
  display: 'swap',
  weight: ['700'],
  preload: true,
  adjustFontFallback: true,
});
/** Body font loads after paint (preload: false) to shorten HTML → CSS → font chain on marketing pages. */
const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
  weight: ['400', '500'],
  preload: false,
  adjustFontFallback: true,
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  keywords: ['AI', 'chat', 'image generation', 'video generation', 'European AI', 'Flipo5'],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  openGraph: {
    type: 'website',
    locale: 'en_GB',
    alternateLocale: ['de_DE'],
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    url: SITE_URL,
    images: [{ url: absoluteUrl(DEFAULT_OG_IMAGE), width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    images: [absoluteUrl(DEFAULT_OG_IMAGE)],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  icons: { icon: '/favicon.svg' },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: SITE_NAME,
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'format-detection': 'telephone=no',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#000000',
  viewportFit: 'cover', /* safe-area for notched devices */
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${syne.variable} ${dmSans.variable}`} suppressHydrationWarning>
      <body className="min-h-screen antialiased font-sans touch-manipulation">
        <LocaleProvider>
          <ToastProvider>
            <IncognitoProvider>
              {children}
              <CookieConsentLazy />
            </IncognitoProvider>
          </ToastProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
