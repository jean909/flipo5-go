'use client';

import { useRef, type ReactNode } from 'react';
import Link from 'next/link';
import {
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';
import { LazySectionVideo } from './LazySectionVideo';
import { ArrowIcon, EuropeMapIcon } from './HomeIcons';

const easeOut = [0.16, 1, 0.3, 1] as const;

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
  const pinRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: pinRef,
    offset: ['start start', 'end start'],
  });

  const rawScale = useTransform(scrollYProgress, [0, 0.55, 1], [1, 1, 0.92]);
  const rawOpacity = useTransform(scrollYProgress, [0, 0.55, 0.92], [1, 1, 0.35]);
  const rawImgY = useTransform(scrollYProgress, [0, 1], ['0%', '-12%']);
  const rawImgScale = useTransform(scrollYProgress, [0, 0.5, 1], [1.14, 1.04, 1.1]);
  const rawTextY = useTransform(scrollYProgress, [0, 0.35, 0.85], [36, 0, -28]);
  const rawTextOpacity = useTransform(scrollYProgress, [0, 0.18, 0.7, 0.95], [0, 1, 1, 0]);
  const rawClip = useTransform(scrollYProgress, [0, 0.22], ['inset(12% 8% 12% 8%)', 'inset(0% 0% 0% 0%)']);

  const scale = useSpring(rawScale, { stiffness: 90, damping: 28 });
  const opacity = useSpring(rawOpacity, { stiffness: 90, damping: 28 });
  const imgY = useSpring(rawImgY, { stiffness: 60, damping: 26 });
  const imgScale = useSpring(rawImgScale, { stiffness: 60, damping: 26 });
  const textY = useSpring(rawTextY, { stiffness: 100, damping: 24 });
  const textOpacity = useSpring(rawTextOpacity, { stiffness: 100, damping: 24 });

  return (
    <div ref={pinRef} className="relative h-[180vh] sm:h-[200vh]" style={{ zIndex: index + 1 }}>
      <motion.section
        className="sticky top-0 h-[100svh] flex items-end overflow-hidden border-b border-white/10 will-change-transform"
        style={reduced ? undefined : { scale, opacity }}
      >
        <motion.div
          className="absolute inset-0 overflow-hidden"
          style={reduced ? undefined : { clipPath: rawClip }}
        >
          <motion.div className="absolute inset-0" style={reduced ? undefined : { y: imgY, scale: imgScale }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.image}
              alt=""
              loading={index === 0 ? 'eager' : 'lazy'}
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover"
            />
          </motion.div>
        </motion.div>
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/20" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_20%_80%,rgba(0,0,0,0.55),transparent)]" />

        <motion.div
          className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pb-16 sm:pb-20 lg:pb-24 pt-32"
          style={reduced ? undefined : { y: textY, opacity: textOpacity }}
        >
          <div className="max-w-2xl">
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
          </div>
        </motion.div>
      </motion.section>
    </div>
  );
}

function ClipRevealLine({
  children,
  delay = 0,
}: {
  children: ReactNode;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <span className="inline-block overflow-hidden align-bottom pb-[0.08em] -mb-[0.08em]">
      <motion.span
        className="inline-block"
        initial={reduced ? false : { y: '110%' }}
        whileInView={{ y: '0%' }}
        viewport={{ once: true, amount: 0.7 }}
        transition={{ duration: 0.85, delay, ease: easeOut }}
      >
        {children}
      </motion.span>
    </span>
  );
}

