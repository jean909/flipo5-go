'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export function AudioPlayer({ src, className = '', onTimeUpdate, onDurationChange }: { src: string; className?: string; onTimeUpdate?: (time: number) => void; onDurationChange?: (duration: number) => void }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  const progressPct = useMemo(() => (duration > 0 ? (currentTime / duration) * 100 : 0), [currentTime, duration]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdateEvt = () => {
      const t = audio.currentTime || 0;
      setCurrentTime(t);
      onTimeUpdate?.(t);
    };
    const onDuration = () => {
      const d = audio.duration || 0;
      setDuration(d);
      onDurationChange?.(d);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onVolume = () => {
      setVolume(audio.volume);
      setMuted(audio.muted);
    };
    const onEnded = () => setPlaying(false);
    audio.addEventListener('timeupdate', onTimeUpdateEvt);
    audio.addEventListener('durationchange', onDuration);
    audio.addEventListener('loadedmetadata', onDuration);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('volumechange', onVolume);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdateEvt);
      audio.removeEventListener('durationchange', onDuration);
      audio.removeEventListener('loadedmetadata', onDuration);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('volumechange', onVolume);
      audio.removeEventListener('ended', onEnded);
    };
  }, [onTimeUpdate, onDurationChange]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.src !== src) {
      audio.src = src;
      audio.load();
      setPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    }
  }, [src]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  };

  const seekTo = (nextPct: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const pct = Math.max(0, Math.min(1, nextPct));
    audio.currentTime = pct * audio.duration;
    setCurrentTime(audio.currentTime);
  };

  const setVolumePct = (nextPct: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const pct = Math.max(0, Math.min(1, nextPct));
    audio.volume = pct;
    audio.muted = pct === 0;
    setVolume(pct);
    setMuted(audio.muted);
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    setMuted(audio.muted);
  };

  const formatTime = (secs: number) => {
    if (!Number.isFinite(secs) || secs < 0) return '0:00';
    const total = Math.floor(secs);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`rounded-xl border border-theme-border-subtle bg-theme-bg/70 backdrop-blur-sm px-3 py-2 ${className}`}>
      <audio ref={audioRef} preload="metadata" className="hidden" />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={togglePlay}
          className="btn-tap inline-flex h-8 w-8 items-center justify-center rounded-full border border-theme-border bg-theme-bg-elevated text-theme-fg hover:bg-theme-bg-hover transition-colors"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? 'II' : '>'}
        </button>
        <div className="flex-1">
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(progressPct * 10)}
            onChange={(e) => seekTo(Number(e.target.value) / 1000)}
            className="w-full accent-theme-fg-muted"
          />
          <div className="mt-0.5 flex items-center justify-between text-[11px] text-theme-fg-subtle tabular-nums">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={toggleMute}
          className="btn-tap inline-flex h-8 w-8 items-center justify-center rounded-md border border-theme-border-subtle text-theme-fg-subtle hover:text-theme-fg hover:bg-theme-bg-hover transition-colors"
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted || volume === 0 ? 'x' : 'o'}
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round((muted ? 0 : volume) * 100)}
          onChange={(e) => setVolumePct(Number(e.target.value) / 100)}
          className="w-16 accent-theme-fg-muted"
          aria-label="Volume"
        />
      </div>
    </div>
  );
}
