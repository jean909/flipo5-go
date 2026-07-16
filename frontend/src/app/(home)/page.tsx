'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';
import { DeferredHeroBackground } from './components/DeferredHeroBackground';
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
    <div className="min-h-screen bg-black bg-grid-dark text-white flex flex-col overflow-x-hidden">
      <Header dark />

      <main className="flex-1">
        <section className="relative min-h-[70vh] sm:min-h-[85vh] flex flex-col justify-center items-center px-4 sm:px-6 pt-[max(5rem,calc(1.25rem+env(safe-area-inset-top)))] pb-12 sm:pt-24 sm:pb-16">
          <DeferredHeroBackground />
          <div className="absolute inset-0 bg-black/55 pointer-events-none" aria-hidden />
          <div className="relative z-10 text-center">
            <p className="animate-home-hero-in text-[11px] sm:text-xs uppercase tracking-[0.3em] text-neutral-400 mb-6 font-medium">
              {t(locale, 'home.hero.headline')}
            </p>
            <h1 className="animate-home-hero-in animate-home-hero-in-delay-1 font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-bold tracking-tighter text-white mb-8 sm:mb-10 leading-[0.95]">
              FLIPO5
            </h1>
            <div className="animate-home-hero-in animate-home-hero-in-delay-2">
              <Link
                href="/start"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full border border-white/30 bg-white/5 px-6 py-3.5 sm:px-5 sm:py-2.5 text-sm font-medium text-white hover:bg-white/10 hover:border-white/40 transition-colors min-h-[44px]"
              >
                {t(locale, 'home.cta')}
                <ArrowIcon />
              </Link>
            </div>
          </div>
        </section>

        <div className="py-5 border-y border-white/10 overflow-hidden select-none [contain:layout_paint]">
          <div className="flex w-max animate-marquee-infinite will-change-transform">
            {[...Array(2)].map((_, copyIndex) => (
              <div key={copyIndex} className="flex shrink-0 items-center gap-12 px-4">
                {[...Array(4)].map((_, i) => (
                  <span key={`${copyIndex}-${i}`} className="text-neutral-500 text-sm font-medium tracking-[0.2em] uppercase whitespace-nowrap">
                    {t(locale, 'home.about.one')} · {t(locale, 'home.about.two')} · {t(locale, 'home.about.three')}
                  </span>
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
