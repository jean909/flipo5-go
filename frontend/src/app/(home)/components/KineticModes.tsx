'use client';

import { useEffect, useState } from 'react';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';

const MODE_KEYS = ['chat', 'image', 'video'] as const;

/** Linear-style kinetic word swap for Chat / Image / Video. */
export function KineticModes() {
  const { locale } = useLocale();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % MODE_KEYS.length);
    }, 2200);
    return () => window.clearInterval(id);
  }, []);

  return (
    <span className="relative inline-flex h-[1.15em] min-w-[5.5ch] items-center justify-center overflow-hidden align-baseline">
      {MODE_KEYS.map((key, i) => (
        <span
          key={key}
          className={`absolute inset-x-0 text-center transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            i === index
              ? 'translate-y-0 opacity-100'
              : i === (index - 1 + MODE_KEYS.length) % MODE_KEYS.length
                ? '-translate-y-full opacity-0'
                : 'translate-y-full opacity-0'
          }`}
          aria-hidden={i !== index}
        >
          {t(locale, `home.kinetic.${key}`)}
        </span>
      ))}
      <span className="invisible" aria-hidden>
        {t(locale, 'home.kinetic.image')}
      </span>
    </span>
  );
}
