'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useLocale } from '@/app/components/LocaleContext';
import { useIncognito } from '@/app/components/IncognitoContext';
import { t } from '@/lib/i18n';
import { createChat, createImage, createVideo, uploadAttachments, getMe, getThread, updateProfile, listContent, type User, type Job, type Thread } from '@/lib/api';
import { getFriendlyPlaceholder } from '@/lib/placeholder';
import { getOutputUrls } from '@/lib/jobOutput';
import { JobCard } from './components/JobCard';
import { ImageSettingsRow, type ImageSettings } from './components/ImageSettingsRow';
import { VideoSettingsRow, type VideoSettings } from './components/VideoSettingsRow';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useJobsInProgress } from './components/JobsInProgressContext';
import { PromptBuilderDialog } from './components/PromptBuilderDialog';

type AttachmentItem = { id: string; file: File; previewUrl: string };

type Mode = 'chat' | 'image' | 'video';

function isProfileIncomplete(user: User | null): boolean {
  if (!user) return false;
  return !user.full_name?.trim() || !user.where_heard?.trim() || !user.use_case?.trim();
}

export default function DashboardPage() {
  const { locale } = useLocale();
  const { incognito, setIncognito, incognitoThreadId, setIncognitoThreadId } = useIncognito();
  const { addOptimisticJob } = useJobsInProgress();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<Mode>('chat');
  const [jobId, setJobId] = useState<string | null>(null);
  const [pendingJobThreadId, setPendingJobThreadId] = useState<string | null>(null);
  const [pendingJobType, setPendingJobType] = useState<'chat' | 'image' | 'video'>('image');
  const [hasStarted, setHasStarted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [fullName, setFullName] = useState('');
  const [whereHeard, setWhereHeard] = useState('');
  const [useCase, setUseCase] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [showPromo, setShowPromo] = useState(true);
  const [latestContent, setLatestContent] = useState<Array<Job & { outputUrls: string[] }>>([]);
  const [contentTotal, setContentTotal] = useState(0);
  const [newsIndex, setNewsIndex] = useState(0);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threadData, setThreadData] = useState<Thread | null>(null);
  const [threadJobs, setThreadJobs] = useState<Job[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [lastSentPrompt, setLastSentPrompt] = useState<string>('');
  const [pendingUserMessage, setPendingUserMessage] = useState<string>('');
  const [pendingUserMessageThreadId, setPendingUserMessageThreadId] = useState<string | null>(null);
  // localStorage key for submitted requests (prevent refresh re-submission)
  const SUBMITTED_REQUESTS_KEY = 'flipo5_submitted_requests';
  
  // Load submitted requests from localStorage
  const getSubmittedRequests = (): Set<string> => {
    if (typeof window === 'undefined') return new Set();
    try {
      const stored = localStorage.getItem(SUBMITTED_REQUESTS_KEY);
      if (!stored) return new Set();
      const data: { key: string; timestamp: number }[] = JSON.parse(stored);
      const now = Date.now();
      const hourAgo = now - 60 * 60 * 1000; // 1 hour
      // Keep only recent submissions
      const recent = data.filter(item => item.timestamp > hourAgo);
      if (recent.length !== data.length) {
        localStorage.setItem(SUBMITTED_REQUESTS_KEY, JSON.stringify(recent));
      }
      return new Set(recent.map(item => item.key));
    } catch {
      return new Set();
    }
  };
  
  // Save submitted request to localStorage
  const saveSubmittedRequest = (key: string) => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(SUBMITTED_REQUESTS_KEY);
      const existing: { key: string; timestamp: number }[] = stored ? JSON.parse(stored) : [];
      const updated = [...existing.filter(item => item.key !== key), { key, timestamp: Date.now() }];
      localStorage.setItem(SUBMITTED_REQUESTS_KEY, JSON.stringify(updated));
    } catch {}
  };
  
  const [submittedRequests, setSubmittedRequests] = useState<Set<string>>(getSubmittedRequests());
  /** When user regenerates a chat reply: old job id -> new job id (show new in same slot, once) */
  const [replaceMap, setReplaceMap] = useState<Record<string, string>>({});
  const [imageSettings, setImageSettings] = useState<ImageSettings>({
    size: '2K',
    aspectRatio: 'match_input_image',
  });
  const [videoSettings, setVideoSettings] = useState<VideoSettings>({
    duration: 5,
    aspectRatio: '16:9',
    resolution: '720p',
  });
  const [referenceImageUrls, setReferenceImageUrls] = useState<string[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [showVideoInputDialog, setShowVideoInputDialog] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [showIncognitoMediaDialog, setShowIncognitoMediaDialog] = useState(false);
  const [showPromptBuilder, setShowPromptBuilder] = useState(false);
  const pendingNormalSessionSubmit = useRef(false);

  const addReferenceImage = useCallback((url: string) => {
    setReferenceImageUrls((prev) => (prev.includes(url) ? prev : [...prev, url]));
  }, []);
  const removeReferenceImage = useCallback((url: string) => {
    setReferenceImageUrls((prev) => prev.filter((u) => u !== url));
  }, []);

  const addAttachment = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const id = Math.random().toString(36).slice(2);
    setAttachments((prev) => [...prev, { id, file, previewUrl: URL.createObjectURL(file) }]);
    if (mode === 'video') setVideoFile(null);
  }, [mode]);
  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const one = prev.find((a) => a.id === id);
      if (one) URL.revokeObjectURL(one.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }, []);
  const clearAttachments = useCallback(() => {
    setAttachments((prev) => {
      prev.forEach((a) => URL.revokeObjectURL(a.previewUrl));
      return [];
    });
  }, []);

  const addVideoFile = useCallback((file: File) => {
    const valid = ['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type);
    if (!valid) return;
    setVideoPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file); });
    setVideoFile(file);
    clearAttachments();
    setReferenceImageUrls([]);
  }, [clearAttachments]);
  const removeVideoFile = useCallback(() => {
    setVideoPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    setVideoFile(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getMe().then((u) => {
      if (cancelled) return;
      setUser(u ?? null);
      if (u) {
        setFullName(u.full_name ?? '');
        setWhereHeard(u.where_heard ?? '');
        setUseCase(u.use_case ?? '');
      }
      setProfileLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!profileLoaded || !user || hasStarted) return;
    let cancelled = false;
    listContent({ page: 1, limit: 8 }).then((r) => {
      if (cancelled) return;
      const jobs = (r.jobs ?? []).map((j) => ({
        ...j,
        outputUrls: j.status === 'completed' && j.output ? getOutputUrls(j.output) : [],
      }));
      setLatestContent(jobs.filter((j) => j.outputUrls.length > 0).slice(0, 3));
      setContentTotal(r.total ?? 0);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [profileLoaded, user, hasStarted]);

  useEffect(() => {
    const id = setInterval(() => setNewsIndex((i) => (i + 1) % 5), 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setJobId(null);
      setPendingJobThreadId(null);
      setHasStarted(false);
      setThreadId(null);
      setThreadJobs([]);
      setPrompt('');
      setError('');
      setIncognitoThreadId(null);
      if (!incognito) router.replace('/dashboard', { scroll: false });
    }
  }, [searchParams, router, incognito]);

  const urlThreadId = searchParams.get('thread');
  const effectiveThreadId = incognito ? incognitoThreadId : threadId;
  useEffect(() => {
    const loadId = urlThreadId ?? (incognito ? incognitoThreadId : null);
    if (loadId && loadId !== threadId) {
      setThreadId(loadId);
      setThreadData(null);
      setThreadJobs([]);
      setReplaceMap({});
      setPendingUserMessage('');
      setPendingUserMessageThreadId(null);
      setThreadLoading(true);
      setHasStarted(true);
      if (urlThreadId) {
        setIncognito(false);
        setIncognitoThreadId(null);
      }
      let cancelled = false;
      getThread(loadId)
        .then((r) => {
          if (cancelled) return;
          setThreadData(r.thread ?? null);
          setThreadJobs(r.jobs ?? []);
        })
        .catch(() => {
          if (cancelled) return;
          setThreadData(null);
          setThreadJobs([]);
          setThreadId(null);
          if (!incognito) router.replace('/dashboard', { scroll: false });
          else setIncognitoThreadId(null);
        })
        .finally(() => { if (!cancelled) setThreadLoading(false); });
      return () => { cancelled = true; };
    }
    if (!incognito && !urlThreadId && threadId) {
      setThreadId(null);
      setThreadData(null);
      setThreadJobs([]);
      setReplaceMap({});
    }
  }, [urlThreadId, incognito, incognitoThreadId, router]);

  const effectiveThreadIdRef = useRef(effectiveThreadId);
  effectiveThreadIdRef.current = effectiveThreadId;

  const refreshThread = useCallback(() => {
    const id = effectiveThreadIdRef.current;
    if (!id) return;
    getThread(id).then((r) => {
      if (effectiveThreadIdRef.current !== id) return;
      setThreadData(r.thread ?? null);
      setThreadJobs(r.jobs ?? []);
    }).catch(() => { if (effectiveThreadIdRef.current === id) setThreadJobs([]); });
  }, []);

  // Start new chat with given media as reference (from ResultActionsBar "Thread")
  const handleStartThreadWithRef = useCallback((mediaUrls: string[]) => {
    setReferenceImageUrls(mediaUrls);
    setThreadId(null);
    setThreadData(null);
    setThreadJobs([]);
    setReplaceMap({});
    setHasStarted(true);
    if (!incognito) router.replace('/dashboard', { scroll: false });
  }, [incognito, router]);

  // Regenerate chat reply (text only, once): create new chat job and show it in same slot
  const handleRegenerate = useCallback(async (oldJobId: string, prompt: string) => {
    if (!effectiveThreadId) return;
    try {
      const res = await createChat(prompt, undefined, effectiveThreadId);
      setReplaceMap((prev) => ({ ...prev, [oldJobId]: res.job_id }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }, [effectiveThreadId]);

  // Apply ref URLs from session (e.g. "Start new chat with this" from another page)
  useEffect(() => {
    const raw = typeof window !== 'undefined' ? sessionStorage.getItem('flipo5_ref_urls') : null;
    if (!raw) return;
    try {
      const urls = JSON.parse(raw) as string[];
      sessionStorage.removeItem('flipo5_ref_urls');
      if (Array.isArray(urls) && urls.length > 0) {
        setReferenceImageUrls(urls);
        setThreadId(null);
        setThreadData(null);
        setThreadJobs([]);
        setHasStarted(true);
        if (!urlThreadId) router.replace('/dashboard', { scroll: false });
      }
    } catch {
      sessionStorage.removeItem('flipo5_ref_urls');
    }
  }, [urlThreadId, router]);

  const isArchived = !!threadData?.archived_at;

  useEffect(() => {
    if (jobId && threadJobs.some((j) => j.id === jobId)) {
      setLastSentPrompt('');
      setJobId(null);
      setPendingJobThreadId(null);
    }
  }, [jobId, threadJobs]);

  // Scroll chat to bottom when new messages/jobs appear or when switching sessions
  const chatContentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hasStarted) return;
    const el = chatScrollRef.current;
    const content = chatContentRef.current;
    if (!el) return;
    const scroll = () => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    requestAnimationFrame(scroll);
    if (jobId) setTimeout(scroll, 800);
    // When switching session, wait for content to render then scroll to bottom
    if (threadId) setTimeout(scroll, 200);
    if (!content) return;
    const ro = new ResizeObserver(() => {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
      if (nearBottom) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, [hasStarted, threadJobs, jobId, lastSentPrompt, threadId]);

  const showCompleteProfile = profileLoaded && user && isProfileIncomplete(user);

  async function handleCompleteProfile(e: React.FormEvent) {
    e.preventDefault();
    const n = fullName.trim();
    const w = whereHeard.trim();
    const u = useCase.trim();
    if (!n || !w || !u) {
      setProfileError(t(locale, 'dashboard.fillRequired'));
      return;
    }
    setProfileError('');
    setProfileSaving(true);
    try {
      await updateProfile({ full_name: n, where_heard: w, use_case: u });
      const updated = await getMe();
      setUser(updated ?? null);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : t(locale, 'error.generic'));
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed && attachments.length === 0) return;
    
    // Prevent duplicate submissions: create unique request key based on content
    const requestKey = `${mode}-${trimmed}-${JSON.stringify({
      attachments: attachments.map(a => a.file.name),
      imageSettings: mode === 'image' ? imageSettings : undefined,
      videoSettings: mode === 'video' ? videoSettings : undefined,
      referenceImageUrls,
      videoFile: videoFile?.name
    })}`;
    
    if (submittedRequests.has(requestKey)) {
      console.warn('[Submit] Duplicate request prevented:', mode, trimmed.slice(0, 50));
      return;
    }
    
    setSubmittedRequests(prev => new Set(prev).add(requestKey));
    saveSubmittedRequest(requestKey);
    
    const useNormalSession = pendingNormalSessionSubmit.current;
    if (useNormalSession) pendingNormalSessionSubmit.current = false;
    if (!useNormalSession && incognito && (mode === 'image' || mode === 'video')) {
      setShowIncognitoMediaDialog(true);
      return;
    }
    setError('');
    setLoading(true);
    const effectiveIncognito = useNormalSession ? false : incognito;
    const tid = effectiveIncognito ? incognitoThreadId : threadId;
    try {
      if (mode === 'chat') {
        const msg = trimmed || ' ';
        setPendingUserMessage(msg);
        setPendingUserMessageThreadId(tid ?? null);
        let attachmentUrls: string[] = [];
        if (attachments.length > 0) {
          attachmentUrls = await uploadAttachments(attachments.map((a) => a.file));
        }
        const res = await createChat(msg, attachmentUrls.length ? attachmentUrls : undefined, useNormalSession ? undefined : tid ?? undefined, effectiveIncognito);
        setPendingUserMessage('');
        setPendingUserMessageThreadId(null);
        setJobId(res.job_id);
        setLastSentPrompt(msg);
        setPendingJobThreadId(res.thread_id ?? tid ?? null);
        setPendingJobType('chat');
        if (res.thread_id) {
          setThreadId(res.thread_id);
          if (effectiveIncognito) setIncognitoThreadId(res.thread_id);
          if (!tid) {
            if (!effectiveIncognito) router.replace(`/dashboard?thread=${res.thread_id}`, { scroll: false });
            setTimeout(() => getThread(res.thread_id!).then((r) => { setThreadData(r.thread ?? null); setThreadJobs(r.jobs ?? []); }).catch(() => setThreadJobs([])), 2000);
          }
        }
        clearAttachments();
        if (tid) setTimeout(() => refreshThread(), 2000);
      } else if (mode === 'image') {
        let imageInput: string[] | undefined;
        const refUrls = referenceImageUrls.length > 0 ? referenceImageUrls : undefined;
        if (attachments.length > 0) {
          const uploaded = await uploadAttachments(attachments.map((a) => a.file));
          imageInput = [...(refUrls ?? []), ...uploaded];
        } else if (refUrls) {
          imageInput = refUrls;
        }
        const res = await createImage({
          prompt: trimmed || ' ',
          threadId: useNormalSession ? undefined : tid ?? undefined,
          incognito: effectiveIncognito,
          size: imageSettings.size,
          aspectRatio: imageSettings.aspectRatio,
          imageInput,
          maxImages: 4,
        });
        addOptimisticJob({ id: res.job_id, type: 'image', thread_id: res.thread_id ?? tid ?? null });
        setJobId(res.job_id);
        setPendingJobThreadId(res.thread_id ?? tid ?? null);
        setPendingJobType('image');
        setLastSentPrompt(trimmed || ' ');
        if (res.thread_id) {
          setThreadId(res.thread_id);
          if (effectiveIncognito) setIncognitoThreadId(res.thread_id);
          if (!tid) {
            if (!effectiveIncognito) router.replace(`/dashboard?thread=${res.thread_id}`, { scroll: false });
            setTimeout(() => getThread(res.thread_id!).then((r) => { setThreadData(r.thread ?? null); setThreadJobs(r.jobs ?? []); }).catch(() => setThreadJobs([])), 2000);
          }
        }
        clearAttachments();
        setReferenceImageUrls([]);
        if (tid) setTimeout(refreshThread, 2000);
      } else {
        let imageUrl: string | undefined;
        let videoUrl: string | undefined;
        const refUrls = referenceImageUrls.length > 0 ? referenceImageUrls : undefined;
        if (attachments.length > 0) {
          const uploaded = await uploadAttachments(attachments.map((a) => a.file));
          imageUrl = (refUrls ? [...refUrls, ...uploaded] : uploaded)[0];
        } else if (refUrls?.[0]) {
          imageUrl = refUrls[0];
        }
        if (videoFile) {
          const urls = await uploadAttachments([videoFile]);
          videoUrl = urls[0];
        }
        const res = await createVideo({
          prompt: trimmed || ' ',
          threadId: useNormalSession ? undefined : tid ?? undefined,
          incognito: effectiveIncognito,
          image: imageUrl,
          video: videoUrl,
          duration: videoSettings.duration,
          aspectRatio: videoSettings.aspectRatio,
          resolution: videoSettings.resolution,
        });
        addOptimisticJob({ id: res.job_id, type: 'video', thread_id: res.thread_id ?? tid ?? null });
        setJobId(res.job_id);
        setPendingJobThreadId(res.thread_id ?? tid ?? null);
        setPendingJobType('video');
        setLastSentPrompt(trimmed || ' ');
        if (res.thread_id) {
          setThreadId(res.thread_id);
          if (effectiveIncognito) setIncognitoThreadId(res.thread_id);
          if (!tid) {
            if (!effectiveIncognito) router.replace(`/dashboard?thread=${res.thread_id}`, { scroll: false });
            setTimeout(() => getThread(res.thread_id!).then((r) => { setThreadData(r.thread ?? null); setThreadJobs(r.jobs ?? []); }).catch(() => setThreadJobs([])), 2000);
          }
        }
      clearAttachments();
      setReferenceImageUrls([]);
      setVideoFile(null);
      if (tid) setTimeout(refreshThread, 2000);
      // Clear request key after successful submission
      setTimeout(() => {
        setSubmittedRequests(prev => {
          const next = new Set(prev);
          next.delete(requestKey);
          return next;
        });
      }, 5000); // Clear after 5s to allow legitimate re-submission
    }
    setHasStarted(true);
    setPrompt('');
    
    // Reset form to prevent browser auto-resubmission
    if (formRef.current) {
      formRef.current.reset();
    }
    } catch (err) {
      setPendingUserMessage('');
      setPendingUserMessageThreadId(null);
      setError(err instanceof Error ? err.message : t(locale, 'error.generic'));
      // Remove failed request key to allow retry
      setSubmittedRequests(prev => {
        const next = new Set(prev);
        next.delete(requestKey);
        return next;
      });
    } finally {
      setLoading(false);
    }
  }

  const inputCls = 'w-full rounded-xl border border-theme-border bg-theme-bg-subtle px-4 py-3 text-theme-fg placeholder:text-theme-fg-subtle focus:border-theme-border-strong focus:outline-none focus:ring-1 focus:ring-theme-border-hover';
  const labelCls = 'block text-sm font-medium text-theme-fg-muted mb-1';
  const btnPrimary = 'w-full rounded-xl bg-white py-3 px-4 text-sm font-semibold text-black hover:bg-neutral-100 transition-colors';

  const showPaperclip = hasStarted || mode === 'image' || mode === 'video';
  const inputWithAttach = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          if (files) {
            for (let i = 0; i < files.length; i++) addAttachment(files[i]);
            e.target.value = '';
          }
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) { addVideoFile(f); setShowVideoInputDialog(false); }
          e.target.value = '';
        }}
      />
      <div className="rounded-xl border border-theme-border bg-theme-bg-subtle focus-within:border-theme-border-strong focus-within:ring-1 focus-within:ring-theme-border-hover transition-all flex items-center flex-wrap gap-1.5 px-2 py-1.5">
        {showPaperclip && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 p-2 text-theme-fg-muted hover:text-theme-fg transition-colors"
            aria-label="Attach image"
          >
            <PaperclipIcon className="w-5 h-5" />
          </button>
        )}
        {mode === 'video' && (
          <button
            type="button"
            onClick={() => setShowVideoInputDialog(true)}
            className="shrink-0 p-2 text-theme-fg-muted hover:text-theme-fg transition-colors"
            aria-label={t(locale, 'video.videoInput')}
          >
            <VideoClipIcon className="w-5 h-5" />
          </button>
        )}
        {(mode === 'image' && (referenceImageUrls.length > 0 || attachments.length > 0)) || (mode === 'video' && (referenceImageUrls.length > 0 || attachments.length > 0 || videoFile)) ? (
          <>
            {mode === 'video' && videoFile && videoPreviewUrl && (
              <div className="relative shrink-0">
                <video src={videoPreviewUrl} className="w-12 h-12 rounded-lg object-cover border border-theme-border" muted />
                <button
                  type="button"
                  onClick={removeVideoFile}
                  className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-theme-bg-overlay-strong border border-theme-border-hover text-theme-fg flex items-center justify-center hover:bg-theme-danger/90"
                  aria-label="Remove"
                >
                  <XIcon className="w-2.5 h-2.5" />
                </button>
              </div>
            )}
            {!videoFile && referenceImageUrls.map((url) => (
              <div key={url} className="relative shrink-0">
                <img src={url} alt="" className="w-8 h-8 rounded-full object-cover border border-theme-border" loading="lazy" decoding="async" />
                <button
                  type="button"
                  onClick={() => removeReferenceImage(url)}
                  className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-theme-bg-overlay-strong border border-theme-border-hover text-theme-fg flex items-center justify-center hover:bg-theme-danger/90"
                  aria-label="Remove"
                >
                  <XIcon className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
            {!videoFile && attachments.map((a) => (
              <div key={a.id} className="relative shrink-0">
                <img src={a.previewUrl} alt="" className="w-8 h-8 rounded-full object-cover border border-theme-border" decoding="async" />
                <button
                  type="button"
                  onClick={() => removeAttachment(a.id)}
                  className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-theme-bg-overlay-strong border border-theme-border-hover text-theme-fg flex items-center justify-center hover:bg-theme-danger/90"
                  aria-label="Remove"
                >
                  <XIcon className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
          </>
        ) : null}
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onPaste={(e) => {
            const items = e.clipboardData?.files;
            if (items) for (let i = 0; i < items.length; i++) addAttachment(items[i]);
          }}
          placeholder={!threadId ? getFriendlyPlaceholder(user?.full_name, locale) : t(locale, 'chat.placeholder')}
          className={`flex-1 min-w-[120px] px-2 py-2.5 bg-transparent text-theme-fg placeholder:text-theme-fg-subtle focus:outline-none rounded-lg`}
          disabled={loading}
        />
        {(mode === 'image' || mode === 'video') && (
          <button
            type="button"
            onClick={() => setShowPromptBuilder(true)}
            className="shrink-0 p-2 text-theme-fg-muted hover:text-theme-fg transition-colors rounded-lg hover:bg-theme-bg-hover"
            title="Prompt builder"
            aria-label="Prompt builder"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
            </svg>
          </button>
        )}
      </div>
    </>
  );

  const bottomBar = (
    <div className="shrink-0 border-t border-theme-border-subtle bg-theme-bg p-4">
      <form ref={formRef} onSubmit={handleSubmit} autoComplete="off" className="w-full max-w-2xl mx-auto flex flex-col gap-3">
        {mode === 'image' && hasStarted && (
          <ImageSettingsRow locale={locale} settings={imageSettings} onChange={setImageSettings} />
        )}
        {mode === 'video' && hasStarted && (
          <VideoSettingsRow
            locale={locale}
            settings={videoSettings}
            onChange={setVideoSettings}
            hasImage={attachments.length > 0 || referenceImageUrls.length > 0}
            hasVideo={!!videoFile}
          />
        )}
        {inputWithAttach}
        <div className="flex flex-wrap items-center gap-2">
          {(['video', 'image', 'chat'] as const).map((m) => (
            <motion.button
              key={m}
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setMode(m)}
              className={mode === m
                ? 'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-theme-border-hover bg-theme-bg-hover-strong text-theme-fg text-sm font-medium transition-all'
                : 'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-theme-border bg-theme-bg-subtle text-theme-fg-muted hover:bg-theme-bg-hover hover:text-theme-fg hover:border-theme-border-hover text-sm font-medium transition-all'
              }
            >
              {m === 'video' && <VideoIcon />}
              {m === 'image' && <ImageIcon />}
              {m === 'chat' && <ChatIcon />}
              {t(locale, `mode.${m}`)}
            </motion.button>
          ))}
        </div>
        {error && <p className="text-sm text-theme-danger">{error === 'rate' ? t(locale, 'error.rate') : error}</p>}
      </form>
    </div>
  );

  return (
    <div className={`flex-1 flex flex-col min-h-0 ${hasStarted ? '' : 'items-center justify-center overflow-y-auto scrollbar-subtle'} px-4 py-8`}>
      <ConfirmDialog
        open={showVideoInputDialog}
        title={t(locale, 'video.videoInputDialog')}
        message={t(locale, 'video.videoInputDesc')}
        confirmLabel={t(locale, 'video.videoInput')}
        cancelLabel={t(locale, 'dialog.cancel')}
        confirmClass="bg-theme-accent-muted text-theme-accent hover:bg-theme-accent-hover"
        onConfirm={() => { videoInputRef.current?.click(); setShowVideoInputDialog(false); }}
        onCancel={() => setShowVideoInputDialog(false)}
      />
      <ConfirmDialog
        open={showIncognitoMediaDialog}
        title={t(locale, 'incognito.media.title')}
        message={t(locale, 'incognito.media.message')}
        confirmLabel={t(locale, 'incognito.media.confirm')}
        cancelLabel={t(locale, 'dialog.cancel')}
        confirmClass="bg-theme-accent-muted text-theme-accent hover:bg-theme-accent-hover"
        onConfirm={() => {
          setShowIncognitoMediaDialog(false);
          setIncognito(false);
          setIncognitoThreadId(null);
          pendingNormalSessionSubmit.current = true;
          formRef.current?.requestSubmit();
        }}
        onCancel={() => setShowIncognitoMediaDialog(false)}
      />
      <PromptBuilderDialog
        open={showPromptBuilder}
        onClose={() => setShowPromptBuilder(false)}
        onPick={(p) => {
          setPrompt(p);
          setShowPromptBuilder(false);
        }}
        locale={locale}
        mode={mode === 'video' ? 'video' : 'image'}
      />
      {showCompleteProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-theme-bg-overlay">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md rounded-2xl border border-theme-border bg-theme-bg-elevated p-6 shadow-xl"
          >
            <h3 className="font-display text-lg font-bold text-theme-fg mb-1">{t(locale, 'dashboard.completeProfile')}</h3>
            <p className="text-sm text-theme-fg-muted mb-6">{t(locale, 'dashboard.completeProfileSub')}</p>
            <form onSubmit={handleCompleteProfile} className="space-y-4">
              <div>
                <label className={labelCls}>{t(locale, 'start.fullName')} *</label>
                <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={t(locale, 'start.placeholderFullName')} className={inputCls} required />
              </div>
              <div>
                <label className={labelCls}>{t(locale, 'start.whereHeard')} *</label>
                <input type="text" value={whereHeard} onChange={(e) => setWhereHeard(e.target.value)} placeholder={t(locale, 'start.placeholderWhereHeard')} className={inputCls} required />
              </div>
              <div>
                <label className={labelCls}>{t(locale, 'start.useCase')} *</label>
                <input type="text" value={useCase} onChange={(e) => setUseCase(e.target.value)} placeholder={t(locale, 'start.placeholderUseCase')} className={inputCls} required />
              </div>
              {profileError && <p className="text-sm text-theme-danger">{profileError}</p>}
              <motion.button type="submit" disabled={profileSaving} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className={btnPrimary}>
                {profileSaving ? '...' : t(locale, 'login.submit')}
              </motion.button>
            </form>
          </motion.div>
        </div>
      )}

      {!hasStarted ? (
        <div className="w-full max-w-2xl flex flex-col items-center">
          {incognito && (
            <div className="flex items-center gap-2 mb-6 px-4 py-2 rounded-xl bg-theme-accent-muted border border-theme-accent-border text-theme-accent">
              <IncognitoEyesIcon className="w-5 h-5 shrink-0" />
              <span className="text-sm font-medium">{t(locale, 'nav.incognitoActive')}</span>
            </div>
          )}
          <h2 className="font-display text-2xl font-bold text-theme-fg mb-8 tracking-tight">FLIPO5</h2>
          <form ref={formRef} onSubmit={handleSubmit} autoComplete="off" className="w-full flex flex-col items-center gap-4">
            {mode === 'image' && (
              <ImageSettingsRow locale={locale} settings={imageSettings} onChange={setImageSettings} />
            )}
            {mode === 'video' && (
              <VideoSettingsRow
                locale={locale}
                settings={videoSettings}
                onChange={setVideoSettings}
                hasImage={attachments.length > 0 || referenceImageUrls.length > 0}
                hasVideo={!!videoFile}
              />
            )}
            <div className="w-full flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = e.target.files;
                  if (files) {
                    for (let i = 0; i < files.length; i++) addAttachment(files[i]);
                    e.target.value = '';
                  }
                }}
              />
              <input
                ref={videoInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) { addVideoFile(f); setShowVideoInputDialog(false); }
                  e.target.value = '';
                }}
              />
              <div className="rounded-xl border border-theme-border bg-theme-bg-subtle focus-within:border-theme-border-strong focus-within:ring-1 focus-within:ring-theme-border-hover transition-all flex items-center flex-wrap gap-1.5 px-2 py-1.5">
                {(mode === 'image' || mode === 'video') && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="shrink-0 p-2 text-theme-fg-muted hover:text-theme-fg transition-colors"
                    aria-label="Attach image"
                  >
                    <PaperclipIcon className="w-5 h-5" />
                  </button>
                )}
                {mode === 'video' && (
                  <button
                    type="button"
                    onClick={() => setShowVideoInputDialog(true)}
                    className="shrink-0 p-2 text-theme-fg-muted hover:text-theme-fg transition-colors"
                    aria-label={t(locale, 'video.videoInput')}
                  >
                    <VideoClipIcon className="w-5 h-5" />
                  </button>
                )}
                {((mode === 'image' || mode === 'video') && (attachments.length > 0 || referenceImageUrls.length > 0)) || (mode === 'video' && videoFile) ? (
                  <>
                    {mode === 'video' && videoFile && videoPreviewUrl && (
                      <div className="relative shrink-0">
                        <video src={videoPreviewUrl} className="w-12 h-12 rounded-lg object-cover border border-theme-border" muted />
                        <button type="button" onClick={removeVideoFile} className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-theme-bg-overlay-strong border border-theme-border-hover text-theme-fg flex items-center justify-center hover:bg-theme-danger/90" aria-label="Remove">
                          <XIcon className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    )}
                    {!videoFile && referenceImageUrls.map((url) => (
                      <div key={url} className="relative shrink-0">
                        <img src={url} alt="" className="w-8 h-8 rounded-full object-cover border border-theme-border" loading="lazy" decoding="async" />
                        <button type="button" onClick={() => removeReferenceImage(url)} className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-theme-bg-overlay-strong border border-theme-border-hover text-theme-fg flex items-center justify-center hover:bg-theme-danger/90" aria-label="Remove">
                          <XIcon className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                    {!videoFile && attachments.map((a) => (
                      <div key={a.id} className="relative shrink-0">
                        <img src={a.previewUrl} alt="" className="w-8 h-8 rounded-full object-cover border border-theme-border" decoding="async" />
                        <button
                          type="button"
                          onClick={() => removeAttachment(a.id)}
                          className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-theme-bg-overlay-strong border border-theme-border-hover text-theme-fg flex items-center justify-center hover:bg-theme-danger/90"
                          aria-label="Remove"
                        >
                          <XIcon className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </>
                ) : null}
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onPaste={(e) => {
                    const items = e.clipboardData?.files;
                    if (items) for (let i = 0; i < items.length; i++) addAttachment(items[i]);
                  }}
                  placeholder={getFriendlyPlaceholder(user?.full_name, locale)}
                  className="flex-1 min-w-[120px] px-2 py-2.5 bg-transparent text-theme-fg placeholder:text-theme-fg-subtle focus:outline-none rounded-lg"
                  disabled={loading}
                />
                {(mode === 'image' || mode === 'video') && (
                  <button
                    type="button"
                    onClick={() => setShowPromptBuilder(true)}
                    className="shrink-0 p-2 text-theme-fg-muted hover:text-theme-fg transition-colors rounded-lg hover:bg-theme-bg-hover"
                    title="Prompt builder"
                    aria-label="Prompt builder"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {(['video', 'image', 'chat'] as const).map((m) => (
                <motion.button
                  key={m}
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setMode(m)}
                  className={mode === m
                    ? 'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-theme-border-hover bg-theme-bg-hover-strong text-theme-fg text-sm font-medium transition-all'
                    : 'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-theme-border bg-theme-bg-subtle text-theme-fg-muted hover:bg-theme-bg-hover hover:text-theme-fg hover:border-theme-border-hover text-sm font-medium transition-all'
                  }
                >
                  {m === 'video' && <VideoIcon />}
                  {m === 'image' && <ImageIcon />}
                  {m === 'chat' && <ChatIcon />}
                  {t(locale, `mode.${m}`)}
                </motion.button>
              ))}
            </div>
          </form>
          {error && <p className="mt-4 text-sm text-theme-danger">{error === 'rate' ? t(locale, 'error.rate') : error}</p>}
          {showPromo && (
            <div className="mt-10 w-full max-w-md mx-auto">
              {contentTotal >= 5 ? (
                <Link
                  href="/dashboard/content"
                  className="flex relative gap-3 px-3 py-2.5 rounded-xl bg-theme-bg-subtle border border-theme-border-subtle hover:border-theme-border-hover transition-colors items-center"
                >
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowPromo(false); }}
                    className="absolute top-1.5 right-1.5 p-1 rounded-full text-theme-fg-subtle hover:text-theme-fg hover:bg-theme-bg-hover transition-colors z-10"
                    aria-label="Close"
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                  <div className="flex-1 min-w-0 pr-5">
                    <p className="text-xs font-medium text-theme-fg truncate">
                      {t(locale, 'dashboard.checkLatest')}
                    </p>
                    <p className="text-[11px] text-theme-fg-subtle/80 mt-0.5 truncate transition-opacity duration-300">
                      {t(locale, `dashboard.news${newsIndex + 1}`)}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {latestContent.map((job, i) => (
                      <div
                        key={job.id}
                        className={`w-14 h-14 rounded-lg overflow-hidden border border-theme-border bg-theme-bg-elevated flex-shrink-0 relative ${i === latestContent.length - 1 ? "after:content-[''] after:absolute after:inset-0 after:bg-theme-bg-overlay" : ''}`}
                      >
                        {job.outputUrls[0] ? (
                          job.type === 'video' ? (
                            <video src={job.outputUrls[0]} className="w-full h-full object-cover" muted preload="metadata" playsInline />
                          ) : (
                            <img src={job.outputUrls[0]} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                          )
                        ) : null}
                      </div>
                    ))}
                  </div>
                </Link>
              ) : (
                <div className="relative px-3 py-3 rounded-xl bg-theme-bg-subtle text-center">
                  <button
                    type="button"
                    onClick={() => setShowPromo(false)}
                    className="absolute top-1.5 right-1.5 p-1 rounded-full text-theme-fg-subtle hover:text-theme-fg hover:bg-theme-bg-hover transition-colors"
                    aria-label="Close"
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                  <p className="text-xs text-theme-fg-muted pr-6">
                    {t(locale, 'dashboard.promo')}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          {isArchived && (
            <div className="shrink-0 w-full max-w-2xl mx-auto px-4 py-2">
              <p className="text-sm text-theme-fg-muted text-center">{t(locale, 'thread.readOnly')}</p>
            </div>
          )}
          <div ref={chatScrollRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden w-full scrollbar-subtle">
            <div ref={chatContentRef} className="w-full max-w-2xl mx-auto flex flex-col py-4 gap-3 px-4">
            {threadLoading && (
              <p className="text-theme-fg-subtle text-sm py-4">{t(locale, 'common.loading')}</p>
            )}
            {[
              ...(pendingUserMessage && effectiveThreadId === pendingUserMessageThreadId
                ? [{ id: '_pending', type: 'chat' as const, input: { prompt: pendingUserMessage } }]
                : []),
              ...threadJobs.map((j) => ({ ...j, id: replaceMap[j.id] || j.id })),
              ...(jobId &&
              !threadJobs.some((j) => j.id === jobId) &&
              effectiveThreadId === pendingJobThreadId
                ? [{ id: jobId, type: pendingJobType, input: lastSentPrompt ? { prompt: lastSentPrompt } : {} }]
                : []),
            ].map((job) => {
              const promptForRegenerate = (job.input as { prompt?: string })?.prompt;
              const isRegeneratedSlot = job.id !== '_pending' && Object.values(replaceMap).includes(job.id);
              return (
              <div key={job.id} className="flex flex-col gap-2">
                {((job.type === 'chat') || (job.type === 'image') || (job.type === 'video')) && (job.input as { prompt?: string })?.prompt && (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-bl-md px-4 py-2.5 bg-theme-bg-hover text-theme-fg text-[15px] whitespace-pre-wrap leading-relaxed">
                      {(job.input as { prompt: string }).prompt}
                    </div>
                  </div>
                )}
                {job.id !== '_pending' && (
                <JobCard
                  jobId={job.id}
                  locale={locale}
                  dark
                  variant="chat"
                  onNotFound={job.id === jobId ? () => { setJobId(null); setPendingJobThreadId(null); } : undefined}
                  onUseAsReference={addReferenceImage}
                  regenerateUsed={isRegeneratedSlot}
                  onRegenerate={job.type === 'chat' && promptForRegenerate && effectiveThreadId && !isRegeneratedSlot
                    ? () => handleRegenerate(job.id, promptForRegenerate)
                    : undefined}
                  onStartThread={handleStartThreadWithRef}
                />
                )}
              </div>
            ); })}
            </div>
          </div>
          {!isArchived && bottomBar}
        </>
      )}
    </div>
  );
}

function VideoIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function VideoClipIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
    </svg>
  );
}
function ImageIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

function IncognitoEyesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4c-4.4 0-8 3.6-8 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8z" />
      <ellipse cx="9" cy="12" rx="1.5" ry="2" />
      <ellipse cx="15" cy="12" rx="1.5" ry="2" />
      <path d="M2 2l20 20" strokeWidth={2.5} />
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

function PaperclipIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.519-9.43a2.25 2.25 0 013.182 3.182l-6.364 6.364a2.25 2.25 0 01-3.182-3.182l6.364-6.364z" />
    </svg>
  );
}
