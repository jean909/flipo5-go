'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { syncMe } from '@/lib/api';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';

function AuthCallbackContent() {
  const { locale } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    (async () => {
      const tokenHash = searchParams.get('token_hash');
      const type = searchParams.get('type');
      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as 'email' });
        if (error) {
          setStatus('error');
          router.replace('/start');
          return;
        }
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const synced = await syncMe();
        if (synced) {
          setStatus('ok');
          router.replace('/dashboard');
        } else {
          setStatus('error');
          setTimeout(() => router.replace('/dashboard'), 3000);
        }
      } else {
        setStatus('error');
        router.replace('/start');
      }
    })();
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-2 px-4">
      <p className="text-neutral-500">
        {status === 'loading' && t(locale, 'auth.signingIn')}
        {status === 'ok' && t(locale, 'auth.redirecting')}
        {status === 'error' && t(locale, 'auth.syncError')}
      </p>
    </div>
  );
}

function AuthCallbackFallback() {
  const { locale } = useLocale();
  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-neutral-500">{t(locale, 'common.loading')}</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<AuthCallbackFallback />}>
      <AuthCallbackContent />
    </Suspense>
  );
}