export default function HomeAnimatedSections() {
  const { locale } = useLocale();
  const reduced = useReducedMotion();
  const studioRef = useRef<HTMLElement>(null);
  const studioInView = useInView(studioRef, { once: true, amount: 0.2 });
  const studioScrollRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: studioProgress } = useScroll({
    target: studioScrollRef,
    offset: ['start end', 'center center'],
  });
  const studioFrameY = useSpring(useTransform(studioProgress, [0, 1], [80, 0]), {
    stiffness: 70,
    damping: 24,
  });
  const studioFrameScale = useSpring(useTransform(studioProgress, [0, 1], [0.94, 1]), {
    stiffness: 70,
    damping: 24,
  });

  const ctaRef = useRef<HTMLElement>(null);
  const { scrollYProgress: ctaProgress } = useScroll({
    target: ctaRef,
    offset: ['start end', 'end start'],
  });
  const ghostY = useSpring(useTransform(ctaProgress, [0, 1], [100, -100]), {
    stiffness: 50,
    damping: 22,
  });
  const ghostOpacity = useTransform(ctaProgress, [0.12, 0.4, 0.8], [0.03, 0.1, 0.03]);
  const ghostScale = useSpring(useTransform(ctaProgress, [0, 0.5, 1], [0.92, 1.02, 1.08]), {
    stiffness: 50,
    damping: 22,
  });

  const manifesto = t(locale, 'home.manifesto').split(' ');

  return (
    <>
      <section className="relative py-28 sm:py-36 lg:py-48 px-4 sm:px-6 lg:px-10 bg-black">
        <div className="max-w-6xl mx-auto">
          <p className="font-display text-[clamp(1.85rem,5.8vw,4.5rem)] font-bold tracking-[-0.035em] text-white leading-[1.08]">
            {manifesto.map((word, i) => (
              <span key={`${word}-${i}`} className="mr-[0.28em]">
                <ClipRevealLine delay={i * 0.06}>{word}</ClipRevealLine>
              </span>
            ))}
          </p>
          <motion.p
            initial={reduced ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.35 + manifesto.length * 0.04, ease: easeOut }}
            className="mt-8 text-neutral-400 text-lg sm:text-xl max-w-2xl leading-relaxed"
          >
            {t(locale, 'home.manifesto.sub')}
          </motion.p>
        </div>
      </section>

      <div className="relative">
        {capabilities.map((item, i) => (
          <StickyCapability key={item.key} item={item} index={i} locale={locale} />
        ))}
      </div>

      <motion.section
        ref={studioRef}
        className="relative py-20 sm:py-28 lg:py-36 px-4 sm:px-6 lg:px-10 bg-black border-t border-white/10"
      >
        <div ref={studioScrollRef} className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-end mb-10 lg:mb-12">
            <div className="lg:col-span-8">
              <motion.span
                initial={reduced ? false : { opacity: 0, y: 12 }}
                animate={studioInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, ease: easeOut }}
                className="text-[11px] uppercase tracking-[0.4em] text-neutral-500 block"
              >
                Edit Studio
              </motion.span>
              <h2 className="mt-3 font-display text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-[-0.04em] text-white leading-[0.95]">
                <span className="block">
                  <ClipRevealLine delay={0.05}>{t(locale, 'home.bringToLife.line1')}</ClipRevealLine>
                </span>
                <span className="block text-white/35">
                  <ClipRevealLine delay={0.16}>{t(locale, 'home.bringToLife.line2')}</ClipRevealLine>
                </span>
              </h2>
            </div>
            <motion.p
              initial={reduced ? false : { opacity: 0, y: 16 }}
              animate={studioInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.75, delay: 0.2, ease: easeOut }}
              className="lg:col-span-4 text-neutral-400 text-base sm:text-lg leading-relaxed"
            >
              {t(locale, 'home.bringToLife.caption')}
            </motion.p>
          </div>
          <motion.div
            style={reduced ? undefined : { y: studioFrameY, scale: studioFrameScale }}
            className="relative overflow-hidden border border-white/10 will-change-transform"
          >
            <LazySectionVideo
              src="/home/bring-to-life.mp4"
              className="aspect-[21/9] w-full min-h-[240px] sm:min-h-[340px] lg:min-h-[460px]"
            />
            <div className="absolute inset-0 ring-1 ring-inset ring-white/10 pointer-events-none" />
          </motion.div>
        </div>
      </motion.section>

      <section className="relative py-24 sm:py-32 px-4 sm:px-6 lg:px-10 bg-black border-t border-white/10 overflow-hidden">
        <motion.div
          initial={reduced ? false : { opacity: 0, scale: 0.94 }}
          whileInView={{ opacity: 0.06, scale: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 1.2, ease: easeOut }}
          className="absolute right-[-8%] top-1/2 -translate-y-1/2 w-[50%] max-w-lg pointer-events-none hidden lg:block"
          aria-hidden
        >
          <EuropeMapIcon className="w-full h-auto text-white" />
        </motion.div>
        <div className="relative max-w-5xl mx-auto">
          <motion.p
            initial={reduced ? false : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.55, ease: easeOut }}
            className="text-[11px] uppercase tracking-[0.4em] text-neutral-500 mb-4"
          >
            {t(locale, 'home.story.title')}
          </motion.p>
          <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-[-0.04em] text-white mb-6 leading-[0.95]">
            <ClipRevealLine>{t(locale, 'home.story.subtitle')}</ClipRevealLine>
          </h2>
          <motion.p
            initial={reduced ? false : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.12, ease: easeOut }}
            className="text-neutral-400 text-lg sm:text-xl max-w-3xl leading-relaxed mb-16"
          >
            {t(locale, 'home.story.body')}
          </motion.p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-white/10">
            {(['2022', '2023', '2024'] as const).map((year, i) => (
              <motion.div
                key={year}
                initial={reduced ? false : { opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.65, delay: i * 0.12, ease: easeOut }}
                className="bg-black p-7 sm:p-9 group"
              >
                <motion.span
                  className="font-display text-3xl sm:text-4xl font-bold text-white tabular-nums tracking-tight inline-block"
                  whileInView={reduced ? undefined : { scale: [0.92, 1.04, 1] }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.7, delay: 0.15 + i * 0.12, ease: easeOut }}
                >
                  {year}
                </motion.span>
                <p className="mt-4 text-sm text-neutral-400 leading-snug">
                  {t(locale, `home.story.year${year}`)}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section ref={ctaRef} className="relative py-32 sm:py-40 lg:py-52 px-4 overflow-hidden bg-black border-t border-white/10">
        <motion.div
          style={reduced ? undefined : { y: ghostY, opacity: ghostOpacity, scale: ghostScale }}
          className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center select-none"
          aria-hidden
        >
          <span className="font-display font-bold tracking-[-0.07em] text-[clamp(5rem,22vw,18rem)] text-white leading-none">
            FLIPO5
          </span>
        </motion.div>
        <div className="relative max-w-3xl mx-auto text-center">
          <h2 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-[-0.04em] text-white leading-[0.95]">
            <ClipRevealLine>{t(locale, 'home.ctaSection.title')}</ClipRevealLine>
          </h2>
          <motion.p
            initial={reduced ? false : { opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.65, delay: 0.15, ease: easeOut }}
            className="mt-6 text-neutral-400 text-base sm:text-lg"
          >
            {t(locale, 'home.ctaSection.sub')}
          </motion.p>
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 18, scale: 0.96 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.25, ease: easeOut }}
          >
            <Link
              href="/start"
              className="group relative mt-10 inline-flex items-center justify-center gap-2.5 rounded-full bg-white text-black font-semibold px-9 py-4 min-h-[54px] text-base overflow-hidden"
            >
              <span className="absolute inset-0 bg-neutral-200 translate-y-full group-hover:translate-y-0 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]" />
              <span className="relative">{t(locale, 'home.cta')}</span>
              <span className="relative inline-flex transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-1.5">
                <ArrowIcon />
              </span>
            </Link>
          </motion.div>
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
