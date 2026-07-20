'use client';

import dynamic from 'next/dynamic';
import { DashboardPageSkeleton } from '../components/DashboardPageSkeleton';

const BrandingContent = dynamic(
  () => import('./BrandingContent'),
  { loading: () => <DashboardPageSkeleton /> }
);

export default function BrandingPage() {
  return <BrandingContent />;
}
