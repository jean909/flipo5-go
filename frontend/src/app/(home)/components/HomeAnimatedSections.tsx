'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { motion, useInView, useScroll, useTransform } from 'framer-motion';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';
import { LazySectionVideo } from './LazySectionVideo';
import { ArrowIcon, EuropeMapIcon } from './HomeIcons';

const capabilities = [
  {
    key: 'chat' as const,
    label: '01',
    image: '/home/home-chat.webp',
    accent: 'from-violet-500/20 via-transparent to-transparent',
  },
  {
    key: 'image' as const,
    label: '02',
    image: '/home/home-image.webp',
    accent: 'from-amber-500/20 via-transparent to-transparent',
  },
  {
    key: 'video' as const,
    label: '03',
    image: '/home/home-video.webp',
    accent: 'from-cyan-500/20 via-transparent to-transparent',
  },
];

export default function HomeAnimatedSections() {
  const { locale } = useLocale();
  const studioRef = useRef<HTMLElement>(null);
  const studioInView = useInView(studioRef, { once: true, amount: 0.25 });
  const ctaRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ctaRef,
    offset: ['start end', 'end start'],
  });
  const ctaY = useTransform(scrollYProgress, [0, 1], [40, -40]);

  return (
    <>
      {/* Manifesto line */}
      <section className="relative py-20 sm:py-28 lg:py-32 px-4 sm:px-6 lg:px-10 border-b border-white/10">
        <div className="max-w-5xl mx-auto">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-white leading-[1.15]"
          >
            {t(locale, 'home.manifesto')}
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mt-6 text-neutral-400 text-base sm:text-lg max-w-2xl leading-relaxed"
          >
            {t(locale, 'home.manifesto.sub')}
          </motion.p>
        </div>
      </section>

      {/* Capabilities — product as the demo */}
      {capabilities.map(({ key, label, image, accent }, i) => {
        const textFirst = i % 2 === 0;
        return (
          <section
            key={key}
            className="relative py-16 sm:py-24 lg:py-32 px-4 sm:px-6 lg:px-10 border-b border-white/10 overflow-hidden"
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${accent} pointer-events-none`} aria-hidden />
            <div className="relative max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 xl:gap-24 items-center">
              <motion.div
                initial={{ opacity: 0, x: textFirst ? -36 : 36 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
                className={textFirst ? 'lg:order-1' : 'lg:order-2'}
              >
                <span className="text-[11px] uppercase tracking-[0.35em] text-neutral-500 tabular-nums">
                  {label} — {t(locale, `home.kinetic.${key}`)}
                </span>
                <h2 className="mt-4 font-display text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold tracking-tight text-white leading-[1.05]">
                  {t(locale, `home.section.${key}.title`)}
                </h2>
                <p className="mt-6 text-neutral-400 text-base sm:text-lg max-w-lg leading-relaxed">
                  {t(locale, `home.section.${key}.desc`)}
                </p>
                <Link
                  href="/start"
                  className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-white border-b border-white/30 pb-0.5 hover:border-white transition-colors"
                >
                  {t(locale, `home.section.${key}.cta`)}
                  <ArrowIcon />
                </Link>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: textFirst ? 36 : -36, scale: 0.98 }}
                whileInView={{ opacity: 1, x: 0, scale: 1 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                className={`relative aspect-[4/3] overflow-hidden ${textFirst ? 'lg:order-2' : 'lg:order-1'}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image}
                  alt={t(locale, `home.section.${key}.title`)}
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 ring-1 ring-inset ring-white/10" aria-hidden />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" aria-hidden />
              </motion.div>
            </div>
          </section>
        );
      })}

      {/* Edit Studio — cinematic media plane */}
      <motion.section
        ref={studioRef}
        className="relative py-20 sm:py-28 lg:py-36 px-4 sm:px-6 lg:px-10 border-b border-white/10"
      >
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-end mb-10 lg:mb-14">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={studioInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="lg:col-span-7"
            >
              <span className="text-[11px] uppercase tracking-[0.35em] text-neutral-500">Edit Studio</span>
              <h2 className="mt-3 font-display text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold tracking-tight text-white leading-[1.05]">
                <span className="block">{t(locale, 'home.bringToLife.line1')}</span>
                <span className="block text-neutral-500">{t(locale, 'home.bringToLife.line2')}</span>
              </h2>
            </motion.div>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={studioInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="lg:col-span-5 text-neutral-400 text-base sm:text-lg leading-relaxed lg:pb-2"
            >
              {t(locale, 'home.bringToLife.caption')}
            </motion.p>
          </div>
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={studioInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.85, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="relative overflow-hidden border border-white/10 bg-black"
          >
            <LazySectionVideo
              src="/home/bring-to-life.mp4"
              className="aspect-[21/9] w-full min-h-[220px] sm:min-h-[320px] lg:min-h-[420px]"
            />
            <div className="absolute inset-0 pointer-events-none ring-1 ring-inset ring-white/10" aria-hidden />
          </motion.div>
        </div>
      </motion.section>

      {/* Europe story — editorial */}
      <section className="relative py-20 sm:py-28 lg:py-32 px-4 sm:px-6 lg:px-10 border-b border-white/10 overflow-hidden">
        <div className="absolute right-[-10%] top-1/2 -translate-y-1/2 w-[55%] max-w-xl opacity-[0.07] pointer-events-none hidden lg:block" aria-hidden>
          <EuropeMapIcon className="w-full h-auto text-white" />
        </div>
        <div className="relative max-w-5xl mx-auto">
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-[11px] uppercase tracking-[0.35em] text-neutral-500 mb-4"
          >
            {t(locale, 'home.story.title')}
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.65 }}
            className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white mb-6"
          >
            {t(locale, 'home.story.subtitle')}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.08 }}
            className="text-neutral-400 text-base sm:text-lg lg:text-xl max-w-3xl leading-relaxed mb-14"
          >
            {t(locale, 'home.story.body')}
          </motion.p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-white/10 border border-white/10">
            {(['2022', '2023', '2024'] as const).map((year, i) => (
              <motion.div
                key={year}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="bg-black p-6 sm:p-8"
              >
                <span className="font-display text-2xl sm:text-3xl font-bold text-white tabular-nums tracking-tight">
                  {year}
                </span>
                <p className="mt-3 text-sm text-neutral-400 leading-snug">
                  {t(locale, `home.story.year${year}`)}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section ref={ctaRef} className="relative py-28 sm:py-36 lg:py-44 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_50%,rgba(255,255,255,0.06),transparent_70%)]" aria-hidden />
        <motion.div style={{ y: ctaY }} className="relative max-w-4xl mx-auto text-center">
          <p className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-white leading-[0.95]">
            {t(locale, 'home.ctaSection.title')}
          </p>
          <p className="mt-5 text-neutral-400 text-base sm:text-lg">
            {t(locale, 'home.ctaSection.sub')}
          </p>
          <Link
            href="/start"
            className="mt-10 inline-flex items-center justify-center gap-2.5 rounded-full bg-white text-black font-semibold px-8 py-4 min-h-[52px] text-base hover:bg-neutral-200 transition-colors"
          >
            {t(locale, 'home.cta')}
            <ArrowIcon />
          </Link>
        </motion.div>
      </section>

      <footer className="border-t border-white/10 px-4 py-6 text-center text-xs text-neutral-500">
        <Link href="/cookie-policy" className="hover:text-white underline-offset-2 hover:underline transition-colors">
          Cookie & Privacy Policy
        </Link>
      </footer>
    </>
  );
}
