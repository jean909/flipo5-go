import type { Metadata } from 'next';
import { SITE_NAME } from '@/lib/seo';
import AdminLayoutClient from './AdminLayoutClient';

export const metadata: Metadata = {
  title: 'Admin',
  description: `Admin area for ${SITE_NAME}.`,
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
