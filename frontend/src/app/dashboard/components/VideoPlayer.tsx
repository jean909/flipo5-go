'use client';

import { useRef, useState, useEffect } from 'react';

export function VideoPlayer({ src, className = '', autoPlay }: { src: string; className?: string; autoPlay?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = pct * v.duration;
    setCurrentTime(v.currentTime);
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const toggleFullscreen = () => {
    const wrap = videoRef.current?.parentElement;
    if (!wrap) return;
    if (!document.fullscreenElement) {
      wrap.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
  };

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
  }, [muted]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !autoPlay) return;
    v.muted = true;
    setMuted(true);
    v.play().catch(() => {});
  }, [autoPlay, src]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTimeUpdate = () => setCurrentTime(v.currentTime);
    const onDurationChange = () => setDuration(v.duration);
    const onEnded = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener('timeupdate', onTimeUpdate);
    v.addEventListener('durationchange', onDurationChange);
    v.addEventListener('ended', onEnded);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    return () => {
      v.removeEventListener('timeupdate', onTimeUpdate);
      v.removeEventListener('durationchange', onDurationChange);
      v.removeEventListener('ended', onEnded);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={`relative group rounded-xl overflow-hidden bg-black ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setShowControls(false)}
    >
      <video
        ref={videoRef}
        src={src}
        className="w-full aspect-video object-contain"
        playsInline
        onClick={togglePlay}
        muted={muted}
        onVolumeChange={(e) => {
          const v = e.currentTarget;
          setVolume(v.volume);
          setMuted(v.muted);
        }}
      />
      <div
        className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent pt-12 pb-2 px-3 transition-opacity duration-200 ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div
          className="h-1 rounded-full bg-white/30 cursor-pointer hover:bg-white/40 transition-colors mb-2"
          onClick={seek}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-theme-accent transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={togglePlay}
            className="p-1.5 rounded-full text-white hover:bg-white/20 transition-colors"
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? (
              <PauseIcon className="w-5 h-5" />
            ) : (
              <PlayIcon className="w-5 h-5" />
            )}
          </button>
          <span className="text-xs text-white/90 tabular-nums min-w-[45px]">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          <button
            type="button"
            onClick={toggleMute}
            className="p-1.5 rounded-full text-white hover:bg-white/20 transition-colors ml-auto"
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            {muted || volume === 0 ? (
              <MuteIcon className="w-5 h-5" />
            ) : (
              <VolumeIcon className="w-5 h-5" />
            )}
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-1.5 rounded-full text-white hover:bg-white/20 transition-colors"
            aria-label="Fullscreen"
          >
            <FullscreenIcon className="w-5 h-5" />
          </button>
        </div>
      </div>
      {!playing && (
        <button
          type="button"
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors"
          aria-label="Play"
        >
          <span className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg hover:bg-white transition-colors">
            <PlayIcon className="w-7 h-7 text-black ml-1" />
          </span>
        </button>
      )}
    </div>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function PauseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );
}
function VolumeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    </svg>
  );
}
function MuteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
    </svg>
  );
}
function FullscreenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
    </svg>
  );
}
