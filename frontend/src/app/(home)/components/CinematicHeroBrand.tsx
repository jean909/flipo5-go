'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion';

const HERO_VIDEO = '/home/herosection.mp4';
const HERO_POSTER = '/home/herosection-poster.jpg';

/**
 * Full-bleed herosection video — always visible.
 * FLIPO5 sits as a hero wordmark on top of the footage (optical center).
 */
export function CinematicHeroBrand() {
  const rootRef = useRef<HTMLDivElement>(null);
  const spotRef = useRef<HTMLDivElement>(null);
  const [showVideo, setShowVideo] = useState(false);
  const reduced = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: rootRef,
    offset: ['start start', 'end start'],
  });
  const driftY = useSpring(useTransform(scrollYProgress, [0, 1], [0, 80]), {
    stiffness: 80,
    damping: 28,
    mass: 0.6,
  });
  const plateScale = useSpring(useTransform(scrollYProgress, [0, 1], [1, 1.05]), {
    stiffness: 70,
    damping: 30,
  });

  useEffect(() => {
    let cancelled = false;
    const start = () => {
      if (!cancelled) setShowVideo(true);
    };
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(start, { timeout: 900 });
      return () => {
        cancelled = true;
        cancelIdleCallback(id);
      };
    }
    const t = setTimeout(start, 60);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    if (reduced) return;
    const root = rootRef.current;
    const spot = spotRef.current;
    if (!root || !spot) return;

    let raf = 0;
    let tx = 50;
    let ty = 40;
    let cx = 50;
    let cy = 40;

    const onMove = (e: PointerEvent) => {
      const r = root.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width) * 100;
      ty = ((e.clientY - r.top) / r.height) * 100;
    };

    const tick = () => {
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      spot.style.background = `radial-gradient(ellipse 55% 45% at ${cx}% ${cy}%, rgba(255,255,255,0.18) 0%, transparent 60%)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    root.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      root.removeEventListener('pointermove', onMove);
    };
  }, [reduced]);

  return (
    <div ref={rootRef} className="absolute inset-0 overflow-hidden bg-black" aria-hidden>
      <motion.div
        className="absolute inset-0"
        style={{ y: reduced ? 0 : driftY, scale: reduced ? 1 : plateScale }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={HERO_POSTER}
          alt=""
          width={1280}
          height={720}
          decoding="async"
          fetchPriority="high"
          className={`absolute inset-0 w-full h-full object-cover object-center scale-105 transition-opacity duration-1000 ${showVideo ? 'opacity-0' : 'opacity-100'}`}
        />
        {showVideo ? (
          <video
            src={HERO_VIDEO}
            poster={HERO_POSTER}
            className="absolute inset-0 w-full h-full object-cover object-center scale-105 animate-home-kenburns"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          />
        ) : null}
      </motion.div>

      <div ref={spotRef} className="absolute inset-0 pointer-events-none mix-blend-soft-light" />

      {/* Readability — keep video visible */}
      <div className="absolute inset-0 bg-black/35 pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_70%_55%_at_50%_40%,transparent_25%,rgba(0,0,0,0.55)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-[50%] pointer-events-none bg-gradient-to-t from-black via-black/60 to-transparent" />
      <div className="absolute inset-x-0 top-0 h-28 pointer-events-none bg-gradient-to-b from-black/70 to-transparent" />

      {/* Brand wordmark — optical center, above CTA */}
      <motion.div
        className="absolute left-0 right-0 top-[36%] sm:top-[34%] lg:top-[36%] -translate-y-1/2 flex justify-center px-3 sm:px-6 pointer-events-none z-[1]"
        initial={reduced ? false : { opacity: 0, y: 28, scale: 1.06 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 1.15, ease: [0.16, 1, 0.3, 1] }}
      >
        <span
          className="font-display font-extrabold tracking-[-0.07em] text-[clamp(3.75rem,15vw,12.5rem)] leading-none text-white select-none whitespace-nowrap"
          style={{ textShadow: '0 2px 40px rgba(0,0,0,0.45)' }}
        >
          FLIPO5
        </span>
      </motion.div>

      <div className="absolute inset-0 pointer-events-none opacity-[0.06] mix-blend-overlay home-film-grain" />
    </div>
  );
}
