'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';
import { listJobs, getJob, getToken, type Job } from '@/lib/api';
import { getOutputUrls } from '@/lib/jobOutput';
import { useJobsInProgress } from './JobsInProgressContext';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { motion, AnimatePresence } from 'framer-motion';

/** Play a subtle click sound when opening the dropdown */
function playDropDownSound() {
  if (typeof window === 'undefined') return;
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 600;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.08);
  } catch {
    // ignore
  }
}

/** Play completion sound when job finishes */
function playCompletionSound() {
  if (typeof window === 'undefined') return;
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  } catch {
    // ignore
  }
}

type CompletedToast = { id: string; type: 'image' | 'video'; threadId: string | null; durationSec: number; imageUrl?: string };
type FailedToast = { id: string; type: 'image' | 'video'; error: string; threadId: string | null };

// localStorage key for dismissed failed job IDs
const DISMISSED_FAILED_KEY = 'flipo5_dismissed_failed_jobs';

// Get dismissed failed job IDs from localStorage
function getDismissedFailedIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const stored = localStorage.getItem(DISMISSED_FAILED_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

// Save dismissed failed job IDs to localStorage
function saveDismissedFailedIds(ids: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DISMISSED_FAILED_KEY, JSON.stringify([...ids]));
  } catch {}
}

// Clean up old dismissed IDs (older than 7 days) to prevent localStorage bloat
function cleanupDismissedFailedIds() {
  if (typeof window === 'undefined') return new Set<string>();
  try {
    const stored = localStorage.getItem(DISMISSED_FAILED_KEY);
    if (!stored) return new Set();
    
    const ids = JSON.parse(stored) as string[];
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000; // 7 days
    
    // Keep only recent dismissed IDs (can't check job date without API call, so keep all for now)
    // In future could add timestamp to dismissed entries
    const cleaned = new Set(ids);
    if (cleaned.size > 100) {
      // If too many, keep only last 50 entries
      const recent = [...cleaned].slice(-50);
      const cleanedSet = new Set(recent);
      saveDismissedFailedIds(cleanedSet);
      return cleanedSet;
    }
    return cleaned;
  } catch {
    return new Set();
  }
}

