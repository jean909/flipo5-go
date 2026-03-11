import type { Metadata } from 'next';
import { SITE_NAME, DEFAULT_DESCRIPTION } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Get started',
  description:
    'Create your Flipo5 account and start creating with AI—chat, images, and video. ' + DEFAULT_DESCRIPTION,
  robots: { index: true, follow: true },
};

export default function StartLayout({ children }: { children: React.ReactNode }) {
  return children;
}
