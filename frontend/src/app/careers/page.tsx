'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Header } from '../components/Header';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';
import { Card } from '@/components/ui/Card';
import { buttonClassName } from '@/components/ui/Button';

const CAREERS_EMAIL = 'info@flipo5.com';

const positions = [
  { id: 'dev' as const, gradient: 'from-violet-500/20 to-fuchsia-500/10' },
  { id: 'it' as const, gradient: 'from-amber-500/20 to-orange-500/10' },
  { id: 'marketing' as const, gradient: 'from-cyan-500/20 to-blue-500/10' },
];

function MailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  );
}

function RemoteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  );
}

export default function CareersPage() {
  const { locale } = useLocale();

  return (
    <div className="min-h-screen bg-black bg-grid-dark text-white flex flex-col overflow-x-hidden">
      <Header dark />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative pt-[max(5rem,calc(1.25rem+env(safe-area-inset-top)))] pb-16 sm:pt-28 sm:pb-24 px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="text-[11px] sm:text-xs uppercase tracking-[0.3em] text-neutral-400 mb-4"
            >
              {t(locale, 'careers.title')}
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="font-display text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white mb-4"
            >
              {t(locale, 'careers.hero')}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="text-neutral-400 text-lg sm:text-xl max-w-2xl mx-auto"
            >
              {t(locale, 'careers.heroSub')}
            </motion.p>
          </div>
        </section>

        {/* Intro */}
        <section className="px-4 sm:px-6 pb-12">
          <div className="max-w-3xl mx-auto">
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-neutral-300 text-base sm:text-lg leading-relaxed"
            >
              {t(locale, 'careers.intro')}
            </motion.p>
          </div>
        </section>

        {/* Open positions */}
        <section className="px-4 sm:px-6 pb-20 sm:pb-28">
          <div className="max-w-5xl mx-auto">
            <motion.h2
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-[11px] uppercase tracking-[0.3em] text-neutral-500 mb-8"
            >
              {t(locale, 'careers.openPositions')}
            </motion.h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
              {positions.map(({ id, gradient }, i) => (
                <motion.article
                  key={id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                  className="group relative"
                >
                  <Card className="relative rounded-2xl border-white/10 bg-white/5 overflow-hidden hover:border-white/20 hover:bg-white/[0.07] transition-all duration-300 h-full">
                  <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none`} />
                  <div className="relative p-6 sm:p-7 flex flex-col h-full">
                    <span className="inline-flex items-center gap-1.5 text-neutral-500 text-xs font-medium mb-3">
                      <RemoteIcon className="w-3.5 h-3.5" />
                      {t(locale, 'careers.fullRemote')}
                    </span>
                    <h3 className="font-display text-xl sm:text-2xl font-bold text-white mb-2">
                      {t(locale, `careers.position.${id}.title`)}
                    </h3>
                    <p className="text-neutral-400 text-sm sm:text-base leading-relaxed flex-1 mb-6">
                      {t(locale, `careers.position.${id}.desc`)}
                    </p>
                    <a
                      href={`mailto:${CAREERS_EMAIL}?subject=${encodeURIComponent(t(locale, `careers.position.${id}.title`))}`}
                      className={buttonClassName({
                        variant: 'secondary',
                        className: 'inline-flex justify-center gap-2 min-h-[44px] border-white/25 bg-white/5 px-4 py-3 text-white hover:bg-white/10 hover:border-white/35',
                      })}
                    >
                      {t(locale, 'careers.apply')}
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                    </a>
                  </div>
                  </Card>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        {/* Contact block */}
        <section className="px-4 sm:px-6 pb-24 sm:pb-32">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-3xl mx-auto"
          >
            <Card className="rounded-2xl sm:rounded-3xl border-white/15 bg-white/5 p-8 sm:p-10 text-center">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-white mb-2">
              {t(locale, 'careers.contactTitle')}
            </h2>
            <p className="text-neutral-400 text-sm sm:text-base mb-6">
              {t(locale, 'careers.contactSub')}
            </p>
            <a
              href={`mailto:${CAREERS_EMAIL}`}
              className={buttonClassName({
                variant: 'primary',
                className: 'inline-flex items-center gap-2 min-h-[44px] rounded-xl px-6 py-3.5 font-semibold',
              })}
            >
              <MailIcon className="w-5 h-5" />
              {CAREERS_EMAIL}
            </a>
            </Card>
          </motion.div>
        </section>

        {/* Back to home */}
        <section className="px-4 pb-16 text-center">
          <Link
            href="/"
            className="text-neutral-400 hover:text-white text-sm font-medium transition-colors"
          >
            ← {t(locale, 'nav.home')}
          </Link>
        </section>
      </main>
    </div>
  );
}
