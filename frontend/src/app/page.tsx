'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Header } from '@/app/components/Header';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

const serviceItems = [
  { key: 'chat', icon: ChatIcon, titleKey: 'home.services.chat.title' },
  { key: 'image', icon: ImageIcon, titleKey: 'home.services.image.title' },
  { key: 'video', icon: VideoIcon, titleKey: 'home.services.video.title' },
] as const;

const aboutPoints = [
  'home.about.one',
  'home.about.two',
  'home.about.three',
] as const;

// Galerie: tile-uri cu gradient + etichete (chat/image/video) – placeholder vizual
const galleryTiles = [
  { type: 'chat' as const, gradient: 'from-violet-500/20 to-fuchsia-500/10' },
  { type: 'image' as const, gradient: 'from-amber-500/15 to-orange-500/10' },
  { type: 'video' as const, gradient: 'from-cyan-500/15 to-blue-500/10' },
  { type: 'image' as const, gradient: 'from-emerald-500/15 to-teal-500/10' },
  { type: 'chat' as const, gradient: 'from-rose-500/15 to-pink-500/10' },
  { type: 'video' as const, gradient: 'from-violet-500/15 to-indigo-500/10' },
];

export default function Home() {
  const router = useRouter();
  const { locale } = useLocale();
  const galleryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session) router.replace('/dashboard');
    });
    return () => { cancelled = true; };
  }, [router]);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <Header dark />

      <main className="flex-1">
        {/* —— Hero (restrâns, gen Z) —— */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-12 items-center px-4 sm:px-6 lg:px-10 py-12 lg:py-16 max-w-6xl mx-auto relative">
          <div className="absolute top-1/2 right-0 -translate-y-1/2 w-[50vw] max-w-[480px] h-[50vh] max-h-[400px] bg-violet-500/[0.07] rounded-full blur-[100px] pointer-events-none" />

          <div className="relative order-2 lg:order-1">
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="text-[11px] uppercase tracking-[0.18em] text-neutral-500 mb-3"
            >
              {t(locale, 'home.hero.tagline')}
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06, duration: 0.4 }}
              className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white mb-4"
            >
              FLIPO5
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12, duration: 0.35 }}
              className="text-neutral-400 text-base max-w-sm mb-6"
            >
              {t(locale, 'home.hero.sub')}
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18, duration: 0.35 }}
            >
              <Link
                href="/start"
                className="inline-flex items-center gap-2 rounded-full bg-white text-black font-medium px-5 py-2.5 text-sm hover:bg-neutral-200 transition-colors"
              >
                {t(locale, 'home.cta')}
                <ArrowIcon />
              </Link>
            </motion.div>
          </div>

          <div className="relative order-1 lg:order-2 flex flex-col sm:flex-row gap-3 justify-center lg:justify-end">
            {serviceItems.map(({ key, icon: Icon, titleKey }, i) => (
              <motion.div
                key={key}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.08, duration: 0.4 }}
              >
                <motion.div
                  className="rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-sm p-5 flex flex-col items-center min-h-[120px] sm:min-w-[140px] justify-center hover:border-violet-500/30 hover:bg-white/[0.04] transition-colors"
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 2.5 + i * 0.4, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center mb-2">
                    <Icon className="w-5 h-5 text-white/90" />
                  </div>
                  <span className="text-xs font-medium text-white/90">{t(locale, titleKey)}</span>
                </motion.div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* —— About (3 puncte scurte, gen Z) —— */}
        <section className="px-4 sm:px-6 lg:px-10 py-10 max-w-6xl mx-auto">
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: '-40px' }}
            className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 mb-4"
          >
            {t(locale, 'home.about.title')}
          </motion.p>
          <motion.div
            className="flex flex-wrap gap-2"
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ delay: 0.05 }}
          >
            {aboutPoints.map((key) => (
              <span
                key={key}
                className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-neutral-400 hover:border-white/20 hover:text-neutral-300 transition-colors"
              >
                {t(locale, key)}
              </span>
            ))}
          </motion.div>
        </section>

        {/* —— Galerie (horizontal scroll, snap, modern) —— */}
        <section className="px-4 sm:px-6 lg:px-10 py-12 max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            className="mb-6"
          >
            <h2 className="text-sm font-semibold text-white mb-1">{t(locale, 'home.gallery.title')}</h2>
            <p className="text-xs text-neutral-500">{t(locale, 'home.gallery.sub')}</p>
          </motion.div>
          <div
            ref={galleryRef}
            className="flex gap-4 overflow-x-auto pb-2 scrollbar-none snap-x snap-mandatory -mx-4 px-4 sm:mx-0 sm:px-0"
          >
            {galleryTiles.map(({ type, gradient }, i) => (
              <motion.div
                key={`${type}-${i}`}
                initial={{ opacity: 0, scale: 0.96 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, margin: '-20px' }}
                transition={{ delay: i * 0.05, duration: 0.35 }}
                whileHover={{ scale: 1.02, y: -2 }}
                className={`flex-shrink-0 w-[180px] sm:w-[200px] h-[140px] rounded-2xl border border-white/10 bg-gradient-to-br ${gradient} overflow-hidden snap-center cursor-default relative`}
              >
                <div className="absolute inset-0 flex items-center justify-center">
                  {type === 'chat' && <ChatIcon className="w-8 h-8 text-white/20" />}
                  {type === 'image' && <ImageIcon className="w-8 h-8 text-white/20" />}
                  {type === 'video' && <VideoIcon className="w-8 h-8 text-white/20" />}
                </div>
                <span className="absolute bottom-3 left-3 right-3 text-[10px] uppercase tracking-wider text-white/40">
                  {type}
                </span>
              </motion.div>
            ))}
          </div>
        </section>

        {/* —— CTA final (restrâns) —— */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          className="px-4 sm:px-6 lg:px-10 py-16 max-w-6xl mx-auto text-center"
        >
          <p className="text-sm text-neutral-500 mb-4">{t(locale, 'home.ctaSection.sub')}</p>
          <Link
            href="/start"
            className="inline-flex items-center gap-2 rounded-full bg-white text-black font-medium px-5 py-2.5 text-sm hover:bg-neutral-200 transition-colors"
          >
            {t(locale, 'home.cta')}
            <ArrowIcon />
          </Link>
        </motion.section>
      </main>
    </div>
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
function ArrowIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
    </svg>
  );
}