export function JobsInProgressButton() {
  const { locale } = useLocale();
  const router = useRouter();
  const { optimisticJobs, removeOptimisticJob } = useJobsInProgress();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [completedToasts, setCompletedToasts] = useState<CompletedToast[]>([]);
  const [failedToasts, setFailedToasts] = useState<FailedToast[]>([]);
  const [dismissedFailed, setDismissedFailed] = useState<Set<string>>(cleanupDismissedFailedIds());
  const [, setTick] = useState(0); // triggers re-render so progress bar updates
  const prevPendingIdsRef = useRef<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);
  const sseRef = useRef<EventSource | null>(null);

  const fetchJobs = useCallback((showLoading = true) => {
    if (showLoading) setLoading(true);
    listJobs(true)
      .then(async (r) => {
        const all = r.jobs ?? [];
        let pending = all.filter(
          (j) => (j.status === 'pending' || j.status === 'running') && j.type !== 'chat'
        );
        // On initial load: show recent completed/failed so they don't "disappear" after refresh
        if (showLoading) {
          const recentCutoff = Date.now() - 10 * 60 * 1000; // 10 min
          const recentFailed = all.filter(
            (j) => j.status === 'failed' && (j.type === 'image' || j.type === 'video') && new Date(j.created_at).getTime() > recentCutoff
          );
          const recentCompleted = all.filter(
            (j) => j.status === 'completed' && (j.type === 'image' || j.type === 'video') && new Date(j.created_at).getTime() > recentCutoff
          );
          if (recentFailed.length > 0) {
            // Filter out already dismissed failed jobs
            const notDismissed = recentFailed.filter((j) => !dismissedFailed.has(j.id));
            if (notDismissed.length > 0) {
              const toAdd: FailedToast[] = notDismissed.map((j) => ({
                id: j.id,
                type: j.type as 'image' | 'video',
                error: j.error || 'Failed',
                threadId: j.thread_id ?? null,
              }));
              setFailedToasts((prev) => [...prev.filter((f) => !toAdd.some((a) => a.id === f.id)), ...toAdd]);
            }
          }
          if (recentCompleted.length > 0) {
            const toAdd = recentCompleted.map((j) => {
              const created = new Date(j.created_at).getTime();
              const updated = new Date(j.updated_at).getTime();
              const durationSec = Math.round((updated - created) / 1000);
              const urls = j.output ? getOutputUrls(j.output) : [];
              return { id: j.id, type: j.type as 'image' | 'video', threadId: j.thread_id ?? null, durationSec, imageUrl: urls[0] };
            });
            setCompletedToasts((prev) => [...prev.filter((c) => !toAdd.some((a) => a.id === c.id)), ...toAdd]);
          }
        }
        if (pending.length > 0) {
          const verified = await Promise.all(pending.map((j) => getJob(j.id).then((fresh) => fresh ?? j)));
          const actuallyCompleted = verified.filter((j) => j.status === 'completed' && (j.type === 'image' || j.type === 'video'));
          const actuallyFailed = verified.filter((j) => j.status === 'failed' && (j.type === 'image' || j.type === 'video'));
          pending = verified.filter((j) => j.status === 'pending' || j.status === 'running');
          if (actuallyFailed.length > 0) {
            actuallyFailed.forEach((j) => removeOptimisticJob(j.id));
            const notDismissed = actuallyFailed.filter((j) => !dismissedFailed.has(j.id));
            if (notDismissed.length > 0) {
              const toAdd: FailedToast[] = notDismissed.map((j) => ({
                id: j.id,
                type: j.type as 'image' | 'video',
                error: j.error || 'Failed',
                threadId: j.thread_id ?? null,
              }));
              setFailedToasts((prev) => [...prev.filter((f) => !toAdd.some((a) => a.id === f.id)), ...toAdd]);
            }
          }
          if (actuallyCompleted.length > 0) {
            actuallyCompleted.forEach((j) => removeOptimisticJob(j.id));
            playCompletionSound();
            const toAdd = actuallyCompleted.map((j) => {
              if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                new Notification(t(locale, 'jobsInProgress.ready'), {
                  body: t(locale, j.type === 'image' ? 'jobsInProgress.imageReady' : 'jobsInProgress.videoReady'),
                });
              }
              const created = new Date(j.created_at).getTime();
              const updated = new Date(j.updated_at).getTime();
              const durationSec = Math.round((updated - created) / 1000);
              const urls = j.output ? getOutputUrls(j.output) : [];
              return { id: j.id, type: j.type as 'image' | 'video', threadId: j.thread_id ?? null, durationSec, imageUrl: urls[0] };
            });
            setCompletedToasts((prev) => [...prev, ...toAdd]);
          }
        }
        const prevIds = prevPendingIdsRef.current;
        const newIds = new Set(pending.map((j) => j.id));
        const completedIds = [...prevIds].filter((id) => !newIds.has(id));
        if (completedIds.length > 0) {
          const results = await Promise.all(completedIds.map((id) => getJob(id)));
          const failed = results.filter((j): j is Job => !!j && j.status === 'failed' && (j.type === 'image' || j.type === 'video'));
          if (failed.length > 0) {
            failed.forEach((j) => removeOptimisticJob(j.id));
            const notDismissed = failed.filter((j) => !dismissedFailed.has(j.id));
            if (notDismissed.length > 0) {
              const toAdd: FailedToast[] = notDismissed.map((j) => ({
                id: j.id,
                type: j.type as 'image' | 'video',
                error: j.error || 'Failed',
                threadId: j.thread_id ?? null,
              }));
              setFailedToasts((prev) => [...prev.filter((f) => !toAdd.some((a) => a.id === f.id)), ...toAdd]);
            }
          }
          const completed = results.filter((j): j is Job => !!j && j.status === 'completed' && (j.type === 'image' || j.type === 'video'));
          completed.forEach((j) => removeOptimisticJob(j.id));
          const toAdd = completed.map((j) => {
              if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                new Notification(t(locale, 'jobsInProgress.ready'), {
                  body: t(locale, j.type === 'image' ? 'jobsInProgress.imageReady' : 'jobsInProgress.videoReady'),
                });
              }
              const created = new Date(j.created_at).getTime();
              const updated = new Date(j.updated_at).getTime();
              const durationSec = Math.round((updated - created) / 1000);
              const urls = j.output ? getOutputUrls(j.output) : [];
              return { id: j.id, type: j.type as 'image' | 'video', threadId: j.thread_id ?? null, durationSec, imageUrl: urls[0] };
            });
          if (toAdd.length > 0) {
            playCompletionSound();
            setCompletedToasts((prev) => [...prev, ...toAdd]);
          }
        }
        prevPendingIdsRef.current = newIds;
        pending.forEach((j) => removeOptimisticJob(j.id));
        setJobs(pending);
      })
      .catch(() => setJobs([]))
      .finally(() => { if (showLoading) setLoading(false); });
  }, [locale, removeOptimisticJob]);

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const hasPending = jobs.some((j) => j.status === 'pending' || j.status === 'running');
  
  // Real-time SSE connection for job updates
  useEffect(() => {
    let cancelled = false;
    getToken().then((token) => {
      if (cancelled || !token) return;
      
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
      const url = `${API_URL}/api/jobs/stream?token=${encodeURIComponent(token)}`;
      console.log('[JobsInProgressButton] Connecting to SSE:', url.replace(/token=[^&]+/, 'token=***'));
      const es = new EventSource(url);
      
      es.onmessage = (event) => {
        if (cancelled) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'connected') {
            console.log('[JobsInProgressButton] SSE connected');
            return;
          }
          if (data.jobId) {
            console.log('[JobsInProgressButton] Job update received:', data);
            // Force immediate refresh with cache bust
            fetchJobs(false);
            // Trigger progress bar update
            setTick(t => t + 1);
          }
        } catch (err) {
          console.warn('[JobsInProgressButton] SSE parse error:', err);
        }
      };
      
      es.onerror = (err) => {
        console.warn('[JobsInProgressButton] SSE error:', err);
        if (!cancelled) {
          // Fallback to polling on SSE error
          setTimeout(() => {
            fetchJobs(false);
            setTick(t => t + 1);
          }, 2000);
        }
        es.close();
      };
      
      sseRef.current = es;
    });
    
    return () => {
      cancelled = true;
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    };
  }, []); // Remove fetchJobs dependency to prevent reconnections
  
  useEffect(() => {
    fetchJobs(true);
  }, [fetchJobs]);
  
  // Minimal fallback polling (SSE handles real-time updates)
  useEffect(() => {
    // Only poll occasionally to catch any SSE missed updates
    const pollInterval = 30000; // 30s regardless of pending status
    const iv = setInterval(() => fetchJobs(false), pollInterval);
    return () => clearInterval(iv);
  }, [fetchJobs]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, [open]);
  
  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    };
  }, []);

  const apiPendingJobs = jobs.filter((j) => j.status === 'pending' || j.status === 'running');
  const apiIds = new Set(apiPendingJobs.map((j) => j.id));
  const optimisticToShow = optimisticJobs.filter((o) => !apiIds.has(o.id));
  const pendingJobs: Job[] = [
    ...apiPendingJobs,
    ...optimisticToShow.map((o) => ({
      id: o.id,
      type: o.type,
      status: 'pending' as const,
      thread_id: o.thread_id ?? null,
      user_id: '',
      input: {},
      output: null,
      error: null,
      cost_cents: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })),
  ];

  // Progress based on job age - deterministic, persists on refresh (no random reset)
  const getProgressForJob = (job: Job): number => {
    const created = new Date(job.created_at).getTime();
    const elapsedSec = (Date.now() - created) / 1000;
    const totalSec = job.type === 'video' ? 240 : 60; // video ~4min, image ~1min
    const pct = 10 + (elapsedSec / totalSec) * 85;
    return Math.min(95, Math.max(10, Math.round(pct)));
  };

  // Update progress bar every 2s when we have pending jobs
  useEffect(() => {
    if (pendingJobs.length === 0) return;
    const iv = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(iv);
  }, [pendingJobs.length]);

  // Also update progress when dropdown opens (focus case)
  useEffect(() => {
    if (open && pendingJobs.length > 0) {
      setTick(t => t + 1);
    }
  }, [open, pendingJobs.length]);

  const totalCount = pendingJobs.length + completedToasts.length + failedToasts.length;

  const statusT = (status: string) =>
    status === 'pending' ? t(locale, 'jobs.status.pending') : t(locale, 'jobs.status.running');
  const typeT = (type: string) => {
    if (type === 'chat') return t(locale, 'jobs.type.chat');
    if (type === 'image') return t(locale, 'jobs.type.image');
    return t(locale, 'jobs.type.video');
  };

  const formatDuration = (sec: number) => {
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  };

  const goToJob = (job: Job) => {
    setOpen(false);
    if (job.thread_id) {
      router.push(`/dashboard?thread=${job.thread_id}`);
    } else {
      router.push(`/dashboard/jobs/${job.id}`);
    }
  };

  const dismissToast = (id: string) => setCompletedToasts((prev) => prev.filter((x) => x.id !== id));
  
  const dismissFailedDialog = () => {
    if (failedToasts.length > 0) {
      const dismissedId = failedToasts[0].id;
      // Mark as dismissed permanently
      const newDismissed = new Set(dismissedFailed).add(dismissedId);
      setDismissedFailed(newDismissed);
      saveDismissedFailedIds(newDismissed);
      // Remove from current toasts
      setFailedToasts((prev) => prev.slice(1));
    }
  };
  
  const dismissFailedToast = (id: string) => {
    const newDismissed = new Set(dismissedFailed).add(id);
    setDismissedFailed(newDismissed);
    saveDismissedFailedIds(newDismissed);
    setFailedToasts((prev) => prev.filter((f) => f.id !== id));
  };
  const currentFailedToast = failedToasts[0] ?? null;
  const goToSession = (toast: CompletedToast) => {
    dismissToast(toast.id);
    if (toast.threadId) router.push(`/dashboard?thread=${toast.threadId}`);
    else router.push(`/dashboard/content`);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          playDropDownSound();
          setOpen((o) => !o);
          if (!open) fetchJobs();
        }}
        className={`relative flex h-10 w-10 items-center justify-center rounded-full backdrop-blur-sm border transition-all group ${
          pendingJobs.length > 0
            ? 'bg-theme-accent-muted text-theme-accent border-theme-accent-border hover:bg-theme-accent-hover'
            : completedToasts.length > 0 || failedToasts.length > 0
            ? 'bg-theme-bg-hover-strong text-theme-fg border-theme-border-strong hover:bg-theme-bg-hover'
            : 'bg-theme-bg-hover text-theme-fg/80 border-theme-border hover:bg-theme-bg-hover-strong hover:text-theme-fg hover:border-theme-border-hover'
        }`}
        title={t(locale, 'jobsInProgress.title')}
        aria-label={t(locale, 'jobsInProgress.title')}
      >
        <JobsIcon className="h-5 w-5" />
        {totalCount > 0 && (
          <span
            className={`absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full text-[10px] font-bold ${
              pendingJobs.length > 0 ? 'bg-theme-accent text-theme-bg' : 'bg-theme-fg text-theme-bg'
            }`}
          >
            {totalCount}
          </span>
        )}
        <span className="absolute right-full mr-2 px-2.5 py-1.5 rounded-lg bg-theme-bg-elevated border border-theme-border text-xs font-medium text-theme-fg opacity-0 pointer-events-none whitespace-nowrap transition-opacity group-hover:opacity-100">
          {t(locale, 'jobsInProgress.title')}
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-theme-border bg-theme-bg-elevated shadow-xl overflow-hidden z-50"
          >
            <div className="px-3 py-2 border-b border-theme-border-subtle text-sm font-medium text-theme-fg">
              {t(locale, 'jobsInProgress.title')}
            </div>
            <div className="max-h-64 overflow-y-auto scrollbar-subtle">
              {loading && pendingJobs.length === 0 && completedToasts.length === 0 && failedToasts.length === 0 ? (
                <p className="p-4 text-sm text-theme-fg-subtle">{t(locale, 'common.loading')}</p>
              ) : pendingJobs.length === 0 && completedToasts.length === 0 && failedToasts.length === 0 ? (
                <p className="p-4 text-sm text-theme-fg-subtle">{t(locale, 'jobsInProgress.empty')}</p>
              ) : (
                <>
                  {pendingJobs.map((job) => (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => goToJob(job)}
                      className="w-full px-3 py-2.5 flex flex-col gap-2 text-left hover:bg-theme-bg-hover transition-colors border-b border-theme-border-subtle"
                    >
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 w-8 h-8 rounded-lg bg-theme-bg-hover flex items-center justify-center">
                          {job.type === 'video' ? (
                            <VideoIcon className="w-4 h-4 text-theme-accent" />
                          ) : (
                            <ImageIcon className="w-4 h-4 text-theme-accent" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-medium text-theme-fg">{typeT(job.type)}</span>
                          <span className="text-xs text-theme-fg-subtle ml-1.5">{statusT(job.status)}</span>
                        </div>
                        <ChevronRightIcon className="w-4 h-4 shrink-0 text-theme-fg-subtle" />
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 min-w-[60px] rounded-full bg-theme-bg-hover overflow-hidden">
                          <div
                            className="h-full rounded-full bg-theme-accent/80 transition-[width] duration-500 ease-out"
                            style={{ width: `${getProgressForJob(job)}%` }}
                          />
                        </div>
                        <span className="text-xs text-theme-fg-subtle tabular-nums shrink-0 w-8">
                          {getProgressForJob(job)}%
                        </span>
                      </div>
                      {job.type === 'video' && (Date.now() - new Date(job.created_at).getTime() > 60_000) && (
                        <p className="text-xs text-theme-fg-muted">{t(locale, 'jobsInProgress.videoDelay')}</p>
                      )}
                    </button>
                  ))}
                  {completedToasts.map((toast) => (
                    <div
                      key={toast.id}
                      className="flex items-center gap-2 px-3 py-2.5 hover:bg-theme-bg-hover transition-colors border-b border-theme-border-subtle last:border-0 group"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          goToSession(toast);
                          setOpen(false);
                        }}
                        className="flex-1 flex flex-col gap-1.5 text-left min-w-0"
                      >
                        <div className="flex items-center gap-2">
                          {toast.imageUrl ? (
                            toast.type === 'video' ? (
                              <video
                                src={toast.imageUrl}
                                className="w-12 h-12 rounded-lg object-cover shrink-0"
                                muted
                                preload="metadata"
                                playsInline
                              />
                            ) : (
                              <img
                                src={toast.imageUrl}
                                alt=""
                                className="w-12 h-12 rounded-lg object-cover shrink-0"
                              />
                            )
                          ) : (
                            <span className="shrink-0 w-12 h-12 rounded-lg bg-theme-success-muted flex items-center justify-center">
                              {toast.type === 'video' ? (
                                <VideoIcon className="w-5 h-5 text-theme-success" />
                              ) : (
                                <ImageIcon className="w-5 h-5 text-theme-success" />
                              )}
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-theme-fg">
                              {toast.type === 'image' ? t(locale, 'jobsInProgress.imageReady') : t(locale, 'jobsInProgress.videoReady')}
                            </p>
                            <p className="text-xs text-theme-fg-muted">{t(locale, 'jobsInProgress.viewInSession')}</p>
                            <p className="text-xs text-theme-fg-subtle mt-0.5">{formatDuration(toast.durationSec)}</p>
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          dismissToast(toast.id);
                        }}
                        className="shrink-0 p-1.5 rounded text-theme-fg-subtle hover:text-theme-fg hover:bg-theme-bg-hover transition-colors"
                        aria-label={t(locale, 'jobsInProgress.dismiss')}
                      >
                        <XIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {failedToasts.map((toast) => (
                    <div
                      key={toast.id}
                      className="flex items-center gap-2 px-3 py-2.5 border-b border-theme-border-subtle last:border-0 bg-theme-danger-muted/20"
                    >
                      <span className="shrink-0 w-8 h-8 rounded-lg bg-theme-danger-muted flex items-center justify-center">
                        {toast.type === 'video' ? (
                          <VideoIcon className="w-4 h-4 text-theme-danger" />
                        ) : (
                          <ImageIcon className="w-4 h-4 text-theme-danger" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-theme-fg">
                          {toast.type === 'image' ? t(locale, 'jobs.type.image') : t(locale, 'jobs.type.video')} – {t(locale, 'jobs.status.failed')}
                        </p>
                        <p className="text-xs text-theme-fg-muted truncate">{toast.error}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => dismissFailedToast(toast.id)}
                        className="shrink-0 p-1.5 rounded text-theme-fg-subtle hover:text-theme-fg hover:bg-theme-bg-hover transition-colors"
                        aria-label={t(locale, 'jobsInProgress.dismiss')}
                      >
                        <XIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <ConfirmDialog
        open={open && !!currentFailedToast}
        title={currentFailedToast ? `${currentFailedToast.type === 'image' ? t(locale, 'jobs.type.image') : t(locale, 'jobs.type.video')} ${t(locale, 'jobs.status.failed')}` : t(locale, 'jobs.status.failed')}
        message={currentFailedToast?.error ?? ''}
        confirmLabel="OK"
        cancelLabel=""
        alert
        confirmClass="bg-theme-accent-muted text-theme-accent hover:bg-theme-accent-hover"
        onConfirm={dismissFailedDialog}
        onCancel={dismissFailedDialog}
      />
    </div>
  );
}

function JobsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
function VideoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}
function ImageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}
function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}
function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
