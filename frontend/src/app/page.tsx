'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Header } from '@/app/components/Header';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const router = useRouter();
  const { locale } = useLocale();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/dashboard');
    });
  }, [router]);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <Header dark />
      <main className="flex-1 relative overflow-hidden">
        {/* Grid + glow (example UI style) */}
        <div className="absolute inset-0 bg-grid-dark pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-white/[0.03] rounded-full blur-3xl pointer-events-none" />
        <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/4 text-white/5 text-[18rem] font-display font-bold select-none pointer-events-none">
          {"</>"}
        </div>

        {/* Services section */}
        <section id="services" className="relative pt-20 pb-10 px-4 sm:px-6 lg:px-8">
          <p className="text-center text-neutral-500 uppercase tracking-[0.3em] text-[10px] font-medium mb-10">
            {t(locale, 'home.services.title')}
          </p>
          <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-3 gap-6">
            {[
              { key: 'chat', icon: ChatIcon, titleKey: 'home.services.chat.title', descKey: 'home.services.chat.desc' },
              { key: 'image', icon: ImageIcon, titleKey: 'home.services.image.title', descKey: 'home.services.image.desc' },
              { key: 'video', icon: VideoIcon, titleKey: 'home.services.video.title', descKey: 'home.services.video.desc' },
            ].map(({ key, icon: Icon, titleKey, descKey }) => (
              <div
                key={key}
                className="group flex items-start gap-4 p-6 rounded-xl border border-neutral-800 hover:bg-neutral-900/50 transition-all duration-300"
              >
                <div className="w-12 h-12 bg-neutral-900 group-hover:bg-white rounded-lg flex items-center justify-center flex-shrink-0 transition-colors">
                  <Icon className="w-6 h-6 text-neutral-400 group-hover:text-black transition-colors" />
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-1">{t(locale, titleKey)}</h3>
                  <p className="text-sm text-neutral-500">{t(locale, descKey)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Hero */}
        <section className="relative flex flex-col items-center justify-center px-4 py-16 md:py-24">
          <p className="text-neutral-500 uppercase tracking-[0.3em] text-xs font-medium mb-6">
            {t(locale, 'home.hero.tagline')}
          </p>
          <h1 className="font-display text-5xl sm:text-6xl md:text-7xl font-bold text-white text-center mb-4 tracking-tight">
            FLIPO5
          </h1>
          <p className="text-lg text-neutral-400 text-center mb-10 max-w-lg leading-relaxed">
            {t(locale, 'home.hero.sub')}
          </p>
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
            <Link
              href="/start"
              className="inline-flex items-center gap-2 rounded-md bg-white text-black font-semibold px-8 py-4 hover:bg-neutral-200 transition-colors group"
            >
              {t(locale, 'home.cta')}
              <ArrowIcon />
            </Link>
          </motion.div>
          <div className="flex gap-10 mt-16">
            <div className="border-l border-neutral-700 pl-4 text-left">
              <div className="font-display text-2xl font-bold text-white">{t(locale, 'home.stats.ai')}</div>
              <div className="text-xs text-neutral-500 uppercase tracking-wider">{t(locale, 'home.stats.text')}</div>
            </div>
            <div className="border-l border-neutral-700 pl-4 text-left">
              <div className="font-display text-2xl font-bold text-white">{t(locale, 'home.stats.photo')}</div>
              <div className="text-xs text-neutral-500 uppercase tracking-wider">{t(locale, 'home.stats.photo')}</div>
            </div>
            <div className="border-l border-neutral-700 pl-4 text-left">
              <div className="font-display text-2xl font-bold text-white">{t(locale, 'home.stats.video')}</div>
              <div className="text-xs text-neutral-500 uppercase tracking-wider">{t(locale, 'home.stats.video')}</div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-8 h-8'} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}
function ImageIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-8 h-8'} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}
function VideoIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-8 h-8'} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}
function ArrowIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
    </svg>
  );
}
