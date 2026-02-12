'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';
import { motion, AnimatePresence } from 'framer-motion';

type DropdownKey = 'features' | null;

const featureItems = [
  { key: 'chat', titleKey: 'home.services.chat.title', descKey: 'home.services.chat.desc', href: '#services', icon: ChatIcon },
  { key: 'image', titleKey: 'home.services.image.title', descKey: 'home.services.image.desc', href: '#services', icon: ImageIcon },
  { key: 'video', titleKey: 'home.services.video.title', descKey: 'home.services.video.desc', href: '#services', icon: VideoIcon },
];

export function Header({ dark }: { dark?: boolean }) {
  const { locale } = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const isDark = !!dark;
  const [activeDropdown, setActiveDropdown] = useState<DropdownKey>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleNav = (href: string) => {
    setIsMenuOpen(false);
    setActiveDropdown(null);
    if (href.startsWith('#')) {
      const id = href.slice(1);
      if (pathname === '/' && typeof document !== 'undefined') {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
        else router.push('/' + href);
      } else {
        router.push('/' + href);
      }
    } else {
      router.push(href);
    }
  };
  const textNav = isDark ? 'text-neutral-400 hover:text-white' : 'text-neutral-600 hover:text-black';
  const borderCls = isDark ? 'border-neutral-800' : 'border-neutral-200';

  return (
    <header
      className={`sticky top-0 left-0 right-0 z-50 transition-all duration-300 ${isDark ? 'bg-black' : 'bg-white'} ${isScrolled ? `border-b ${borderCls}` : ''}`}
      onMouseLeave={() => setActiveDropdown(null)}
    >
      <nav className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link
            href="/"
            className="group flex items-baseline gap-0.5 tracking-tight"
          >
            <span className={isDark ? 'text-neutral-500 group-hover:text-neutral-400' : 'text-neutral-400 group-hover:text-neutral-600'}>{"<"}</span>
            <span className={`font-display font-bold text-base md:text-lg ${isDark ? 'text-white' : 'text-black'}`}>
              FLIPO5
            </span>
            <span className={isDark ? 'text-neutral-500 group-hover:text-neutral-400' : 'text-neutral-400 group-hover:text-neutral-600'}>{" />"}</span>
          </Link>

          {/* Desktop */}
          <div className="hidden md:flex items-center gap-1">
            <motion.button
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleNav('/')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${textNav}`}
            >
              {t(locale, 'nav.home')}
            </motion.button>

            <div className="relative" onMouseEnter={() => setActiveDropdown('features')}>
              <motion.button
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.98 }}
                className={`flex items-center gap-1 px-4 py-2 text-sm font-medium transition-colors ${textNav}`}
              >
                {t(locale, 'nav.features')}
                <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform duration-200 ${activeDropdown === 'features' ? 'rotate-180' : ''}`} />
              </motion.button>
            </div>

            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="ml-2">
              <Link
                href="/start"
                className={`inline-block rounded-md px-4 py-2 text-sm font-semibold transition-colors ${isDark ? 'bg-white text-black hover:bg-neutral-200' : 'bg-black text-white hover:bg-neutral-800'}`}
              >
                {t(locale, 'nav.login')}
              </Link>
            </motion.div>
            <span className={`ml-2 px-2 text-sm ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`}>EN</span>
          </div>

          {/* Mobile */}
          <div className="flex items-center gap-2 md:hidden">
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={() => { setIsMenuOpen(!isMenuOpen); setActiveDropdown(null); }}
              className={`p-2 rounded-md ${isDark ? 'text-white hover:bg-neutral-800' : 'text-black hover:bg-neutral-100'}`}
            >
              {isMenuOpen ? <XIcon className="w-5 h-5" /> : <MenuIcon className="w-5 h-5" />}
            </motion.button>
          </div>
        </div>
      </nav>

      {/* Backdrop */}
      <AnimatePresence>
        {activeDropdown && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="hidden md:block fixed inset-x-0 top-16 bottom-0 bg-black/60 backdrop-blur-sm z-40"
            onClick={() => setActiveDropdown(null)}
          />
        )}
      </AnimatePresence>

      {/* Mega Dropdown */}
      <AnimatePresence>
        {activeDropdown === 'features' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="hidden md:block absolute left-0 right-0 bg-black border-t border-neutral-800 shadow-2xl z-50"
            onMouseEnter={() => setActiveDropdown('features')}
            onMouseLeave={() => setActiveDropdown(null)}
          >
            <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
              <p className="text-neutral-500 uppercase tracking-[0.3em] text-[10px] font-medium mb-6">
                {t(locale, 'nav.features')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {featureItems.map((item, i) => (
                  <motion.button
                    key={item.key}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    whileHover={{ y: -4, transition: { duration: 0.15 } }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleNav(item.href)}
                    className="flex items-start gap-4 p-4 rounded-xl hover:bg-neutral-900 transition-colors text-left group"
                  >
                    <div className="w-10 h-10 bg-neutral-900 group-hover:bg-white rounded-lg flex items-center justify-center flex-shrink-0 transition-colors">
                      <item.icon className="w-5 h-5 text-neutral-400 group-hover:text-black transition-colors" />
                    </div>
                    <div>
                      <div className="text-white font-medium mb-0.5">{t(locale, item.titleKey)}</div>
                      <div className="text-neutral-500 text-sm">{t(locale, item.descKey)}</div>
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className={`md:hidden overflow-hidden border-t ${borderCls} ${isDark ? 'bg-black' : 'bg-white'}`}
          >
            <div className="px-4 py-4 space-y-1">
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => handleNav('/')}
                className={`block w-full text-left px-4 py-3 rounded-lg text-sm font-medium ${textNav}`}
              >
                {t(locale, 'nav.home')}
              </motion.button>

              <button
                onClick={() => setActiveDropdown(activeDropdown === 'features' ? null : 'features')}
                className={`flex items-center justify-between w-full px-4 py-3 rounded-lg text-sm font-medium ${textNav}`}
              >
                {t(locale, 'nav.features')}
                <ChevronDownIcon className={`w-4 h-4 transition-transform ${activeDropdown === 'features' ? 'rotate-180' : ''}`} />
              </button>
              {activeDropdown === 'features' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="pl-4 pb-2 space-y-0.5"
                >
                  {featureItems.map((item) => (
                    <button
                      key={item.key}
                      onClick={() => handleNav(item.href)}
                      className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-sm ${isDark ? 'text-neutral-500 hover:text-white hover:bg-neutral-800' : 'text-neutral-600 hover:text-black hover:bg-neutral-100'}`}
                    >
                      <item.icon className="w-4 h-4 flex-shrink-0" />
                      {t(locale, item.titleKey)}
                    </button>
                  ))}
                </motion.div>
              )}

              <motion.div whileTap={{ scale: 0.98 }} className="pt-2">
                <Link
                  href="/start"
                  className={`block w-full text-center rounded-lg px-4 py-3 text-sm font-semibold ${isDark ? 'bg-white text-black' : 'bg-black text-white'}`}
                >
                  {t(locale, 'nav.login')}
                </Link>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}
function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}
function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-5 h-5'} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}
function ImageIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-5 h-5'} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}
function VideoIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-5 h-5'} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}
