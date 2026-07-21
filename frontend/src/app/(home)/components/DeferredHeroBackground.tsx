'use client';

import { useEffect, useState } from 'react';

const HERO_VIDEO = '/home/herosection.mp4';
const HERO_POSTER = '/home/herosection-poster.jpg';

/**
 * Full-bleed hero video: poster first, then MP4 after idle.
 * Edge-to-edge visual plane for the landing composition.
 */
export function DeferredHeroBackground() {
  const [showVideo, setShowVideo] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const start = () => {
      if (!cancelled) setShowVideo(true);
    };
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(start, { timeout: 1800 });
      return () => {
        cancelled = true;
        cancelIdleCallback(id);
      };
    }
    const t = setTimeout(start, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  return (
    <div className="absolute inset-0 bg-black overflow-hidden" aria-hidden>
      <img
        src={HERO_POSTER}
        alt=""
        width={1280}
        height={720}
        decoding="async"
        fetchPriority="high"
        className={`absolute inset-0 w-full h-full object-cover object-center scale-[1.02] transition-opacity duration-700 ${showVideo ? 'opacity-0' : 'opacity-100'}`}
      />
      {showVideo ? (
        <video
          src={HERO_VIDEO}
          poster={HERO_POSTER}
          className="absolute inset-0 w-full h-full object-cover object-center scale-[1.02]"
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
