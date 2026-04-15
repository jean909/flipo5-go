import type { Metadata, Viewport } from 'next';
import { Syne, DM_Sans } from 'next/font/google';
import './globals.css';
import { LocaleProvider } from './components/LocaleContext';
import { ToastProvider } from './components/ToastContext';
import { IncognitoProvider } from './components/IncognitoContext';
import { CookieConsentBanner } from './components/CookieConsentBanner';
import { SITE_URL, SITE_NAME, DEFAULT_DESCRIPTION, absoluteUrl, DEFAULT_OG_IMAGE } from '@/lib/seo';

const syne = Syne({ subsets: ['latin'], variable: '--font-syne', display: 'swap' });
const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans', display: 'swap' });

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

function preconnectOrigin(raw: string | undefined): string | null {
  const s = raw?.trim();
  if (!s) return null;
  try {
    return new URL(s).origin;
  } catch {
    return null;
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const apiOrigin = preconnectOrigin(process.env.NEXT_PUBLIC_API_URL);
  const supabaseOrigin = preconnectOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
  return (
    <html lang="en" className={`${syne.variable} ${dmSans.variable}`} suppressHydrationWarning>
      <head>
        {apiOrigin ? <link rel="preconnect" href={apiOrigin} crossOrigin="anonymous" /> : null}
        {supabaseOrigin ? <link rel="preconnect" href={supabaseOrigin} crossOrigin="anonymous" /> : null}
      </head>
      <body className="min-h-screen antialiased font-sans touch-manipulation">
        <LocaleProvider>
          <ToastProvider>
            <IncognitoProvider>
              {children}
              <CookieConsentBanner />
            </IncognitoProvider>
          </ToastProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
