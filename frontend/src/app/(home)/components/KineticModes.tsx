'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';

const MODE_KEYS = ['chat', 'image', 'video'] as const;

/** Kinetic word swap — clipped vertical flip. */
export function KineticModes() {
  const { locale } = useLocale();
  const [index, setIndex] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % MODE_KEYS.length);
    }, 2400);
    return () => window.clearInterval(id);
  }, [reduced]);

  const key = MODE_KEYS[index];

  return (
    <span className="relative inline-flex h-[1.2em] min-w-[5.8ch] items-center justify-center overflow-hidden align-baseline">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={key}
          className="absolute inset-x-0 text-center"
          initial={reduced ? false : { y: '110%', opacity: 0 }}
          animate={{ y: '0%', opacity: 1 }}
          exit={{ y: '-110%', opacity: 0 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        >
          {t(locale, `home.kinetic.${key}`)}
        </motion.span>
      </AnimatePresence>
      <span className="invisible" aria-hidden>
        {t(locale, 'home.kinetic.image')}
      </span>
    </span>
  );
}
