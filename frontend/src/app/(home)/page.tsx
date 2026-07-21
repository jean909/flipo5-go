'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';
import { DeferredHeroBackground } from './components/DeferredHeroBackground';
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
    <div className="min-h-screen bg-black text-white flex flex-col overflow-x-hidden">
      <Header dark />

      <main className="flex-1">
        {/* Full-bleed cinematic hero — brand first */}
        <section className="relative min-h-[100svh] flex flex-col justify-end sm:justify-center px-4 sm:px-6 lg:px-10 pb-[max(5rem,env(safe-area-inset-bottom))] pt-[max(5.5rem,calc(4rem+env(safe-area-inset-top)))] sm:pb-24">
          <DeferredHeroBackground />
          {/* Soft bottom/left scrim for text only — no floating chips on media */}
          <div
            className="absolute inset-0 pointer-events-none bg-[linear-gradient(180deg,rgba(0,0,0,0.35)_0%,rgba(0,0,0,0.15)_35%,rgba(0,0,0,0.7)_78%,rgba(0,0,0,0.92)_100%)]"
            aria-hidden
          />
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_80%_50%_at_50%_100%,rgba(0,0,0,0.55),transparent_70%)]" aria-hidden />

          <div className="relative z-10 w-full max-w-6xl mx-auto">
            <h1 className="animate-home-hero-in font-display text-[clamp(3.5rem,16vw,11rem)] font-bold tracking-[-0.06em] leading-[0.85] text-white">
              FLIPO5
            </h1>
            <p className="animate-home-hero-in animate-home-hero-in-delay-1 mt-5 sm:mt-7 max-w-xl text-base sm:text-lg md:text-xl text-white/75 leading-snug font-medium">
              {t(locale, 'home.hero.lineBefore')}{' '}
              <span className="text-white">
                <KineticModes />
              </span>
              {t(locale, 'home.hero.lineAfter')}
            </p>
            <div className="animate-home-hero-in animate-home-hero-in-delay-2 mt-8 sm:mt-10 flex flex-wrap items-center gap-4">
              <Link
                href="/start"
                className="group inline-flex items-center justify-center gap-2.5 rounded-full bg-white text-black font-semibold px-7 py-3.5 min-h-[48px] text-sm sm:text-base hover:bg-neutral-200 transition-colors"
              >
                {t(locale, 'home.cta')}
                <span className="inline-flex transition-transform duration-300 group-hover:translate-x-0.5">
                  <ArrowIcon />
                </span>
              </Link>
              <span className="hidden sm:inline text-xs tracking-[0.22em] uppercase text-white/40">
                {t(locale, 'home.hero.aside')}
              </span>
            </div>
          </div>

          {/* Scroll cue */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 hidden sm:flex flex-col items-center gap-2 animate-home-scroll-cue" aria-hidden>
            <span className="h-8 w-px bg-gradient-to-b from-white/50 to-transparent" />
          </div>
        </section>

        {/* Product-as-demo strip */}
        <div className="relative border-y border-white/10 bg-black overflow-hidden">
          <div className="flex w-max animate-marquee-infinite will-change-transform">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex shrink-0 items-stretch gap-0">
                {[
                  { src: '/home/home-chat.webp', label: t(locale, 'home.kinetic.chat') },
                  { src: '/home/home-image.webp', label: t(locale, 'home.kinetic.image') },
                  { src: '/home/home-video.webp', label: t(locale, 'home.kinetic.video') },
                  { src: '/home/herosection-poster.jpg', label: 'Studio' },
                ].map((item, i) => (
                  <div
                    key={`${copy}-${i}`}
                    className="relative w-[70vw] sm:w-[42vw] lg:w-[28vw] aspect-[16/10] border-r border-white/10 overflow-hidden"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.src}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 w-full h-full object-cover opacity-90"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                    <span className="absolute bottom-4 left-4 text-[11px] uppercase tracking-[0.28em] text-white/70">
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
