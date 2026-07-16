'use client';

import { useEffect, useState } from 'react';

const HERO_VIDEO = '/home/herosection.mp4';
const HERO_POSTER = '/home/herosection-poster.jpg';

/**
 * Shows a light poster immediately, then swaps to compressed MP4 after idle.
 * Avoids shipping multi‑MB GIF fallbacks.
 */
export function DeferredHeroBackground() {
  const [showVideo, setShowVideo] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const start = () => {
      if (!cancelled) setShowVideo(true);
    };
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(start, { timeout: 2000 });
      return () => {
        cancelled = true;
        cancelIdleCallback(id);
      };
    }
    const t = setTimeout(start, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  return (
    <div className="absolute inset-0 bg-black" aria-hidden>
      <img
        src={HERO_POSTER}
        alt=""
        width={720}
        height={720}
        decoding="async"
        fetchPriority="low"
        className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-500 ${showVideo ? 'opacity-0' : 'opacity-100'}`}
      />
      {showVideo ? (
        <video
          src={HERO_VIDEO}
          poster={HERO_POSTER}
          className="absolute inset-0 w-full h-full object-cover object-center"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden
        />
      ) : null}
    </div>
  );
}
