'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Redirect logged-in users to dashboard without pulling Supabase into the critical path. */
export function useHomeSessionRedirect() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const check = () => {
      void import('@/lib/supabase').then(({ supabase }) =>
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!cancelled && session) router.replace('/dashboard');
        }),
      );
    };

    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(check, { timeout: 4000 });
      return () => {
        cancelled = true;
        cancelIdleCallback(id);
      };
    }
    const t = setTimeout(check, 1500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [router]);
}
