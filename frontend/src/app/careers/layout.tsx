import type { Metadata } from 'next';
import { SITE_URL, SITE_NAME, absoluteUrl } from '@/lib/seo';

export const metadata: Metadata = {
  title: `Careers | ${SITE_NAME}`,
  description: 'Join our team. Full remote roles: Software, IT Services Consulting, Marketing.',
  openGraph: {
    title: `Careers | ${SITE_NAME}`,
    description: 'Join our team. Full remote roles: Software, IT Services Consulting, Marketing.',
    url: `${SITE_URL}/careers`,
  },
};

export default function CareersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
