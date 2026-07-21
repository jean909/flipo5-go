'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion';

const HERO_VIDEO = '/home/herosection.mp4';
const HERO_POSTER = '/home/herosection-poster.jpg';

function brandMaskUrl() {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">` +
    `<rect width="1600" height="900" fill="white"/>` +
    `<text x="800" y="470" text-anchor="middle" dominant-baseline="middle" ` +
    `font-family="Syne, Arial Black, Impact, sans-serif" font-weight="800" font-size="280" ` +
    `letter-spacing="-18" fill="black">FLIPO5</text>` +
    `</svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

/**
 * Full-bleed hero: live video punched through FLIPO5.
 * Entrance scales the cutout open; scroll drifts the plate; cursor light follows.
 */
export function CinematicHeroBrand() {
  const rootRef = useRef<HTMLDivElement>(null);
  const spotRef = useRef<HTMLDivElement>(null);
  const [showVideo, setShowVideo] = useState(false);
  const reduced = useReducedMotion();
  const mask = useMemo(() => brandMaskUrl(), []);

  const { scrollYProgress } = useScroll({
    target: rootRef,
    offset: ['start start', 'end start'],
  });
  const driftY = useSpring(useTransform(scrollYProgress, [0, 1], [0, 120]), {
    stiffness: 80,
    damping: 28,
    mass: 0.6,
  });
  const plateScale = useSpring(useTransform(scrollYProgress, [0, 1], [1, 1.08]), {
    stiffness: 70,
    damping: 30,
  });
  const plateOpacity = useTransform(scrollYProgress, [0, 0.85], [1, 0.35]);

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
    let ty = 42;
    let cx = 50;
    let cy = 42;

    const onMove = (e: PointerEvent) => {
      const r = root.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width) * 100;
      ty = ((e.clientY - r.top) / r.height) * 100;
    };

    const tick = () => {
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      spot.style.background = `radial-gradient(ellipse 52% 44% at ${cx}% ${cy}%, rgba(255,255,255,0.32) 0%, rgba(255,255,255,0.1) 28%, transparent 65%)`;
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
    <motion.div
      ref={rootRef}
      className="absolute inset-0 overflow-hidden bg-black"
      aria-hidden
      style={{ opacity: plateOpacity }}
    >
      <motion.div className="absolute inset-0" style={{ y: reduced ? 0 : driftY, scale: reduced ? 1 : plateScale }}>
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
      </motion.div>

      <div ref={spotRef} className="absolute inset-0 pointer-events-none mix-blend-soft-light opacity-95" />

      {/* Mask plate opens with a soft scale (brand cutout “reveals”) */}
      <motion.div
        className="absolute inset-0 bg-black origin-center"
        initial={reduced ? false : { scale: 1.18, opacity: 0.2 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.45, ease: [0.16, 1, 0.3, 1] }}
        style={{
          WebkitMaskImage: mask,
          maskImage: mask,
          WebkitMaskSize: 'cover',
          maskSize: 'cover',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
        }}
      />

      <motion.div
        className="absolute inset-0 flex items-center justify-center pointer-events-none px-4"
        initial={reduced ? false : { opacity: 0, scale: 1.06 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.2, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
      >
        <span
          className="font-display font-extrabold tracking-[-0.07em] text-[clamp(4.5rem,18vw,14rem)] leading-none text-transparent select-none animate-home-stroke-pulse"
          style={{ WebkitTextStroke: '1px rgba(255,255,255,0.22)' }}
        >
          FLIPO5
        </span>
      </motion.div>

      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_65%_50%_at_50%_46%,transparent_15%,rgba(0,0,0,0.65)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-[42%] pointer-events-none bg-gradient-to-t from-black via-black/70 to-transparent" />
      <div className="absolute inset-x-0 top-0 h-28 pointer-events-none bg-gradient-to-b from-black/80 to-transparent" />
      <div className="absolute inset-0 pointer-events-none opacity-[0.08] mix-blend-overlay home-film-grain" />
    </motion.div>
  );
}
