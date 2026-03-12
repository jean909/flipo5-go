'use client';

import dynamic from 'next/dynamic';
import { DashboardPageSkeleton } from '../components/DashboardPageSkeleton';

const LogoContent = dynamic(
  () => import('./LogoContent'),
  { loading: () => <DashboardPageSkeleton /> }
);

export default function LogoPage() {
  return <LogoContent />;
}
