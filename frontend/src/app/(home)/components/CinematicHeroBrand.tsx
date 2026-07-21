'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion';

const HERO_VIDEO = '/home/herosection.mp4';
const HERO_POSTER = '/home/herosection-poster.jpg';

/**
 * Full-bleed hero: video punched through FLIPO5 via mix-blend destination-out.
 * Brand sits at optical center (~38% from top), above the CTA stack — not dead-center.
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
  const driftY = useSpring(useTransform(scrollYProgress, [0, 1], [0, 90]), {
    stiffness: 80,
    damping: 28,
    mass: 0.6,
  });
  const plateScale = useSpring(useTransform(scrollYProgress, [0, 1], [1, 1.06]), {
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
    let ty = 38;
    let cx = 50;
    let cy = 38;

    const onMove = (e: PointerEvent) => {
      const r = root.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width) * 100;
      ty = ((e.clientY - r.top) / r.height) * 100;
    };

    const tick = () => {
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      spot.style.background = `radial-gradient(ellipse 52% 44% at ${cx}% ${cy}%, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.08) 30%, transparent 65%)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    root.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      root.removeEventListener('pointermove', onMove);
    };
  }, [reduced]);

  const brandClass =
    'font-display font-extrabold tracking-[-0.07em] text-[clamp(3.75rem,15vw,12.5rem)] leading-none select-none whitespace-nowrap';

  return (
    <div ref={rootRef} className="absolute inset-0 overflow-hidden bg-black isolate" aria-hidden>
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
          className={`absolute inset-0 w-full h-full object-cover object-center scale-110 transition-opacity duration-1000 ${showVideo ? 'opacity-0' : 'opacity-100'}`}
        />
        {showVideo ? (
          <video
            src={HERO_VIDEO}
            poster={HERO_POSTER}
            className="absolute inset-0 w-full h-full object-cover object-center scale-110 animate-home-kenburns"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          />
        ) : null}
        <div ref={spotRef} className="absolute inset-0 pointer-events-none mix-blend-soft-light opacity-95" />
      </motion.div>

      {/* Black plate — FLIPO5 punches through to video (same element = perfect alignment) */}
      <div className="absolute inset-0 bg-black">
        <motion.div
          className="absolute left-0 right-0 top-[38%] sm:top-[36%] lg:top-[38%] -translate-y-1/2 flex justify-center px-3 sm:px-6"
          initial={reduced ? false : { opacity: 0, scale: 1.12, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 1.25, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className={`${brandClass} text-white mix-blend-destination-out`}>FLIPO5</span>
        </motion.div>
      </div>

      {/* Hairline outline — same anchor as the cutout */}
      <motion.div
        className="absolute left-0 right-0 top-[38%] sm:top-[36%] lg:top-[38%] -translate-y-1/2 flex justify-center px-3 sm:px-6 pointer-events-none"
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.35 }}
      >
        <span
          className={`${brandClass} text-transparent animate-home-stroke-pulse`}
          style={{ WebkitTextStroke: '1px rgba(255,255,255,0.2)' }}
        >
          FLIPO5
        </span>
      </motion.div>

      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_70%_55%_at_50%_38%,transparent_18%,rgba(0,0,0,0.55)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-[48%] pointer-events-none bg-gradient-to-t from-black via-black/75 to-transparent" />
      <div className="absolute inset-x-0 top-0 h-24 pointer-events-none bg-gradient-to-b from-black/75 to-transparent" />
      <div className="absolute inset-0 pointer-events-none opacity-[0.07] mix-blend-overlay home-film-grain" />
    </div>
  );
}
