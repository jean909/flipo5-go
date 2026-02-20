'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Header } from '@/app/components/Header';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

const aboutPoints = [
  'home.about.one',
  'home.about.two',
  'home.about.three',
] as const;

const sections = [
  { key: 'chat' as const, icon: ChatIcon, gradient: 'from-violet-500/25 to-fuchsia-500/15', label: '01' },
  { key: 'image' as const, icon: ImageIcon, gradient: 'from-amber-500/25 to-orange-500/15', label: '02' },
  { key: 'video' as const, icon: VideoIcon, gradient: 'from-cyan-500/25 to-blue-500/15', label: '03' },
];

export default function Home() {
  const router = useRouter();
  const { locale } = useLocale();
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session) router.replace('/dashboard');
    });
    return () => { cancelled = true; };
  }, [router]);

  return (
    <div className="min-h-screen bg-black bg-grid-dark text-white flex flex-col overflow-x-hidden">
      <Header dark />

      <main className="flex-1">
        {/* —— Hero: GIF background + overlay | center: headline, logo, button —— */}
        <section className="relative min-h-[70vh] sm:min-h-[85vh] flex flex-col justify-center items-center px-4 sm:px-6 pt-[max(5rem,calc(1.25rem+env(safe-area-inset-top)))] pb-12 sm:pt-24 sm:pb-16">
          <div className="absolute inset-0">
            <img
              src="/home/herosection.gif"
              alt=""
              width={1920}
              height={1080}
              fetchPriority="high"
              decoding="async"
              className="w-full h-full object-cover object-center"
            />
          </div>
          <div className="absolute inset-0 bg-black/55 pointer-events-none" aria-hidden />
          <div className="relative z-10 text-center">
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="text-[11px] sm:text-xs uppercase tracking-[0.3em] text-neutral-400 mb-6 font-medium"
            >
              {t(locale, 'home.hero.headline')}
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-bold tracking-tighter text-white mb-8 sm:mb-10 leading-[0.95]"
            >
              FLIPO5
            </motion.h1>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.45 }}
            >
              <Link
                href="/start"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full border border-white/30 bg-white/5 px-6 py-3.5 sm:px-5 sm:py-2.5 text-sm font-medium text-white hover:bg-white/10 hover:border-white/40 transition-colors min-h-[44px]"
              >
                {t(locale, 'home.cta')}
                <ArrowIcon />
              </Link>
            </motion.div>
          </div>
        </section>

        {/* —— Infinite marquee strip —— */}
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

        {/* —— Our story —— */}
        <section className="relative py-16 sm:py-24 lg:py-32 px-4 sm:px-6 lg:px-16">
            <div className="max-w-6xl mx-auto">
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
                className="text-neutral-300 text-base sm:text-lg lg:text-xl max-w-2xl leading-relaxed mb-12"
              >
                {t(locale, 'home.story.body')}
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.15 }}
                className="flex flex-wrap gap-3 mb-16"
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
              <motion.div
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-6"
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

        {/* —— Sections: big type + overlapping composition —— */}
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
              {/* Decorative big label behind content */}
              <motion.span
                variants={{ hidden: { opacity: 0 }, visible: { opacity: 0.06 } }}
                transition={{ duration: 0.8 }}
                className="absolute top-1/2 -translate-y-1/2 font-display text-[ clamp(8rem,20vw,18rem)] font-bold tracking-tighter text-white select-none pointer-events-none"
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
                  {/* Soft glow inside card */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                </motion.div>
              </div>
            </motion.section>
          );
        })}

        {/* —— Final CTA strip —— */}
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
      </main>
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
    </svg>
  );
}
function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}
function ImageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}
function VideoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}
