'use client';

import dynamic from 'next/dynamic';
import { DashboardPageSkeleton } from '../components/DashboardPageSkeleton';

const ProductPicturesContent = dynamic(
  () => import('./ProductPicturesContent'),
  { loading: () => <DashboardPageSkeleton /> }
);

export default function ProductPicturesPage() {
  return <ProductPicturesContent />;
}
