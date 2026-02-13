'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';

export default function LoginPage() {
  const router = useRouter();
  const { locale } = useLocale();
  useEffect(() => {
    router.replace('/start');
  }, [router]);
  return (
    <div className="min-h-screen bg-theme-bg flex items-center justify-center">
      <p className="text-theme-fg-muted">{t(locale, 'auth.redirecting')}</p>
    </div>
  );
}
