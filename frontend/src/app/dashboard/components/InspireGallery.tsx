'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';

type GalleryItem = { url: string; poster: string; type: 'image' | 'video'; w: number; h: number };

const P = (seed: string, w: number, h: number): GalleryItem => ({
  url: `https://picsum.photos/seed/${seed}/${w}/${h}`,
  poster: `https://picsum.photos/seed/${seed}/${w}/${h}`,
  type: 'image',
  w,
  h,
});

const S = (url: string, poster: string, w = 960, h = 540): GalleryItem => ({
  url,
  poster: `https://picsum.photos/seed/${poster}/${w}/${h}`,
  type: 'video',
  w,
  h,
});

const COMPANY_IMAGES: GalleryItem[] = [
  P('aurora', 600, 900),
  P('canyon', 800, 520),
  S('https://storage.googleapis.com/media-session/big-buck-bunny/chapter1.mp4', 'vid1', 1280, 720),
  P('dusk', 500, 750),
  P('ember', 900, 600),
  P('forest', 480, 700),
  S('https://storage.googleapis.com/media-session/big-buck-bunny/chapter2.mp4', 'vid2', 1280, 720),
  P('glacier', 700, 480),
  P('harbor', 600, 600),
  P('iris', 420, 680),
  S('https://storage.googleapis.com/media-session/big-buck-bunny/chapter3.mp4', 'vid3', 1280, 720),
  P('jungle', 850, 560),
  P('kestrel', 560, 840),
  S('https://storage.googleapis.com/web-dev-assets/video-and-source-tags/chrome.mp4', 'vid4', 800, 600),
  P('lagoon', 780, 520),
  P('mesa', 500, 760),
  P('nebula', 900, 640),
  S('https://media.w3.org/2010/05/sintel/trailer.mp4', 'vid5', 1280, 544),
  P('ocean', 640, 900),
  P('prism', 700, 700),
  S('https://media.w3.org/2010/05/bunny/trailer.mp4', 'vid6', 1280, 720),
  P('quartz', 820, 540),
  P('ravine', 480, 720),
  P('savanna', 860, 580),
  S('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', 'vid7', 1280, 720),
  P('tide', 540, 860),
  P('umbra', 760, 500),
  S('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4', 'vid8', 1280, 720),
  P('vale', 500, 740),
  P('wash', 880, 600),
  P('xenon', 460, 700),
  S('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4', 'vid9', 1280, 720),
  P('yonder', 740, 480),
  P('zenith', 580, 880),
  S('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4', 'vid10', 1280, 720),
  P('apex', 820, 560),
  P('blaze', 500, 760),
  P('cascade', 760, 520),
  S('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4', 'vid11', 1280, 720),
  P('delta', 480, 740),
  P('echo', 900, 620),
  P('fjord', 560, 840),
  S('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4', 'vid12', 1280, 720),
  P('grove', 800, 540),
  P('helix', 440, 680),
  P('indigo', 860, 580),
  S('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/VolkswagenGTIReview.mp4', 'vid13', 1280, 720),
  P('jasper', 520, 780),
  P('karma', 780, 520),
  S('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4', 'vid14', 1280, 720),
  P('lumen', 460, 700),
  P('mirage', 900, 640),
  P('nimbus', 540, 820),
  P('onyx', 820, 540),
  P('pulse', 500, 760),
  P('ridge', 860, 580),
  P('solstice', 480, 720),
  P('terrace', 760, 500),
  P('ultra', 560, 860),
  P('vortex', 820, 560),
  P('wisp', 480, 740),
  P('xylem', 900, 600),
  P('yearning', 540, 820),
  P('zeal', 780, 520),
];

function LazyInspireVideo({ item }: { item: GalleryItem }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        const on = !!entry?.isIntersecting;
        setActive(on);
        const v = videoRef.current;
        if (!v) return;
        if (on) {
          v.play().catch(() => {});
        } else {
          v.pause();
        }
      },
      { rootMargin: '120px', threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={wrapRef} style={{ aspectRatio: `${item.w}/${item.h}`, position: 'relative' }}>
      <img
        src={item.poster}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        loading="lazy"
        decoding="async"
      />
      {active ? (
        <video
          ref={videoRef}
          src={item.url}
          className="absolute inset-0 w-full h-full object-cover"
          muted
          loop
          playsInline
          preload="none"
        />
      ) : null}
    </div>
  );
}

export default function InspireGallery({ bottomBar }: { bottomBar: React.ReactNode }) {
  const { locale } = useLocale();
  const router = useRouter();

  return (
    <>
      <div className="flex-1 min-h-0 relative">
        <div className="h-full overflow-y-auto scrollbar-subtle">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-theme-border-subtle">
            <p className="text-xs text-theme-fg-muted">{t(locale, 'collections.hero')}</p>
            <button
              type="button"
              onClick={() => router.replace('/dashboard')}
              className="text-xs text-theme-fg-subtle hover:text-theme-fg transition-colors"
            >
              ✕
            </button>
          </div>
          <div className="masonry-cols" style={{ columns: 'auto 160px', gap: '2px', padding: '2px' }}>
            {COMPANY_IMAGES.map((item, i) => (
              <div
                key={i}
                className="relative group overflow-hidden bg-theme-bg-elevated"
                style={{ breakInside: 'avoid', marginBottom: '2px', display: 'block' }}
              >
                {item.type === 'video' ? (
                  <LazyInspireVideo item={item} />
                ) : (
                  <img
                    src={item.url}
                    alt=""
                    width={item.w}
                    height={item.h}
                    className="w-full block"
                    loading={i < 8 ? 'eager' : 'lazy'}
                    decoding="async"
                  />
                )}
                {item.type === 'video' && (
                  <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-black/70 text-white backdrop-blur-sm border border-white/10 pointer-events-none">
                    Video
                  </span>
                )}
                <span className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors duration-150 pointer-events-none" />
              </div>
            ))}
          </div>
        </div>
        <div
          className="absolute bottom-0 left-0 right-0 pointer-events-none"
          style={{
            height: '35%',
            background: 'linear-gradient(to bottom, transparent 0%, var(--theme-bg) 100%)',
          }}
        />
      </div>
      {bottomBar}
    </>
  );
}
