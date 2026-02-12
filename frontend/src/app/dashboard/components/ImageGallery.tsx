'use client';

import { useState } from 'react';
import { t } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { ImageViewModal } from './ImageViewModal';

interface ImageGalleryProps {
  urls: string[];
  /** 'chat' = compact in chat bubble, 'full' = full width (e.g. job detail) */
  variant?: 'chat' | 'full';
  locale?: Locale;
  onUseAsReference?: (url: string) => void;
}

export function ImageGallery({ urls, variant = 'chat', locale = 'en', onUseAsReference }: ImageGalleryProps) {
  const [selected, setSelected] = useState(0);
  const [viewingUrl, setViewingUrl] = useState<string | null>(null);
  const main = urls[selected];
  const maxW = variant === 'chat' ? 'max-w-[340px]' : '';

  const ImageOverlay = ({ url, className = '' }: { url: string; className?: string }) => (
    <div className={`relative group ${className}`}>
      <div className="block cursor-pointer" onClick={() => setViewingUrl(url)}>
        <img src={url} alt="" className="w-full h-auto object-cover" loading="lazy" decoding="async" />
      </div>
      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 pointer-events-none">
        {onUseAsReference && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onUseAsReference(url); }}
            className="px-3 py-1.5 rounded-lg bg-white/40 text-white text-sm font-medium hover:bg-white/50 pointer-events-auto -mt-4"
          >
            {t(locale, 'image.useAsReference')}
          </button>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setViewingUrl(url); }}
          className="px-3 py-1.5 rounded-lg bg-white/40 text-white text-sm font-medium hover:bg-white/50 pointer-events-auto"
        >
          {t(locale, 'image.view')}
        </button>
      </div>
    </div>
  );

  if (urls.length === 1) {
    const cls = variant === 'full' ? 'block overflow-hidden rounded-lg border border-white/10' : 'block overflow-hidden rounded-lg';
    return (
      <>
        <div className={variant === 'chat' ? 'flex justify-start' : ''}>
          <div className={`${cls} ${maxW}`}>
            <ImageOverlay url={urls[0]} />
          </div>
        </div>
        {viewingUrl && (
          <ImageViewModal url={viewingUrl} onClose={() => setViewingUrl(null)} locale={locale} />
        )}
      </>
    );
  }
  const containerCls = variant === 'chat'
    ? `${maxW} min-w-0 flex gap-2 rounded-2xl rounded-tl-md overflow-hidden p-2 bg-white/5`
    : 'flex gap-3 rounded-lg border border-white/10 p-2 bg-white/5';
  const mainCls = variant === 'chat' ? 'flex-1 min-w-0' : 'flex-1 min-w-0';
  const thumbCls = variant === 'chat' ? 'w-14 shrink-0 max-h-56' : 'w-20 shrink-0 max-h-80';
  return (
    <>
      <div className={variant === 'chat' ? 'flex justify-start' : ''}>
        <div className={containerCls}>
          <div className={mainCls}>
            <div className="rounded-lg overflow-hidden">
              <ImageOverlay url={main} />
            </div>
          </div>
          <div className={`flex flex-col gap-1.5 ${thumbCls} overflow-y-auto scrollbar-subtle`}>
            {urls.map((url, i) => (
              <button
                key={url}
                type="button"
                onClick={() => setSelected(i)}
                className={`block rounded overflow-hidden border-2 transition-all shrink-0 ${
                  i === selected ? 'border-white/60 ring-1 ring-white/30' : 'border-transparent hover:border-white/30 opacity-70 hover:opacity-100'
                }`}
              >
                <img src={url} alt="" className="w-full aspect-square object-cover" loading="lazy" decoding="async" />
              </button>
            ))}
          </div>
        </div>
      </div>
      {viewingUrl && (
        <ImageViewModal url={viewingUrl} onClose={() => setViewingUrl(null)} locale={locale} />
      )}
    </>
  );
}
