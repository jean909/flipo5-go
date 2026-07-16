'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { motion, useInView } from 'framer-motion';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';
import { LazySectionVideo } from './LazySectionVideo';
import { ArrowIcon, ChatIcon, EuropeMapIcon, ImageIcon, VideoIcon } from './HomeIcons';

const sections = [
  { key: 'chat' as const, icon: ChatIcon, gradient: 'from-violet-500/25 to-fuchsia-500/15', label: '01' },
  { key: 'image' as const, icon: ImageIcon, gradient: 'from-amber-500/25 to-orange-500/15', label: '02' },
  { key: 'video' as const, icon: VideoIcon, gradient: 'from-cyan-500/25 to-blue-500/15', label: '03' },
];

export default function HomeAnimatedSections() {
  const { locale } = useLocale();
  const bringToLifeRef = useRef<HTMLElement>(null);
  const bringToLifeInView = useInView(bringToLifeRef, { once: true, amount: 0.2 });

  return (
    <>
      <motion.section
        ref={bringToLifeRef}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        variants={{ hidden: {}, visible: {} }}
        className="relative py-24 sm:py-32 lg:py-40 px-4 sm:px-6 lg:px-8"
      >
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[1.25fr_0.75fr] gap-10 lg:gap-14 xl:gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: 32 }}
            animate={bringToLifeInView ? { opacity: 1, x: 0 } : { opacity: 0, x: 32 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="relative lg:order-1"
          >
            <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden border border-white/15 bg-black/40 shadow-[0_0_80px_-16px_rgba(255,255,255,0.06)] ring-1 ring-white/5">
              <LazySectionVideo
                src="/home/bring%20to%20life.mp4"
                className="aspect-video w-full min-h-[240px] sm:min-h-[280px]"
              />
              <div className="absolute inset-0 rounded-2xl sm:rounded-3xl pointer-events-none ring-inset ring-white/5" aria-hidden />
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={bringToLifeInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -24 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="lg:order-2 lg:pl-2"
          >
            <span className="text-[11px] uppercase tracking-[0.3em] text-neutral-500">Edit Studio</span>
            <motion.h2
              className="mt-3 font-display text-3xl sm:text-4xl lg:text-5xl xl:text-[3.25rem] font-bold tracking-tight leading-[1.06]"
              initial="hidden"
              animate={bringToLifeInView ? 'visible' : 'hidden'}
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: 0.35, delayChildren: 0.15 } },
              }}
            >
              {(['line1', 'line2'] as const).map((key) => (
                <motion.span
                  key={key}
                  className="block py-0.5"
                  variants={{
                    hidden: { color: 'rgb(161 161 170)' },
                    visible: { color: 'rgb(255 255 255)' },
                  }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                >
                  {t(locale, `home.bringToLife.${key}`)}
                </motion.span>
              ))}
            </motion.h2>
          </motion.div>
        </div>
      </motion.section>

      <section className="relative py-16 sm:py-24 lg:py-32 px-4 sm:px-6 lg:px-16">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-12 lg:gap-16 items-start">
            <div>
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4 }}
                className="text-[11px] uppercase tracking-[0.3em] text-neutral-400 mb-3"
              >
                {t(locale, 'home.story.title')}
              </motion.p>
              <motion.h2
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.05 }}
                className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white mb-6"
              >
                {t(locale, 'home.story.subtitle')}
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="text-neutral-300 text-base sm:text-lg lg:text-xl max-w-2xl leading-relaxed mb-10"
              >
                {t(locale, 'home.story.body')}
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.15 }}
                className="flex flex-wrap gap-3"
              >
                {(['flexibility', 'privacy', 'speed', 'creativity'] as const).map((pillar) => (
                  <span
                    key={pillar}
                    className="rounded-full border border-white/25 bg-white/5 px-4 py-2 text-sm font-medium text-white/90"
                  >
                    {t(locale, `home.story.pillar.${pillar}`)}
                  </span>
                ))}
              </motion.div>
            </div>
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="w-full lg:w-64 xl:w-72 shrink-0 rounded-2xl border border-white/10 bg-white/5 p-4 flex items-center justify-center"
              aria-hidden
            >
              <EuropeMapIcon className="w-full h-auto text-white/20" />
            </motion.div>
          </div>
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-6 mt-16"
          >
            {(['2022', '2023', '2024'] as const).map((year) => (
              <div key={year} className="flex gap-4 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white font-semibold text-sm tabular-nums">
                  {year}
                </span>
                <p className="text-neutral-300 text-sm leading-snug pt-1.5">{t(locale, `home.story.year${year}`)}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {sections.map(({ key, icon: Icon, gradient, label }, i) => {
        const textFirst = i % 2 === 0;
        const textFrom = textFirst ? -48 : 48;
        const visualFrom = textFirst ? 48 : -48;
        return (
          <motion.section
            key={key}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '100px', amount: 0.2 }}
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.15, delayChildren: 0.1 } } }}
            className="relative py-16 sm:py-24 lg:py-32 px-4 sm:px-6 lg:px-12 max-w-7xl mx-auto"
          >
            <motion.span
              variants={{ hidden: { opacity: 0 }, visible: { opacity: 0.06 } }}
              transition={{ duration: 0.8 }}
              className="absolute top-1/2 -translate-y-1/2 font-display text-[clamp(8rem,20vw,18rem)] font-bold tracking-tighter text-white select-none pointer-events-none"
              style={{ [textFirst ? 'right' : 'left']: '5%' }}
            >
              {label}
            </motion.span>

            <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
              <motion.div
                variants={{ hidden: { opacity: 0, x: textFrom }, visible: { opacity: 1, x: 0 } }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className={textFirst ? 'lg:order-1' : 'lg:order-2'}
              >
                <span className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">{label}</span>
                <h2 className="mt-2 text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold tracking-tight text-white leading-[1.1]">
                  {t(locale, `home.section.${key}.title`)}
                </h2>
                <p className="mt-6 text-neutral-400 text-base sm:text-lg max-w-lg leading-relaxed">
                  {t(locale, `home.section.${key}.desc`)}
                </p>
              </motion.div>

              <motion.div
                variants={{ hidden: { opacity: 0, x: visualFrom }, visible: { opacity: 1, x: 0 } }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className={`relative rounded-2xl sm:rounded-3xl border border-white/10 bg-gradient-to-br ${gradient} aspect-[4/3] min-h-[200px] sm:min-h-[280px] flex items-center justify-center overflow-hidden ${textFirst ? 'lg:order-2' : 'lg:order-1'}`}
              >
                <Icon className="w-24 h-24 sm:w-32 sm:h-32 text-white/25 relative z-10" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" aria-hidden />
              </motion.div>
            </div>
          </motion.section>
        );
      })}

      <motion.section
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="py-16 sm:py-24 px-4 text-center"
      >
        <Link
          href="/start"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-white text-black font-semibold px-8 py-4 min-h-[48px] text-base hover:bg-neutral-200 transition-colors"
        >
          {t(locale, 'home.cta')}
          <ArrowIcon />
        </Link>
      </motion.section>

      <footer className="border-t border-white/10 px-4 py-6 text-center text-xs text-neutral-400">
        <Link href="/cookie-policy" className="hover:text-white underline-offset-2 hover:underline">
          Cookie & Privacy Policy
        </Link>
      </footer>
    </>
  );
}
