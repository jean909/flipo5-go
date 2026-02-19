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
    <div className="min-h-screen bg-black bg-grid-dark text-white flex flex-col">
      <Header dark />

      <main className="flex-1">
        {/* —— Hero —— */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-12 items-center px-4 sm:px-6 lg:px-10 py-12 lg:py-16 max-w-6xl mx-auto relative">

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

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4 }}
            className="relative order-1 lg:order-2 flex justify-center lg:justify-end"
          >
            <img
              src="/home/herosection.gif"
              alt=""
              className="w-full max-w-md lg:max-w-lg xl:max-w-xl aspect-square object-contain"
            />
          </motion.div>
        </section>

        {/* —— About —— */}
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

        {/* —— Scroll sections: alternating text / visual —— */}
        {[
          { key: 'chat' as const, icon: ChatIcon, gradient: 'from-violet-500/20 to-fuchsia-500/10' },
          { key: 'image' as const, icon: ImageIcon, gradient: 'from-amber-500/20 to-orange-500/10' },
          { key: 'video' as const, icon: VideoIcon, gradient: 'from-cyan-500/20 to-blue-500/10' },
        ].map(({ key, icon: Icon, gradient }, i) => {
          const textFirst = i % 2 === 0;
          return (
            <motion.section
              key={key}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.5 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center px-4 sm:px-6 lg:px-10 py-16 lg:py-24 max-w-6xl mx-auto"
            >
              <div className={textFirst ? 'order-2 lg:order-1' : 'order-2 lg:order-2'}>
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white mb-4">
                  {t(locale, `home.section.${key}.title`)}
                </h2>
                <p className="text-neutral-400 text-base sm:text-lg max-w-lg mb-6 leading-relaxed">
                  {t(locale, `home.section.${key}.desc`)}
                </p>
                <Link
                  href="/start"
                  className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/[0.06] px-5 py-2.5 text-sm font-medium text-white hover:bg-white/[0.1] hover:border-white/30 transition-colors"
                >
                  {t(locale, `home.section.${key}.cta`)}
                  <ArrowIcon />
                </Link>
              </div>
              <div className={`rounded-2xl border border-white/10 bg-gradient-to-br ${gradient} aspect-[4/3] flex items-center justify-center ${textFirst ? 'order-1 lg:order-2' : 'order-1 lg:order-1'}`}>
                <Icon className="w-20 h-20 sm:w-24 sm:h-24 text-white/30" />
              </div>
            </motion.section>
          );
        })}

      </main>
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
