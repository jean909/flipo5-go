'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';
import { CinematicHeroBrand } from './components/CinematicHeroBrand';
import { KineticModes } from './components/KineticModes';
import { useHomeSessionRedirect } from './components/useHomeSessionRedirect';
import { HomeBelowFoldSkeleton } from './components/HomeBelowFoldSkeleton';
import { HomeHeaderSkeleton } from './components/HomeHeaderSkeleton';
import { ArrowIcon } from './components/HomeIcons';

const Header = dynamic(
  () => import('../components/Header').then((m) => ({ default: m.Header })),
  { loading: () => <HomeHeaderSkeleton /> },
);

const HomeAnimatedSections = dynamic(() => import('./components/HomeAnimatedSections'), {
  loading: () => <HomeBelowFoldSkeleton />,
  ssr: false,
});

const easeOut = [0.16, 1, 0.3, 1] as const;

export default function Home() {
  const { locale } = useLocale();
  const reduced = useReducedMotion();
  useHomeSessionRedirect();

  const marqueeItems = [
    { src: '/home/home-chat.webp', label: t(locale, 'home.kinetic.chat') },
    { src: '/home/home-image.webp', label: t(locale, 'home.kinetic.image') },
    { src: '/home/home-video.webp', label: t(locale, 'home.kinetic.video') },
    { src: '/home/herosection-poster.jpg', label: 'Studio' },
    { src: '/home/home-chat.webp', label: t(locale, 'home.kinetic.chat') },
    { src: '/home/home-image.webp', label: t(locale, 'home.kinetic.image') },
  ];

  return (
    <div className="min-h-screen bg-black text-white flex flex-col overflow-x-clip">
      <Header dark />

      <main className="flex-1">
        <section className="relative min-h-[100svh] flex flex-col">
          <CinematicHeroBrand />
          <h1 className="sr-only">FLIPO5</h1>

          <div className="relative z-10 mt-auto w-full px-4 sm:px-6 lg:px-10 pb-[max(4.5rem,env(safe-area-inset-bottom))] pt-[max(6rem,calc(5rem+env(safe-area-inset-top)))] sm:pb-16">
            <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-end sm:justify-between gap-8">
              <div className="max-w-lg">
                <motion.p
                  initial={reduced ? false : { opacity: 0, y: 28 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.9, delay: 0.55, ease: easeOut }}
                  className="text-base sm:text-lg md:text-xl text-white/80 leading-snug font-medium"
                >
                  {t(locale, 'home.hero.lineBefore')}{' '}
                  <span className="text-white">
                    <KineticModes />
                  </span>
                  {t(locale, 'home.hero.lineAfter')}
                </motion.p>
                <motion.div
                  initial={reduced ? false : { opacity: 0, y: 22 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.85, delay: 0.78, ease: easeOut }}
                  className="mt-7 flex flex-wrap items-center gap-4"
                >
                  <Link
                    href="/start"
                    className="group relative inline-flex items-center justify-center gap-2.5 rounded-full bg-white text-black font-semibold px-8 py-3.5 min-h-[52px] text-sm sm:text-base overflow-hidden"
                  >
                    <span className="absolute inset-0 bg-neutral-200 translate-y-full group-hover:translate-y-0 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]" />
                    <span className="relative">{t(locale, 'home.cta')}</span>
                    <span className="relative inline-flex transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-1.5">
                      <ArrowIcon />
                    </span>
                  </Link>
                  <span className="text-[11px] tracking-[0.28em] uppercase text-white/35">
                    {t(locale, 'home.hero.aside')}
                  </span>
                </motion.div>
              </div>

              <motion.div
                initial={reduced ? false : { opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.9, delay: 0.95, ease: easeOut }}
                className="hidden md:flex items-center gap-6 text-[11px] tracking-[0.25em] uppercase text-white/30"
              >
                <span>{t(locale, 'home.kinetic.chat')}</span>
                <span className="w-8 h-px bg-white/20 origin-left animate-home-line-grow" />
                <span>{t(locale, 'home.kinetic.image')}</span>
                <span className="w-8 h-px bg-white/20 origin-left animate-home-line-grow" style={{ animationDelay: '0.12s' }} />
                <span>{t(locale, 'home.kinetic.video')}</span>
              </motion.div>
            </div>
          </div>

          <motion.div
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.35, duration: 0.8 }}
            className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 hidden sm:block animate-home-scroll-cue"
            aria-hidden
          >
            <span className="block h-10 w-px bg-gradient-to-b from-white/60 to-transparent" />
          </motion.div>
        </section>

        <div className="relative border-y border-white/10 bg-black overflow-hidden group/marquee">
          <div className="flex w-max animate-home-marquee-fast will-change-transform group-hover/marquee:[animation-play-state:paused]">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex shrink-0">
                {marqueeItems.map((item, i) => (
                  <div
                    key={`${copy}-${i}`}
                    className="group relative w-[78vw] sm:w-[48vw] lg:w-[32vw] aspect-[16/10] border-r border-white/10 overflow-hidden"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.src}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                    <span className="absolute bottom-5 left-5 text-[11px] uppercase tracking-[0.32em] text-white/80 translate-y-1 opacity-80 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-y-0 group-hover:opacity-100">
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <HomeAnimatedSections />
      </main>
    </div>
  );
}
