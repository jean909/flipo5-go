import type { Metadata, Viewport } from 'next';
import { Syne, DM_Sans } from 'next/font/google';
import './globals.css';
import { LocaleProvider } from './components/LocaleContext';
import { IncognitoProvider } from './components/IncognitoContext';

const syne = Syne({ subsets: ['latin'], variable: '--font-syne', display: 'swap' });
const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans', display: 'swap' });

export const metadata: Metadata = {
  title: 'Flipo5',
  description: 'AI Chat · Image · Video',
  icons: { icon: '/favicon.svg' },
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
    <html lang="en" className={`${syne.variable} ${dmSans.variable}`} data-scroll-behavior="smooth">
      <body className="min-h-screen antialiased font-sans">
        <LocaleProvider>
        <IncognitoProvider>{children}</IncognitoProvider>
      </LocaleProvider>
      </body>
    </html>
  );
}
