'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
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

export default function Home() {
  const { locale } = useLocale();
  useHomeSessionRedirect();

  return (
    <div className="min-h-screen bg-black text-white flex flex-col overflow-x-clip">
      <Header dark />

      <main className="flex-1">
        {/* Hero: brand IS the visual — video punched through FLIPO5 */}
        <section className="relative min-h-[100svh] flex flex-col">
          <CinematicHeroBrand />

          {/* Accessible title for screen readers; visual brand is the mask */}
          <h1 className="sr-only">FLIPO5</h1>

          <div className="relative z-10 mt-auto w-full px-4 sm:px-6 lg:px-10 pb-[max(4.5rem,env(safe-area-inset-bottom))] pt-[max(6rem,calc(5rem+env(safe-area-inset-top)))] sm:pb-16">
            <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-end sm:justify-between gap-8">
              <div className="animate-home-hero-in max-w-lg">
                <p className="text-base sm:text-lg md:text-xl text-white/80 leading-snug font-medium">
                  {t(locale, 'home.hero.lineBefore')}{' '}
                  <span className="text-white">
                    <KineticModes />
                  </span>
                  {t(locale, 'home.hero.lineAfter')}
                </p>
                <div className="mt-7 flex flex-wrap items-center gap-4">
                  <Link
                    href="/start"
                    className="group relative inline-flex items-center justify-center gap-2.5 rounded-full bg-white text-black font-semibold px-8 py-3.5 min-h-[52px] text-sm sm:text-base overflow-hidden"
                  >
                    <span className="absolute inset-0 bg-neutral-200 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]" />
                    <span className="relative">{t(locale, 'home.cta')}</span>
                    <span className="relative inline-flex transition-transform duration-300 group-hover:translate-x-1">
                      <ArrowIcon />
                    </span>
                  </Link>
                  <span className="text-[11px] tracking-[0.28em] uppercase text-white/35">
                    {t(locale, 'home.hero.aside')}
                  </span>
                </div>
              </div>

              <div className="animate-home-hero-in animate-home-hero-in-delay-2 hidden md:flex items-center gap-6 text-[11px] tracking-[0.25em] uppercase text-white/30">
                <span>{t(locale, 'home.kinetic.chat')}</span>
                <span className="w-8 h-px bg-white/20" />
                <span>{t(locale, 'home.kinetic.image')}</span>
                <span className="w-8 h-px bg-white/20" />
                <span>{t(locale, 'home.kinetic.video')}</span>
              </div>
            </div>
          </div>

          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 hidden sm:block animate-home-scroll-cue" aria-hidden>
            <span className="block h-10 w-px bg-gradient-to-b from-white/60 to-transparent" />
          </div>
        </section>

        {/* Infinite proof strip — faster, taller, more physical */}
        <div className="relative border-y border-white/10 bg-black overflow-hidden">
          <div className="flex w-max animate-home-marquee-fast will-change-transform">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex shrink-0">
                {[
                  { src: '/home/home-chat.webp', label: t(locale, 'home.kinetic.chat') },
                  { src: '/home/home-image.webp', label: t(locale, 'home.kinetic.image') },
                  { src: '/home/home-video.webp', label: t(locale, 'home.kinetic.video') },
                  { src: '/home/herosection-poster.jpg', label: 'Studio' },
                  { src: '/home/home-chat.webp', label: t(locale, 'home.kinetic.chat') },
                  { src: '/home/home-image.webp', label: t(locale, 'home.kinetic.image') },
                ].map((item, i) => (
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
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                    <span className="absolute bottom-5 left-5 text-[11px] uppercase tracking-[0.32em] text-white/80">
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
