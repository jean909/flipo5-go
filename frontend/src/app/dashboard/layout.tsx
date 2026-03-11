import type { Metadata } from 'next';
import { SITE_NAME } from '@/lib/seo';
import DashboardLayoutClient from './DashboardLayoutClient';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: `Your ${SITE_NAME} workspace—chat, images, video, and content.`,
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayoutClient>{children}</DashboardLayoutClient>;
}
