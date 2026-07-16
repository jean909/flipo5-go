'use client';

import { useEffect, useRef, useState } from 'react';

type LazySectionVideoProps = {
  src: string;
  className?: string;
};

/** Loads section video only when near the viewport (saves ~2 MB on initial home load). */
export function LazySectionVideo({ src, className }: LazySectionVideoProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setActive(true);
          io.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className={className}>
      {active ? (
        <video
          src={src}
          className="w-full h-full object-cover"
          playsInline
          muted
          loop
          autoPlay
          preload="none"
          aria-hidden
        />
      ) : null}
    </div>
  );
}
