'use client';

import dynamic from 'next/dynamic';
import { DashboardPageSkeleton } from '../components/DashboardPageSkeleton';

const AudioContent = dynamic(
  () => import('./AudioContent'),
  { loading: () => <DashboardPageSkeleton /> }
);

export default function AudioPage() {
  return <AudioContent />;
}
