'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createAudioJob, createChat, getJob, listJobs, type Job } from '@/lib/api';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';
import { getOutputUrls } from '@/lib/jobOutput';
import { AudioPlayer } from '../components/AudioPlayer';

function jobAudioUrl(job: Job): string {
  const urls = getOutputUrls(job.output);
  return urls[0] ?? '';
}

function extractTextOutput(output: Job['output']): string {
  if (!output) return '';
  if (Array.isArray(output)) {
    return output.filter((x): x is string => typeof x === 'string').join('\n').trim();
  }
  if (typeof output === 'object' && 'output' in output) {
    const value = (output as { output?: unknown }).output;
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) return value.filter((x): x is string => typeof x === 'string').join('\n').trim();
  }
  return '';
}

export default function AudioContent() {
  const { locale } = useLocale();
  const [prompt, setPrompt] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [instrumental, setInstrumental] = useState(false);
  const [audioMode, setAudioMode] = useState<'music' | 'vocal'>('music');
  const [numVariants, setNumVariants] = useState(2);
  const [outputFormat, setOutputFormat] = useState<'mp3_standard' | 'mp3_high_quality' | 'wav_16khz' | 'wav_22khz' | 'wav_24khz' | 'wav_cd_quality'>('mp3_standard');
  const [musicLengthMs, setMusicLengthMs] = useState(10000);
  const [includeStyles, setIncludeStyles] = useState<string[]>([]);
  const [excludeStyles, setExcludeStyles] = useState<string[]>([]);
  const [customStyles, setCustomStyles] = useState<string[]>([]);
  const [styleTarget, setStyleTarget] = useState<'include' | 'exclude' | null>(null);
  const [stylePickerMode, setStylePickerMode] = useState<'menu' | 'custom' | 'library'>('menu');
  const [newStyleDraft, setNewStyleDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState('');
  const [latestAudioJobs, setLatestAudioJobs] = useState<Job[]>([]);
  const [latestLoading, setLatestLoading] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [lyricsAiOpen, setLyricsAiOpen] = useState(false);
  const [lyricsAiPrompt, setLyricsAiPrompt] = useState('');
  const [lyricsAiLanguage, setLyricsAiLanguage] = useState('English');
  const [lyricsAiLoading, setLyricsAiLoading] = useState(false);
  const [lyricsAiError, setLyricsAiError] = useState('');
  const [lyricsAiJobId, setLyricsAiJobId] = useState<string | null>(null);
  const [audioAction, setAudioAction] = useState<'generate' | 'extend' | 'remix' | 'stems'>('generate');
  const [playbackTime, setPlaybackTime] = useState(0);
  const [trackDuration, setTrackDuration] = useState(0);

  const stylePool = [
    'commercial pop',
    'energetic',
    'upbeat',
    'anthemic',
    'modern pop production',
    'synth-driven',
    'uplifting',
    'male vocals',
    'female vocals',
    'cinematic',
    'aggressive',
    'jazz',
    'acoustic',
    'slow tempo',
    'heavy metal',
    'lofi',
  ];
  const styleStorageKey = 'flipo5-audio-custom-styles-v1';
  const libraryStyles = Array.from(new Set(stylePool.map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0)));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(styleStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as string[];
      if (Array.isArray(parsed)) {
        const cleaned = parsed
          .map((s) => s.trim().toLowerCase())
          .filter((s) => s.length > 0)
          .slice(0, 40);
        setCustomStyles(cleaned);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(styleStorageKey, JSON.stringify(customStyles));
    } catch {
      // ignore
    }
  }, [customStyles]);

  const loadLatestAudio = useCallback(() => {
    setLatestLoading(true);
    listJobs()
      .then((r) => {
        const jobs = (r.jobs ?? [])
          .filter((j) => j.type === 'audio' && j.status === 'completed' && jobAudioUrl(j))
          .slice(0, 5);
        setLatestAudioJobs(jobs);
      })
      .catch(() => setLatestAudioJobs([]))
      .finally(() => setLatestLoading(false));
  }, []);

  useEffect(() => {
    loadLatestAudio();
  }, [loadLatestAudio]);

  const pollJob = useCallback((id: string) => {
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      const job = await getJob(id).catch(() => null);
      if (!job) {
        if (!cancelled) setError('Job not found');
        setLoading(false);
        return;
      }
      if (job.status === 'completed') {
        setResultUrl(jobAudioUrl(job));
        setLoading(false);
        loadLatestAudio();
        return;
      }
      if (job.status === 'failed') {
        setError(job.error ?? 'Audio generation failed');
        setLoading(false);
        return;
      }
      if (!cancelled) setTimeout(poll, 2500);
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [loadLatestAudio]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedPrompt = prompt.trim();
    const trimmedLyrics = lyrics.trim();
    setError('');
    if (!trimmedPrompt && !trimmedLyrics) {
      setError(t(locale, 'audio.promptRequired'));
      return;
    }
    if (audioAction !== 'generate' && !selectedHistoryUrl) {
      setError('Select a source track from history for extend, remix, or stems.');
      return;
    }
    setLoading(true);
    setResultUrl('');
    const composedPrompt = [
      trimmedPrompt,
      includeStyles.length ? `Include styles: ${includeStyles.join(', ')}` : '',
      excludeStyles.length ? `Exclude styles: ${excludeStyles.join(', ')}` : '',
      trimmedLyrics ? `Lyrics:\n${trimmedLyrics}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    try {
      const { job_id } = await createAudioJob({
        prompt: composedPrompt,
        instrumental,
        force_instrumental: instrumental,
        audio_mode: audioMode,
        num_variants: numVariants,
        output_format: outputFormat,
        music_length_ms: musicLengthMs,
        ...(audioAction !== 'generate' && selectedHistoryUrl
          ? { source_audio: selectedHistoryUrl, audio_action: audioAction }
          : {}),
      });
      setJobId(job_id);
      pollJob(job_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Audio generation failed');
      setLoading(false);
    }
  };

  const addStyleToTarget = (rawStyle: string) => {
    const style = rawStyle.trim().toLowerCase();
    if (!style || !styleTarget) return;
    if (styleTarget === 'include') {
      setIncludeStyles((prev) => (prev.includes(style) ? prev : [...prev, style]));
      setExcludeStyles((prev) => prev.filter((s) => s !== style));
    } else {
      setExcludeStyles((prev) => (prev.includes(style) ? prev : [...prev, style]));
      setIncludeStyles((prev) => prev.filter((s) => s !== style));
    }
  };

  const addCustomStyle = () => {
    const val = newStyleDraft.trim().toLowerCase();
    if (!val) return;
    if (!customStyles.includes(val) && !stylePool.includes(val)) {
      setCustomStyles((prev) => [...prev, val].map((s) => s.trim().toLowerCase()).slice(0, 40));
    }
    addStyleToTarget(val);
    setNewStyleDraft('');
    setStyleTarget(null);
    setStylePickerMode('menu');
  };

  const removeStyle = (style: string, target: 'include' | 'exclude') => {
    const normalized = style.trim().toLowerCase();
    if (target === 'include') {
      setIncludeStyles((prev) => prev.filter((s) => s !== normalized));
    } else {
      setExcludeStyles((prev) => prev.filter((s) => s !== normalized));
    }
  };

  const selectedHistory = latestAudioJobs.find((j) => j.id === selectedHistoryId) ?? latestAudioJobs[0] ?? null;
  const selectedHistoryUrl = selectedHistory ? jobAudioUrl(selectedHistory) : '';
  const lyricLines = useMemo(() => lyrics.split('\n').filter((l) => l.trim().length > 0), [lyrics]);
  const activeLyricLine =
    trackDuration > 0 && lyricLines.length > 0
      ? Math.min(lyricLines.length - 1, Math.floor((playbackTime / trackDuration) * lyricLines.length))
      : -1;
  const lyricsLanguageOptions = ['English', 'German', 'Romanian', 'Spanish', 'French', 'Italian'];

  const handleGenerateLyricsWithAi = async () => {
    const userIdea = lyricsAiPrompt.trim();
    if (!userIdea) {
      setLyricsAiError(t(locale, 'audio.lyricsAiPromptRequired'));
      return;
    }
    setLyricsAiError('');
    setLyricsAiLoading(true);
    try {
      const { job_id } = await createChat(
        [
          `Write original song lyrics in ${lyricsAiLanguage}.`,
          'Use sections: Intro, Verse 1, Chorus, Verse 2, Bridge, Outro.',
          'Output only final lyrics text, no explanations, no markdown.',
          `Theme and constraints: ${userIdea}`,
        ].join('\n')
      );
      setLyricsAiJobId(job_id);
    } catch (err) {
      setLyricsAiError(err instanceof Error ? err.message : t(locale, 'audio.lyricsAiFailed'));
      setLyricsAiLoading(false);
    }
  };

  useEffect(() => {
    if (!lyricsAiJobId || !lyricsAiLoading) return;
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      const job = await getJob(lyricsAiJobId).catch(() => null);
      if (!job) {
        if (!cancelled) {
          setLyricsAiError(t(locale, 'audio.lyricsAiFailed'));
          setLyricsAiLoading(false);
          setLyricsAiJobId(null);
        }
        return;
      }
      if (job.status === 'completed') {
        const generated = extractTextOutput(job.output);
        if (!generated) {
          setLyricsAiError(t(locale, 'audio.lyricsAiFailed'));
        } else {
          setLyrics(generated);
          setLyricsAiOpen(false);
          setLyricsAiPrompt('');
        }
        setLyricsAiLoading(false);
        setLyricsAiJobId(null);
        return;
      }
      if (job.status === 'failed' || job.status === 'cancelled') {
        setLyricsAiError(job.error ?? t(locale, 'audio.lyricsAiFailed'));
        setLyricsAiLoading(false);
        setLyricsAiJobId(null);
        return;
      }
      setTimeout(poll, 1800);
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [lyricsAiJobId, lyricsAiLoading, locale]);

  return (
    <div className="flex-1 h-[calc(100vh-64px)] overflow-hidden px-4 py-6">
      <div className="mx-auto w-full max-w-7xl">
        <h1 className="text-xl font-semibold text-theme-fg mb-4">{t(locale, 'audio.title')}</h1>
        <div className="grid h-full grid-cols-1 xl:grid-cols-[1fr,320px] gap-5">
          <div className="h-full min-h-0 rounded-2xl border border-theme-border bg-theme-bg-subtle p-4 md:p-5 overflow-y-auto scrollbar-subtle">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {(['generate', 'extend', 'remix', 'stems'] as const).map((action) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => setAudioAction(action)}
                    className={`btn-tap px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      audioAction === action
                        ? 'border-theme-accent bg-theme-accent/15 text-theme-accent'
                        : 'border-theme-border bg-theme-bg text-theme-fg-muted hover:text-theme-fg'
                    }`}
                  >
                    {action === 'generate' ? 'Generate' : action === 'extend' ? 'Extend' : action === 'remix' ? 'Remix' : 'Stems'}
                  </button>
                ))}
              </div>
              {audioAction !== 'generate' && (
                <p className="text-xs text-theme-fg-muted">
                  Source: {selectedHistoryUrl ? 'track from history' : 'pick a track in the sidebar →'}
                </p>
              )}
              <div>
                <p className="text-xs uppercase tracking-wider text-theme-fg-subtle mb-2">{t(locale, 'audio.includeStyles')}</p>
                <div className="flex flex-wrap gap-2">
                  {includeStyles.map((style) => (
                    <div key={`inc-${style}`} className="group inline-flex items-center gap-1">
                      <span className="px-3 py-1.5 rounded-full text-xs border border-theme-accent bg-theme-accent/15 text-theme-accent">
                        {style}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeStyle(style, 'include')}
                        className="text-[10px] opacity-0 pointer-events-none group-hover:opacity-80 group-hover:pointer-events-auto hover:opacity-100 transition-opacity"
                        title={t(locale, 'audio.removeStyle')}
                      >
                        x
                      </button>
                    </div>
                  ))}
                  {styleTarget === 'include' ? (
                    <>
                      {stylePickerMode === 'menu' && (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setStylePickerMode('custom')}
                            className="px-3 py-1.5 rounded-full text-xs border border-theme-border bg-theme-bg text-theme-fg-muted hover:text-theme-fg hover:bg-theme-bg-hover transition-colors"
                          >
                            {t(locale, 'audio.custom')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setStylePickerMode('library')}
                            className="px-3 py-1.5 rounded-full text-xs border border-theme-border bg-theme-bg text-theme-fg-muted hover:text-theme-fg hover:bg-theme-bg-hover transition-colors"
                          >
                            {t(locale, 'audio.library')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setStyleTarget(null)}
                            className="px-2 py-1 rounded-full text-xs text-theme-fg-subtle hover:text-theme-fg"
                          >
                            x
                          </button>
                        </div>
                      )}
                      {stylePickerMode === 'custom' && (
                        <div className="inline-flex items-center gap-1">
                          <input
                            autoFocus
                            value={newStyleDraft}
                            onChange={(e) => setNewStyleDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addCustomStyle();
                              } else if (e.key === 'Escape') {
                                setStyleTarget(null);
                                setStylePickerMode('menu');
                                setNewStyleDraft('');
                              }
                            }}
                            placeholder={t(locale, 'audio.newStyle')}
                            className="w-36 px-3 py-1.5 rounded-full text-xs border border-theme-border bg-theme-bg text-theme-fg focus:outline-none focus:border-theme-border-hover"
                            disabled={loading}
                          />
                          <button
                            type="button"
                            onClick={addCustomStyle}
                            className="px-2 py-1 rounded-full text-xs border border-theme-border bg-theme-bg-hover text-theme-fg hover:bg-theme-bg"
                            disabled={loading || !newStyleDraft.trim()}
                          >
                            +
                          </button>
                        </div>
                      )}
                      {stylePickerMode === 'library' &&
                        libraryStyles.map((style) => (
                          <button
                            key={`lib-include-${style}`}
                            type="button"
                            onClick={() => {
                              addStyleToTarget(style);
                              setStyleTarget(null);
                              setStylePickerMode('menu');
                            }}
                            className="px-3 py-1.5 rounded-full text-xs border border-theme-border bg-theme-bg text-theme-fg-muted hover:text-theme-fg hover:bg-theme-bg-hover transition-colors"
                          >
                            {style}
                          </button>
                        ))}
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setStyleTarget('include');
                        setStylePickerMode('menu');
                      }}
                      className="px-3 py-1.5 rounded-full text-xs border border-dashed border-theme-border bg-theme-bg text-theme-fg-muted hover:text-theme-fg hover:bg-theme-bg-hover transition-colors"
                    >
                      + {t(locale, 'audio.newStyle')}
                    </button>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wider text-theme-fg-subtle mb-2">{t(locale, 'audio.excludeStyles')}</p>
                <div className="flex flex-wrap gap-2">
                  {excludeStyles.map((style) => (
                    <div key={`exc-${style}`} className="group inline-flex items-center gap-1">
                      <span className="px-3 py-1.5 rounded-full text-xs border border-theme-danger bg-theme-danger-muted text-theme-danger">
                        {style}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeStyle(style, 'exclude')}
                        className="text-[10px] opacity-0 pointer-events-none group-hover:opacity-80 group-hover:pointer-events-auto hover:opacity-100 transition-opacity"
                        title={t(locale, 'audio.removeStyle')}
                      >
                        x
                      </button>
                    </div>
                  ))}
                  {styleTarget === 'exclude' ? (
                    <>
                      {stylePickerMode === 'menu' && (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setStylePickerMode('custom')}
                            className="px-3 py-1.5 rounded-full text-xs border border-theme-border bg-theme-bg text-theme-fg-muted hover:text-theme-fg hover:bg-theme-bg-hover transition-colors"
                          >
                            {t(locale, 'audio.custom')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setStylePickerMode('library')}
                            className="px-3 py-1.5 rounded-full text-xs border border-theme-border bg-theme-bg text-theme-fg-muted hover:text-theme-fg hover:bg-theme-bg-hover transition-colors"
                          >
                            {t(locale, 'audio.library')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setStyleTarget(null)}
                            className="px-2 py-1 rounded-full text-xs text-theme-fg-subtle hover:text-theme-fg"
                          >
                            x
                          </button>
                        </div>
                      )}
                      {stylePickerMode === 'custom' && (
                        <div className="inline-flex items-center gap-1">
                          <input
                            autoFocus
                            value={newStyleDraft}
                            onChange={(e) => setNewStyleDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addCustomStyle();
                              } else if (e.key === 'Escape') {
                                setStyleTarget(null);
                                setStylePickerMode('menu');
                                setNewStyleDraft('');
                              }
                            }}
                            placeholder={t(locale, 'audio.newStyle')}
                            className="w-36 px-3 py-1.5 rounded-full text-xs border border-theme-border bg-theme-bg text-theme-fg focus:outline-none focus:border-theme-border-hover"
                            disabled={loading}
                          />
                          <button
                            type="button"
                            onClick={addCustomStyle}
                            className="px-2 py-1 rounded-full text-xs border border-theme-border bg-theme-bg-hover text-theme-fg hover:bg-theme-bg"
                            disabled={loading || !newStyleDraft.trim()}
                          >
                            +
                          </button>
                        </div>
                      )}
                      {stylePickerMode === 'library' &&
                        libraryStyles.map((style) => (
                          <button
                            key={`lib-exclude-${style}`}
                            type="button"
                            onClick={() => {
                              addStyleToTarget(style);
                              setStyleTarget(null);
                              setStylePickerMode('menu');
                            }}
                            className="px-3 py-1.5 rounded-full text-xs border border-theme-border bg-theme-bg text-theme-fg-muted hover:text-theme-fg hover:bg-theme-bg-hover transition-colors"
                          >
                            {style}
                          </button>
                        ))}
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setStyleTarget('exclude');
                        setStylePickerMode('menu');
                      }}
                      className="px-3 py-1.5 rounded-full text-xs border border-dashed border-theme-border bg-theme-bg text-theme-fg-muted hover:text-theme-fg hover:bg-theme-bg-hover transition-colors"
                    >
                      + {t(locale, 'audio.newStyle')}
                    </button>
                  )}
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label className="block text-sm font-medium text-theme-fg-muted">{t(locale, 'audio.compositionPlan')}</label>
                  <button
                    type="button"
                    onClick={() => {
                      setLyricsAiError('');
                      setLyricsAiPrompt((prev) => (prev.trim() ? prev : lyrics.trim()));
                      setLyricsAiOpen(true);
                    }}
                    className="btn-tap px-3 py-1.5 rounded-lg text-xs font-medium border border-theme-border-hover bg-theme-bg-hover text-theme-fg hover:bg-theme-bg-hover-strong transition-colors"
                    disabled={loading}
                  >
                    {t(locale, 'audio.lyricsAiButton')}
                  </button>
                </div>
                <textarea
                  value={lyrics}
                  onChange={(e) => setLyrics(e.target.value)}
                  placeholder={t(locale, 'audio.lyricsPlaceholder')}
                  rows={10}
                  className="w-full rounded-xl border border-theme-border bg-theme-bg px-3 py-2.5 text-sm text-theme-fg placeholder:text-theme-fg-subtle focus:outline-none focus:border-theme-border-hover resize-y min-h-[160px]"
                  disabled={loading}
                />
                {lyricLines.length > 0 && (
                  <div className="mt-2 space-y-1 rounded-lg border border-theme-border bg-theme-bg p-2 max-h-36 overflow-y-auto scrollbar-subtle">
                    {lyricLines.map((line, i) => (
                      <p
                        key={`${i}-${line.slice(0, 24)}`}
                        className={`text-xs transition-colors ${i === activeLyricLine ? 'text-theme-accent font-semibold' : 'text-theme-fg-muted'}`}
                      >
                        {line}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-theme-border bg-theme-bg p-3 md:p-4">
                <label className="block text-sm font-medium text-theme-fg-muted mb-2">{t(locale, 'audio.prompt')}</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={t(locale, 'audio.promptPlaceholder')}
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-xl border border-theme-border bg-theme-bg-elevated text-theme-fg placeholder:text-theme-fg-subtle text-sm focus:outline-none focus:border-theme-border-hover resize-none"
                  disabled={loading}
                />
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-2 text-sm text-theme-fg-muted">
                    <span>{t(locale, 'audio.mode')}</span>
                    <select
                      value={audioMode}
                      onChange={(e) => setAudioMode((e.target.value === 'vocal' ? 'vocal' : 'music'))}
                      className="select-theme px-3 py-2 rounded-lg border border-theme-border bg-theme-bg text-theme-fg text-sm focus:outline-none focus:border-theme-border-hover"
                      disabled={loading}
                    >
                      <option value="music">{t(locale, 'audio.modeMusic')}</option>
                      <option value="vocal">{t(locale, 'audio.modeVocal')}</option>
                    </select>
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-theme-fg-muted">
                    <span>{t(locale, 'audio.variants')}</span>
                    <select
                      value={numVariants}
                      onChange={(e) => setNumVariants(Math.min(4, Math.max(1, Number(e.target.value) || 1)))}
                      className="select-theme px-3 py-2 rounded-lg border border-theme-border bg-theme-bg text-theme-fg text-sm focus:outline-none focus:border-theme-border-hover"
                      disabled={loading}
                    >
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                      <option value={4}>4</option>
                    </select>
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-theme-fg-muted">
                    <span>{t(locale, 'audio.length')}</span>
                    <select
                      value={musicLengthMs}
                      onChange={(e) => setMusicLengthMs(Math.min(300000, Math.max(5000, Number(e.target.value) || 10000)))}
                      className="select-theme px-3 py-2 rounded-lg border border-theme-border bg-theme-bg text-theme-fg text-sm focus:outline-none focus:border-theme-border-hover"
                      disabled={loading}
                    >
                      <option value={10000}>10s</option>
                      <option value={15000}>15s</option>
                      <option value={20000}>20s</option>
                      <option value={30000}>30s</option>
                      <option value={45000}>45s</option>
                      <option value={60000}>60s</option>
                      <option value={90000}>90s</option>
                      <option value={120000}>120s</option>
                      <option value={180000}>180s</option>
                      <option value={240000}>240s</option>
                      <option value={300000}>300s</option>
                    </select>
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-theme-fg-muted">
                    <span>{t(locale, 'audio.format')}</span>
                    <select
                      value={outputFormat}
                      onChange={(e) => setOutputFormat(e.target.value as typeof outputFormat)}
                      className="select-theme px-3 py-2 rounded-lg border border-theme-border bg-theme-bg text-theme-fg text-sm focus:outline-none focus:border-theme-border-hover"
                      disabled={loading}
                    >
                      <option value="mp3_standard">mp3 standard</option>
                      <option value="mp3_high_quality">mp3 high</option>
                      <option value="wav_16khz">wav 16k</option>
                      <option value="wav_22khz">wav 22k</option>
                      <option value="wav_24khz">wav 24k</option>
                      <option value="wav_cd_quality">wav cd</option>
                    </select>
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-theme-fg-muted">
                    <input
                      type="checkbox"
                      checked={instrumental}
                      onChange={(e) => setInstrumental(e.target.checked)}
                      className="rounded border-theme-border bg-theme-bg"
                      style={{ accentColor: 'var(--theme-scrollbar-thumb)' }}
                      disabled={loading || audioMode === 'vocal'}
                    />
                    <span>{t(locale, 'audio.instrumental')}</span>
                  </label>
                  <button
                    type="submit"
                    disabled={loading || (!prompt.trim() && !lyrics.trim())}
                    className="btn-tap ml-auto px-5 py-2.5 rounded-xl bg-theme-accent text-theme-fg-inverse font-medium text-sm disabled:opacity-50 flex items-center gap-2"
                  >
                    {loading && <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin shrink-0" />}
                    {t(locale, 'audio.create')}
                  </button>
                </div>
              </div>

              {error && <p className="text-sm text-theme-danger">{error}</p>}
            </form>

            {lyricsAiOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !lyricsAiLoading && setLyricsAiOpen(false)}>
                <div
                  className="w-full max-w-md rounded-2xl border border-theme-border-hover bg-theme-bg p-5 shadow-2xl ring-1 ring-white/15 text-left"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 className="text-sm font-semibold text-theme-fg mb-3">{t(locale, 'audio.lyricsAiTitle')}</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-theme-fg-muted mb-1">{t(locale, 'audio.lyricsAiLanguage')}</label>
                      <select
                        value={lyricsAiLanguage}
                        onChange={(e) => setLyricsAiLanguage(e.target.value)}
                        className="w-full rounded-xl border border-theme-border bg-theme-bg text-theme-fg text-sm px-3 py-2.5 focus:outline-none focus:border-theme-border-hover"
                        disabled={lyricsAiLoading}
                      >
                        {lyricsLanguageOptions.map((lang) => (
                          <option key={lang} value={lang}>{lang}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-theme-fg-muted mb-1">{t(locale, 'audio.lyricsAiPromptLabel')}</label>
                      <textarea
                        value={lyricsAiPrompt}
                        onChange={(e) => setLyricsAiPrompt(e.target.value)}
                        placeholder={t(locale, 'audio.lyricsAiPromptPlaceholder')}
                        rows={4}
                        className="w-full rounded-xl border border-theme-border bg-theme-bg text-theme-fg text-sm px-3 py-2.5 focus:outline-none focus:border-theme-border-hover resize-none"
                        disabled={lyricsAiLoading}
                      />
                    </div>
                  </div>
                  {lyricsAiError && <p className="mt-2 text-sm text-theme-danger">{lyricsAiError}</p>}
                  <div className="mt-4 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setLyricsAiOpen(false)}
                      className="btn-tap px-3 py-2 rounded-xl border border-theme-border text-theme-fg text-sm"
                      disabled={lyricsAiLoading}
                    >
                      {t(locale, 'common.cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={handleGenerateLyricsWithAi}
                      className="btn-tap px-4 py-2 rounded-xl border border-theme-border-hover bg-theme-bg-hover text-theme-fg text-sm font-medium disabled:opacity-50"
                      disabled={lyricsAiLoading || !lyricsAiPrompt.trim()}
                    >
                      {lyricsAiLoading ? t(locale, 'common.loading') : t(locale, 'audio.lyricsAiGenerate')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {(resultUrl || selectedHistoryUrl) && (
              <div className="mt-5 rounded-xl border border-theme-border bg-theme-bg p-3">
                <p className="text-sm font-medium text-theme-fg mb-2">{t(locale, 'audio.latestResult')}</p>
                <AudioPlayer
                  src={resultUrl || selectedHistoryUrl}
                  onTimeUpdate={setPlaybackTime}
                  onDurationChange={setTrackDuration}
                />
                {jobId && <p className="mt-2 text-xs text-theme-fg-subtle">Job: {jobId}</p>}
              </div>
            )}
          </div>

          <aside className="h-full min-h-0 flex flex-col">
            <h2 className="text-sm font-semibold text-theme-fg mb-3">{t(locale, 'audio.latestTracks')}</h2>
            {latestLoading ? (
              <p className="text-sm text-theme-fg-subtle animate-pulse-subtle">{t(locale, 'common.loading')}</p>
            ) : latestAudioJobs.length === 0 ? (
              <p className="text-sm text-theme-fg-subtle">{t(locale, 'audio.noTracksYet')}</p>
            ) : (
              <ul className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-2 scrollbar-subtle">
                {latestAudioJobs.map((job, index) => {
                  const url = jobAudioUrl(job);
                  const active = (selectedHistory?.id ?? latestAudioJobs[0]?.id) === job.id;
                  return (
                    <li key={job.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedHistoryId(job.id)}
                        className={`w-full text-left rounded-xl px-2 py-2 transition-colors ${
                          active
                            ? 'bg-theme-accent/10'
                            : 'bg-transparent hover:bg-theme-bg-hover/40'
                        }`}
                      >
                        <p className="text-xs text-theme-fg-subtle mb-1">
                          {t(locale, 'audio.variation')} {index + 1}
                        </p>
                        <p className="text-sm text-theme-fg truncate mb-2">{(job.input as { prompt?: string })?.prompt || 'Audio track'}</p>
                        {url ? <AudioPlayer src={url} /> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
