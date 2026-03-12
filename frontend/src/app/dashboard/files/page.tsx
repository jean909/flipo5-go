'use client';

import dynamic from 'next/dynamic';
import { DashboardPageSkeleton } from '../components/DashboardPageSkeleton';

const FilesContent = dynamic(
  () => import('./FilesContent'),
  { loading: () => <DashboardPageSkeleton /> }
);

export default function FilesPage() {
  return <FilesContent />;
}
