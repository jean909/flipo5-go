'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { motion, useInView, useScroll, useTransform } from 'framer-motion';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';
import { LazySectionVideo } from './LazySectionVideo';
import { ArrowIcon, EuropeMapIcon } from './HomeIcons';

const capabilities = [
  { key: 'chat' as const, label: '01', image: '/home/home-chat.webp' },
  { key: 'image' as const, label: '02', image: '/home/home-image.webp' },
  { key: 'video' as const, label: '03', image: '/home/home-video.webp' },
];

function StickyCapability({
  item,
  index,
  locale,
}: {
  item: (typeof capabilities)[number];
  index: number;
  locale: 'en' | 'de';
}) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  const imgY = useTransform(scrollYProgress, [0, 1], ['8%', '-8%']);
  const imgScale = useTransform(scrollYProgress, [0, 0.5, 1], [1.12, 1.02, 1.08]);

  return (
    <section
      ref={ref}
      className="relative min-h-[100svh] sticky top-0 flex items-end overflow-hidden border-b border-white/10"
      style={{ zIndex: index + 1 }}
    >
      <motion.div className="absolute inset-0" style={{ y: imgY, scale: imgScale }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.image}
          alt=""
          loading={index === 0 ? 'eager' : 'lazy'}
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover"
        />
      </motion.div>
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/25" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_20%_80%,rgba(0,0,0,0.5),transparent)]" />

      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pb-16 sm:pb-20 lg:pb-24 pt-32">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-2xl"
        >
          <span className="text-[11px] uppercase tracking-[0.4em] text-white/45 tabular-nums">
            {item.label} — {t(locale, `home.kinetic.${item.key}`)}
          </span>
          <h2 className="mt-4 font-display text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-[-0.04em] text-white leading-[0.95]">
            {t(locale, `home.section.${item.key}.title`)}
          </h2>
          <p className="mt-5 text-white/65 text-base sm:text-lg max-w-lg leading-relaxed">
            {t(locale, `home.section.${item.key}.desc`)}
          </p>
          <Link
            href="/start"
            className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-white border-b border-white/40 pb-0.5 hover:border-white transition-colors"
          >
            {t(locale, `home.section.${item.key}.cta`)}
            <ArrowIcon />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

export default function HomeAnimatedSections() {
  const { locale } = useLocale();
  const studioRef = useRef<HTMLElement>(null);
  const studioInView = useInView(studioRef, { once: true, amount: 0.2 });
  const ctaRef = useRef<HTMLElement>(null);
  const { scrollYProgress: ctaProgress } = useScroll({
    target: ctaRef,
    offset: ['start end', 'end start'],
  });
  const ghostY = useTransform(ctaProgress, [0, 1], [80, -80]);
  const ghostOpacity = useTransform(ctaProgress, [0.15, 0.45, 0.85], [0.04, 0.09, 0.04]);

  return (
    <>
      {/* Manifesto — word-by-word punch */}
      <section className="relative py-28 sm:py-36 lg:py-44 px-4 sm:px-6 lg:px-10 bg-black">
        <div className="max-w-6xl mx-auto">
          <p className="font-display text-[clamp(1.85rem,5.8vw,4.5rem)] font-bold tracking-[-0.035em] text-white leading-[1.08]">
            {t(locale, 'home.manifesto')
              .split(' ')
              .map((word, i) => (
                <motion.span
                  key={`${word}-${i}`}
                  initial={{ opacity: 0, y: 28, filter: 'blur(8px)' }}
                  whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  viewport={{ once: true, amount: 0.6 }}
                  transition={{ duration: 0.55, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                  className="inline-block mr-[0.28em]"
                >
                  {word}
                </motion.span>
              ))}
          </p>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.45 }}
            className="mt-8 text-neutral-400 text-lg sm:text-xl max-w-2xl leading-relaxed"
          >
            {t(locale, 'home.manifesto.sub')}
          </motion.p>
        </div>
      </section>

      {/* Sticky full-bleed capability chapters */}
      <div className="relative">
        {capabilities.map((item, i) => (
          <StickyCapability key={item.key} item={item} index={i} locale={locale} />
        ))}
      </div>

      {/* Edit Studio — immersive wide */}
      <motion.section
        ref={studioRef}
        className="relative py-20 sm:py-28 lg:py-36 px-4 sm:px-6 lg:px-10 bg-black border-t border-white/10"
      >
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-end mb-10 lg:mb-12">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={studioInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.75 }}
              className="lg:col-span-8"
            >
              <span className="text-[11px] uppercase tracking-[0.4em] text-neutral-500">Edit Studio</span>
              <h2 className="mt-3 font-display text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-[-0.04em] text-white leading-[0.95]">
                <span className="block">{t(locale, 'home.bringToLife.line1')}</span>
                <span className="block text-white/35">{t(locale, 'home.bringToLife.line2')}</span>
              </h2>
            </motion.div>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={studioInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="lg:col-span-4 text-neutral-400 text-base sm:text-lg leading-relaxed"
            >
              {t(locale, 'home.bringToLife.caption')}
            </motion.p>
          </div>
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={studioInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.9, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            className="relative overflow-hidden border border-white/10"
          >
            <LazySectionVideo
              src="/home/bring-to-life.mp4"
              className="aspect-[21/9] w-full min-h-[240px] sm:min-h-[340px] lg:min-h-[460px]"
            />
            <div className="absolute inset-0 ring-1 ring-inset ring-white/10 pointer-events-none" />
          </motion.div>
        </div>
      </motion.section>

      {/* Europe */}
      <section className="relative py-24 sm:py-32 px-4 sm:px-6 lg:px-10 bg-black border-t border-white/10 overflow-hidden">
        <div className="absolute right-[-8%] top-1/2 -translate-y-1/2 w-[50%] max-w-lg opacity-[0.06] pointer-events-none hidden lg:block" aria-hidden>
          <EuropeMapIcon className="w-full h-auto text-white" />
        </div>
        <div className="relative max-w-5xl mx-auto">
          <p className="text-[11px] uppercase tracking-[0.4em] text-neutral-500 mb-4">
            {t(locale, 'home.story.title')}
          </p>
          <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-[-0.04em] text-white mb-6 leading-[0.95]">
            {t(locale, 'home.story.subtitle')}
          </h2>
          <p className="text-neutral-400 text-lg sm:text-xl max-w-3xl leading-relaxed mb-16">
            {t(locale, 'home.story.body')}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-white/10">
            {(['2022', '2023', '2024'] as const).map((year, i) => (
              <motion.div
                key={year}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="bg-black p-7 sm:p-9"
              >
                <span className="font-display text-3xl sm:text-4xl font-bold text-white tabular-nums tracking-tight">
                  {year}
                </span>
                <p className="mt-4 text-sm text-neutral-400 leading-snug">
                  {t(locale, `home.story.year${year}`)}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA with ghost brand */}
      <section ref={ctaRef} className="relative py-32 sm:py-40 lg:py-52 px-4 overflow-hidden bg-black border-t border-white/10">
        <motion.div
          style={{ y: ghostY, opacity: ghostOpacity }}
          className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center select-none"
          aria-hidden
        >
          <span className="font-display font-bold tracking-[-0.07em] text-[clamp(5rem,22vw,18rem)] text-white leading-none">
            FLIPO5
          </span>
        </motion.div>
        <div className="relative max-w-3xl mx-auto text-center">
          <p className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-[-0.04em] text-white leading-[0.95]">
            {t(locale, 'home.ctaSection.title')}
          </p>
          <p className="mt-6 text-neutral-400 text-base sm:text-lg">
            {t(locale, 'home.ctaSection.sub')}
          </p>
          <Link
            href="/start"
            className="group relative mt-10 inline-flex items-center justify-center gap-2.5 rounded-full bg-white text-black font-semibold px-9 py-4 min-h-[54px] text-base overflow-hidden"
          >
            <span className="absolute inset-0 bg-neutral-200 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]" />
            <span className="relative">{t(locale, 'home.cta')}</span>
            <span className="relative inline-flex transition-transform duration-300 group-hover:translate-x-1">
              <ArrowIcon />
            </span>
          </Link>
        </div>
      </section>

      <footer className="border-t border-white/10 px-4 py-6 text-center text-xs text-neutral-500 bg-black">
        <Link href="/cookie-policy" className="hover:text-white underline-offset-2 hover:underline transition-colors">
          Cookie & Privacy Policy
        </Link>
      </footer>
    </>
  );
}
