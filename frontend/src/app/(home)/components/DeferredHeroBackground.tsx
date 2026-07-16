'use client';

import { useEffect, useState } from 'react';

const HERO_MEDIA = [
  { src: '/home/herosection.webm', type: 'video/webm' },
  { src: '/home/herosection.mp4', type: 'video/mp4' },
] as const;
const HERO_FALLBACK = '/home/herosection.gif';

/**
 * Defers heavy hero media until after first paint so LCP stays text (headline), not a multi‑MB GIF.
 * Prefers WebM/MP4 when present under public/home/ (see scripts/optimize-home-hero.mjs).
 */
export function DeferredHeroBackground() {
  const [media, setMedia] = useState<{ kind: 'video'; src: string } | { kind: 'image'; src: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const pickGif = () => {
      const img = new Image();
      img.src = HERO_FALLBACK;
      img.onload = () => {
        if (!cancelled) setMedia({ kind: 'image', src: HERO_FALLBACK });
      };
    };

    const tryVideo = (index: number) => {
      if (index >= HERO_MEDIA.length) {
        pickGif();
        return;
      }
      const { src } = HERO_MEDIA[index];
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.src = src;
      video.onloadeddata = () => {
        if (!cancelled) setMedia({ kind: 'video', src });
      };
      video.onerror = () => tryVideo(index + 1);
    };

    const start = () => tryVideo(0);
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(start, { timeout: 2500 });
      return () => {
        cancelled = true;
        cancelIdleCallback(id);
      };
    }
    const t = setTimeout(start, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  return (
    <div className="absolute inset-0 bg-black" aria-hidden>
      {media?.kind === 'video' ? (
        <video
          src={media.src}
          className="w-full h-full object-cover object-center"
          autoPlay
          muted
          loop
          playsInline
          aria-hidden
        />
      ) : null}
      {media?.kind === 'image' ? (
        <img
          src={media.src}
          alt=""
          width={1920}
          height={1080}
          decoding="async"
          className="w-full h-full object-cover object-center"
        />
      ) : null}
    </div>
  );
}
