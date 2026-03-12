'use client';

import dynamic from 'next/dynamic';
import { DashboardPageSkeleton } from '../components/DashboardPageSkeleton';

const CollectionsContent = dynamic(
  () => import('./CollectionsContent'),
  { loading: () => <DashboardPageSkeleton /> }
);

export default function CollectionsPage() {
  return <CollectionsContent />;
}
