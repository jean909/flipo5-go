'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocale } from '@/app/components/LocaleContext';
import { useToast } from '@/app/components/ToastContext';
import { useIncognito } from '@/app/components/IncognitoContext';
import { t } from '@/lib/i18n';
import { submitDashboardPrompt } from './hooks/useDashboardSubmit';
import { createChat, createImage, createVideo, uploadAttachments, getMe, getThread, updateProfile, listContent, listThreads, type User, type Job, type Thread } from '@/lib/api';
import { extractImageInputsFromJobInput } from '@/lib/promptIntent';
import { getFriendlyPlaceholder } from '@/lib/placeholder';
import { getOutputUrls } from '@/lib/jobOutput';
import { ImageSettingsRow, type ImageSettings } from './components/ImageSettingsRow';
import { VideoSettingsRow, type VideoSettings } from './components/VideoSettingsRow';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useJobsInProgress } from './components/JobsInProgressContext';

const PromptBuilderDialog = dynamic(
  () => import('./components/PromptBuilderDialog').then((m) => ({ default: m.PromptBuilderDialog })),
  { ssr: false }
);

const JobCard = dynamic(
  () => import('./components/JobCard').then((m) => ({ default: m.JobCard })),
  {
    ssr: false,
    loading: () => (
      <div className="max-w-[min(85vw,680px)] rounded-2xl rounded-tl-md bg-theme-bg-subtle px-4 py-8 min-h-[100px] animate-pulse-subtle" aria-hidden />
    ),
  }
);

type AttachmentItem = { id: string; file: File; previewUrl: string };

type Mode = 'chat' | 'image' | 'video';

function isProfileIncomplete(user: User | null): boolean {
  if (!user) return false;
  return !user.full_name?.trim() || !user.where_heard?.trim() || !user.use_case?.trim();
}

export default function DashboardPage() {
  const { locale } = useLocale();
  const { showToast } = useToast();
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
  const inspireMode = searchParams.get('inspire') === '1' && !hasStarted;
  const [latestContent, setLatestContent] = useState<Array<Job & { outputUrls: string[] }>>([]);
  const [contentTotal, setContentTotal] = useState(0);
  const [newsIndex, setNewsIndex] = useState(0);
  const [lastThreadPreview, setLastThreadPreview] = useState<{ threadId: string; lastPrompt?: string; thumbnailUrl?: string } | null>(null);
  const [promoCarouselIndex, setPromoCarouselIndex] = useState(0);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [promptDragOver, setPromptDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threadData, setThreadData] = useState<Thread | null>(null);
  const [threadJobs, setThreadJobs] = useState<Job[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [lastSentPrompt, setLastSentPrompt] = useState<string>('');
  const [pendingUserMessage, setPendingUserMessage] = useState<string>('');
  const [pendingUserMessageThreadId, setPendingUserMessageThreadId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(max-width: 768px)');
    setIsMobile(m.matches);
    const onMatch = () => setIsMobile(m.matches);
    m.addEventListener('change', onMatch);
    return () => m.removeEventListener('change', onMatch);
  }, []);
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
  const [videoModel, setVideoModel] = useState<'1' | '2'>('1');
  const [referenceImageUrls, setReferenceImageUrls] = useState<string[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [startImageFile, setStartImageFile] = useState<File | null>(null);
  const [startImagePreviewUrl, setStartImagePreviewUrl] = useState<string | null>(null);
  const [endImageFile, setEndImageFile] = useState<File | null>(null);
  const [endImagePreviewUrl, setEndImagePreviewUrl] = useState<string | null>(null);
  const [showVideoInputDialog, setShowVideoInputDialog] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const startImageInputRef = useRef<HTMLInputElement>(null);
  const endImageInputRef = useRef<HTMLInputElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [showIncognitoMediaDialog, setShowIncognitoMediaDialog] = useState(false);
  const [showPromptBuilder, setShowPromptBuilder] = useState(false);
  const pendingNormalSessionSubmit = useRef(false);
  const isSubmittingRef = useRef(false);

  const addReferenceImage = useCallback((url: string) => {
    setReferenceImageUrls((prev) => (prev.includes(url) ? prev : [...prev, url]));
    setMode('image'); // User chose a reference image → switch to Photo so the prompt goes to image generation
  }, []);
  const removeReferenceImage = useCallback((url: string) => {
    setReferenceImageUrls((prev) => prev.filter((u) => u !== url));
  }, []);

  const isAcceptedAttachment = useCallback((file: File) => {
    if (file.type.startsWith('image/')) return true;
    const docTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ];
    return docTypes.includes(file.type);
  }, []);
  const addAttachment = useCallback((file: File) => {
    if (!isAcceptedAttachment(file)) return;
    const id = Math.random().toString(36).slice(2);
    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : '';
    setAttachments((prev) => [...prev, { id, file, previewUrl }]);
    if (mode === 'video') {
      // Switching from video input to attachments should clean video preview resources.
      setVideoPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
      setVideoFile(null);
    }
  }, [mode, isAcceptedAttachment]);
  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const one = prev.find((a) => a.id === id);
      if (one?.previewUrl) URL.revokeObjectURL(one.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  /** First slot in the round composer preview: URL reference or uploaded image (not chat docs-only branch uses same UI). */
  const removeFirstComposerSlot = useCallback(() => {
    const ref = referenceImageUrls[0];
    if (ref) {
      removeReferenceImage(ref);
      return;
    }
    const first = attachments[0];
    if (first && mode !== 'chat') removeAttachment(first.id);
  }, [referenceImageUrls, attachments, mode, removeReferenceImage, removeAttachment]);

  const clearAttachments = useCallback(() => {
    setAttachments((prev) => {
      prev.forEach((a) => { if (a.previewUrl) URL.revokeObjectURL(a.previewUrl); });
      return [];
    });
  }, []);

  const onPromptDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setPromptDragOver(true);
  }, []);
  const onPromptDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setPromptDragOver(false);
  }, []);
  const onPromptDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setPromptDragOver(false);
    const files = e.dataTransfer.files;
    if (files) for (let i = 0; i < files.length; i++) addAttachment(files[i]);
  }, [addAttachment]);

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

  const addStartImageFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    setStartImagePreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file); });
    setStartImageFile(file);
  }, []);
  const removeStartImageFile = useCallback(() => {
    setStartImagePreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    setStartImageFile(null);
  }, []);
  const addEndImageFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    setEndImagePreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file); });
    setEndImageFile(file);
  }, []);
  const removeEndImageFile = useCallback(() => {
    setEndImagePreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    setEndImageFile(null);
  }, []);

  const clearVideoComposer = useCallback(() => {
    setVideoPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    setVideoFile(null);
    setStartImagePreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    setStartImageFile(null);
    setEndImagePreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    setEndImageFile(null);
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
    if (!profileLoaded || !user || hasStarted || incognito) return;
    let cancelled = false;
    listThreads(false)
      .then((r) => {
        if (cancelled || !r.threads?.length) return;
        const first = r.threads[0];
        return getThread(first.id).then((t) => {
          if (cancelled || !t.thread || !t.jobs?.length) return;
          const lastJob = t.jobs[t.jobs.length - 1];
          const prompt = (lastJob.input as { prompt?: string })?.prompt;
          const urls = lastJob.status === 'completed' && lastJob.output ? getOutputUrls(lastJob.output) : [];
          setLastThreadPreview({
            threadId: t.thread.id,
            lastPrompt: prompt,
            thumbnailUrl: urls[0],
          });
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [profileLoaded, user, hasStarted, incognito]);

  useEffect(() => {
    const id = setInterval(() => setNewsIndex((i) => (i + 1) % 5), 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!showPromo) return;
    const t1 = setTimeout(() => setPromoCarouselIndex(1), 4000);
    return () => clearTimeout(t1);
  }, [showPromo]);

  useEffect(() => {
    if (!showPromo || !lastThreadPreview) return;
    const id = setInterval(() => {
      setPromoCarouselIndex((i) => (i === 0 ? 1 : 0));
    }, 5000);
    return () => clearInterval(id);
  }, [showPromo, lastThreadPreview]);

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

  const scheduleThreadRefresh = useCallback((tid: string | null) => {
    if (!tid) return;
    setTimeout(refreshThread, 400);
    setTimeout(refreshThread, 2000);
  }, [refreshThread]);

  // Start new subject from a chat message (text): prefill prompt and open new thread
  const handleStartThreadFromText = useCallback((text: string) => {
    setPrompt(text);
    setThreadId(null);
    setThreadData(null);
    setThreadJobs([]);
    setReplaceMap({});
    setHasStarted(true);
    if (!incognito) router.replace('/dashboard', { scroll: false });
  }, [incognito, router]);
  const handleJobRetry = useCallback((oldId: string, newId: string) => {
    setReplaceMap((prev) => ({ ...prev, [oldId]: newId }));
  }, []);
  const handleActiveJobNotFound = useCallback(() => {
    if (pendingJobType === 'video' && typeof window !== 'undefined') {
      sessionStorage.removeItem('flipo5_video_pending');
    }
    setJobId(null);
    setPendingJobThreadId(null);
  }, [pendingJobType]);

  // Start new chat with given media as reference (e.g. from sessionStorage when coming from another page)
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

  // Regenerate image: re-run same prompt as new image job
  const handleRegenerateImage = useCallback(async (oldJobId: string, prompt: string, jobThreadId: string | null, imageInput?: string[]) => {
    const tid = jobThreadId ?? effectiveThreadId;
    try {
      const res = await createImage({
        prompt: prompt || ' ',
        threadId: tid ?? undefined,
        incognito,
        size: imageSettings.size,
        aspectRatio: imageSettings.aspectRatio,
        imageInput,
        maxImages: 4,
      });
      setReplaceMap((prev) => ({ ...prev, [oldJobId]: res.job_id }));
      setJobId(res.job_id);
      setPendingJobThreadId(res.thread_id ?? tid ?? null);
      setPendingJobType('image');
      if (res.thread_id && !tid) {
        setThreadId(res.thread_id);
        setTimeout(() => getThread(res.thread_id!).then((r) => { setThreadData(r.thread ?? null); setThreadJobs(r.jobs ?? []); }).catch(() => setThreadJobs([])), 400);
      }
      if (tid) setTimeout(() => refreshThread(), 400);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }, [effectiveThreadId, incognito, imageSettings.size, imageSettings.aspectRatio, refreshThread]);

  // Regenerate video: re-run same prompt as new video job
  const handleRegenerateVideo = useCallback(async (oldJobId: string, prompt: string, jobThreadId: string | null) => {
    const tid = jobThreadId ?? effectiveThreadId;
    try {
      const res = await createVideo({
        prompt: prompt || ' ',
        threadId: tid ?? undefined,
        incognito,
        videoModel,
        duration: videoSettings.duration,
        aspectRatio: videoSettings.aspectRatio,
        resolution: videoSettings.resolution,
      });
      setReplaceMap((prev) => ({ ...prev, [oldJobId]: res.job_id }));
      setJobId(res.job_id);
      setPendingJobThreadId(res.thread_id ?? tid ?? null);
      setPendingJobType('video');
      if (res.thread_id && !tid) {
        setThreadId(res.thread_id);
        setTimeout(() => getThread(res.thread_id!).then((r) => { setThreadData(r.thread ?? null); setThreadJobs(r.jobs ?? []); }).catch(() => setThreadJobs([])), 400);
      }
      if (tid) setTimeout(() => refreshThread(), 400);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }, [effectiveThreadId, incognito, videoModel, videoSettings.duration, videoSettings.aspectRatio, videoSettings.resolution, refreshThread]);

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
      if (pendingJobType === 'video' && typeof window !== 'undefined') sessionStorage.removeItem('flipo5_video_pending');
      setJobId(null);
      setPendingJobThreadId(null);
    }
  }, [jobId, threadJobs, pendingJobType]);

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

  /** "nochmal", "again", etc. → treat as regenerate last image/video (when on photo/video). */
  function isRegenerateKeyword(text: string): boolean {
    const lower = text.toLowerCase().trim();
    const keywords = [
      'nochmal', 'noch einmal', 'nochmal bitte', 'erneut', 'regen', 'wieder', 'nochmal bitte',
      'again', 'again please', 'regenerate', 'regenerate please', 'one more', 'same again', 'same please',
      'retry', 'retry please', 'another one', 'one more time',
    ];
    return keywords.some((k) => lower === k || lower.startsWith(k + ' ') || lower.startsWith(k + ','));
  }

  /** When user is on Text (chat) mode, detect if prompt clearly asks for photo or video and route there. */
  function getIntentFromPrompt(text: string): 'image' | 'video' | null {
    const lower = text.toLowerCase().trim();
    // Video first so "create a video" isn't matched by image patterns
    const videoPrefixes = [
      'create a video', 'generate a video', 'create video', 'generate video', 'make a video', 'make video',
      'creat a video', 'generat a video', 'creat video', 'generat video', 'create a vid', 'generate a vid',
      'erstelle ein video', 'generiere ein video', 'erstelle video', 'generiere video', 'video erstellen', 'video generieren',
      'erstel ein video', 'generier ein video', 'erstelle ein vid', 'mach ein video', 'mach video',
      'create video of', 'generate video of', 'make video of',
    ];
    if (videoPrefixes.some((p) => lower.startsWith(p))) return 'video';
    const imagePrefixes = [
      'create a photo', 'generate a photo', 'create a picture', 'generate a picture', 'create an image', 'generate an image',
      'create photo', 'generate photo', 'create picture', 'generate picture', 'create image', 'generate image',
      'creat a photo', 'generat a photo', 'creat a picture', 'creat photo', 'generat photo', 'creat image', 'generat image',
      'create a foto', 'generate a foto', 'create foto', 'generate foto', 'creat a foto', 'creat foto',
      'draw a ', 'draw an ', 'make a photo', 'make a picture', 'make an image', 'make photo', 'make picture', 'make image',
      'mach ein foto', 'mach ein bild', 'mach foto', 'mach bild', 'mach ein photo', 'mach ein picture',
      'erstelle ein foto', 'generiere ein foto', 'erstelle ein bild', 'generiere ein bild',
      'erstelle foto', 'generiere foto', 'foto erstellen', 'bild erstellen', 'bild generieren',
      'erstel ein foto', 'generier ein foto', 'erstel ein bild', 'generier ein bild',
      'erstelle ein photo', 'generiere ein photo', 'erstelle ein picture', 'photo erstellen', 'picture erstellen',
      'create a img', 'generate a img', 'create img', 'generate img',
    ];
    if (imagePrefixes.some((p) => lower.startsWith(p))) return 'image';
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmittingRef.current) return;
    await submitDashboardPrompt({
      prompt,
      attachments,
      mode,
      imageSettings,
      videoSettings,
      referenceImageUrls,
      videoFile,
      videoModel,
      startImageFile,
      endImageFile,
      isSubmittingRef,
      pendingNormalSessionSubmit,
      incognito,
      incognitoThreadId,
      threadId,
      effectiveThreadId,
      pendingJobThreadId,
      pendingJobType,
      jobId,
      lastSentPrompt,
      threadJobs,
      locale,
      t,
      setShowIncognitoMediaDialog,
      setError,
      setLoading,
      setPendingUserMessage,
      setPendingUserMessageThreadId,
      setJobId,
      setLastSentPrompt,
      setPendingJobThreadId,
      setPendingJobType,
      setThreadId,
      setIncognitoThreadId,
      setThreadData,
      setThreadJobs,
      setHasStarted,
      setPrompt,
      setReferenceImageUrls,
      uploadAttachments,
      createChat,
      createImage,
      createVideo,
      getThread,
      routerReplace: (href: string) => router.replace(href, { scroll: false }),
      refreshThread,
      addOptimisticJob,
      handleRegenerateImage,
      handleRegenerateVideo,
      clearAttachments,
      clearVideoComposer,
      scheduleThreadRefresh,
      formReset: () => {
        // Reset form to prevent browser auto-resubmission
        if (formRef.current) formRef.current.reset();
      },
      onSentToast: () => showToast('toast.sent'),
    });
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
        accept="image/*,.pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
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
      <input
        ref={startImageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) addStartImageFile(f);
          e.target.value = '';
        }}
      />
      <input
        ref={endImageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) addEndImageFile(f);
          e.target.value = '';
        }}
      />
      <div
        className={`relative rounded-xl border bg-theme-bg-subtle focus-within:border-theme-border-strong focus-within:ring-1 focus-within:ring-theme-border-hover transition-all duration-200 flex items-center flex-wrap gap-1.5 px-2 py-1.5 ${promptDragOver ? 'border-theme-accent ring-1 ring-theme-accent' : 'border-theme-border'}`}
        onDragOver={onPromptDragOver}
        onDragLeave={onPromptDragLeave}
        onDrop={onPromptDrop}
      >
        {showPaperclip && (mode !== 'video' || videoModel === '1') && (
          (referenceImageUrls.length > 0 || (attachments.length > 0 && mode !== 'chat')) ? (
            <div className="relative shrink-0 group h-10 w-10">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 flex items-center justify-center rounded-full border border-theme-border bg-theme-bg-elevated p-0.5 overflow-hidden transition-colors hover:border-theme-border-hover"
                aria-label="Attach image"
              >
                {(referenceImageUrls[0] || attachments[0]?.previewUrl) ? (
                  <img src={referenceImageUrls[0] || attachments[0]!.previewUrl} alt="" className="h-full w-full object-cover" decoding="async" />
                ) : (
                  <DocumentIcon className="h-5 w-5 shrink-0 text-theme-fg-muted" />
                )}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  removeFirstComposerSlot();
                }}
                className="absolute -right-0.5 -top-0.5 z-10 flex h-4 w-4 items-center justify-center rounded-full border border-theme-border-hover bg-theme-bg-overlay-strong text-theme-fg transition-opacity duration-150 hover:border-red-400/50 hover:bg-red-500/25 pointer-coarse:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100"
                aria-label={t(locale, 'common.remove')}
                title={t(locale, 'common.remove')}
              >
                <XIcon className="h-2.5 w-2.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn-tap shrink-0 p-2 text-theme-fg-muted transition-colors hover:text-theme-fg"
              aria-label="Attach image"
            >
              <PaperclipIcon className="h-5 w-5" />
            </button>
          )
        )}
        {mode === 'video' && videoModel === '2' && (
          <>
            <button
              type="button"
              onClick={() => startImageFile ? removeStartImageFile() : startImageInputRef.current?.click()}
              className={startImageFile && startImagePreviewUrl ? 'shrink-0 p-0.5 rounded-full border border-theme-border overflow-hidden w-10 h-10 flex items-center justify-center relative group' : 'shrink-0 p-2 text-theme-fg-muted hover:text-theme-fg transition-colors'}
              title={t(locale, 'video.startImage')}
              aria-label={t(locale, 'video.startImage')}
            >
              {startImageFile && startImagePreviewUrl ? (
                <>
                  <img src={startImagePreviewUrl} alt="" className="w-full h-full object-cover" decoding="async" />
                  <span className="absolute bottom-0 left-0 right-0 py-0.5 bg-black/60 text-white text-[9px] font-medium uppercase text-center">Start</span>
                  <button type="button" onClick={(e) => { e.stopPropagation(); removeStartImageFile(); }} className="absolute top-0 right-0 w-3.5 h-3.5 rounded-full bg-theme-bg-overlay-strong border border-theme-border-hover text-theme-fg flex items-center justify-center hover:bg-theme-bg-hover opacity-0 group-hover:opacity-100 transition-opacity duration-150" aria-label={t(locale, 'common.remove')}><XIcon className="w-2 h-2" /></button>
                </>
              ) : (
                <ImageIcon className="w-5 h-5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => endImageFile ? removeEndImageFile() : endImageInputRef.current?.click()}
              className={endImageFile && endImagePreviewUrl ? 'shrink-0 p-0.5 rounded-full border border-theme-border overflow-hidden w-10 h-10 flex items-center justify-center relative group' : 'shrink-0 p-2 text-theme-fg-muted hover:text-theme-fg transition-colors'}
              title={t(locale, 'video.endImage')}
              aria-label={t(locale, 'video.endImage')}
            >
              {endImageFile && endImagePreviewUrl ? (
                <>
                  <img src={endImagePreviewUrl} alt="" className="w-full h-full object-cover" decoding="async" />
                  <span className="absolute bottom-0 left-0 right-0 py-0.5 bg-black/60 text-white text-[9px] font-medium uppercase text-center">End</span>
                  <button type="button" onClick={(e) => { e.stopPropagation(); removeEndImageFile(); }} className="absolute top-0 right-0 w-3.5 h-3.5 rounded-full bg-theme-bg-overlay-strong border border-theme-border-hover text-theme-fg flex items-center justify-center hover:bg-theme-bg-hover opacity-0 group-hover:opacity-100 transition-opacity duration-150" aria-label={t(locale, 'common.remove')}><XIcon className="w-2 h-2" /></button>
                </>
              ) : (
                <ImageIcon className="w-5 h-5" />
              )}
            </button>
          </>
        )}
        {mode === 'video' && videoModel === '1' && (
          <button
            type="button"
            onClick={() => videoFile ? removeVideoFile() : setShowVideoInputDialog(true)}
            className={videoFile && videoPreviewUrl ? 'shrink-0 p-0.5 rounded-full border border-theme-border overflow-hidden w-10 h-10 flex items-center justify-center' : 'shrink-0 p-2 text-theme-fg-muted hover:text-theme-fg transition-colors'}
            aria-label={t(locale, 'video.videoInput')}
          >
            {videoFile && videoPreviewUrl ? (
              <video src={videoPreviewUrl} className="w-full h-full object-cover" muted />
            ) : (
              <VideoClipIcon className="w-5 h-5" />
            )}
          </button>
        )}
        {(mode === 'image' && (referenceImageUrls.length > 0 || attachments.length > 0)) || (mode === 'video' && (referenceImageUrls.length > 0 || attachments.length > 0 || videoFile || (videoModel === '2' && (startImageFile || endImageFile)))) || (mode === 'chat' && attachments.length > 0) ? (
          <>
            {mode === 'chat' && attachments.map((a) => (
              <div
                key={a.id}
                role="button"
                tabIndex={0}
                onClick={() => removeAttachment(a.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); removeAttachment(a.id); } }}
                className="relative shrink-0 group flex items-center gap-1 w-8 h-8 rounded-full border border-theme-border bg-theme-bg-elevated overflow-hidden cursor-pointer hover:ring-2 hover:ring-theme-border-hover"
                aria-label={t(locale, 'common.remove')}
              >
                {a.previewUrl ? (
                  <img src={a.previewUrl} alt="" className="w-full h-full object-cover" decoding="async" />
                ) : (
                  <span title={a.file.name}><DocumentIcon className="w-4 h-4 text-theme-fg-muted shrink-0 mx-auto" /></span>
                )}
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-theme-bg-overlay-strong border border-theme-border-hover text-theme-fg flex items-center justify-center pointer-events-none" aria-hidden><XIcon className="w-2.5 h-2.5" /></span>
              </div>
            ))}
            {(mode === 'image' || (mode === 'video' && videoModel === '1' && !videoFile)) && (referenceImageUrls.length > 0 ? referenceImageUrls.slice(1) : referenceImageUrls).map((url) => (
              <div key={url} className="relative shrink-0 group">
                <img src={url} alt="" className="w-8 h-8 rounded-full object-cover border border-theme-border" loading="lazy" decoding="async" />
                <button type="button" onClick={(e) => { e.stopPropagation(); removeReferenceImage(url); }} className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-theme-bg-overlay-strong border border-theme-border-hover text-theme-fg flex items-center justify-center hover:bg-theme-bg-hover opacity-90 hover:opacity-100 transition-opacity" aria-label={t(locale, 'common.remove')}>
                  <XIcon className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
            {(mode === 'image' || (mode === 'video' && videoModel === '1' && !videoFile)) && (referenceImageUrls.length > 0 ? attachments : attachments.slice(1)).map((a) => (
              <div key={a.id} className="relative shrink-0 group flex items-center gap-1 w-8 h-8 rounded-full border border-theme-border bg-theme-bg-elevated overflow-hidden">
                {a.previewUrl ? (
                  <img src={a.previewUrl} alt="" className="w-full h-full object-cover" decoding="async" />
                ) : (
                  <span title={a.file.name}><DocumentIcon className="w-4 h-4 text-theme-fg-muted shrink-0 mx-auto" /></span>
                )}
                <button type="button" onClick={() => removeAttachment(a.id)} className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-theme-bg-overlay-strong border border-theme-border-hover text-theme-fg flex items-center justify-center hover:bg-theme-bg-hover opacity-90 hover:opacity-100 transition-opacity" aria-label={t(locale, 'common.remove')}>
                  <XIcon className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
          </>
        ) : null}
        {promptDragOver && (
          <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-theme-accent/10 border-2 border-dashed border-theme-accent text-theme-fg text-sm font-medium pointer-events-none z-10">
            {t(locale, 'chat.dropFiles')}
          </span>
        )}
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            if (e.shiftKey) return; // allow newline with Shift+Enter
            if ((e.nativeEvent as KeyboardEvent).isComposing) return;
            e.preventDefault();
            if (loading) return;
            formRef.current?.requestSubmit();
          }}
          onPaste={(e) => {
            const items = e.clipboardData?.files;
            if (items) for (let i = 0; i < items.length; i++) addAttachment(items[i]);
          }}
          placeholder={!threadId ? getFriendlyPlaceholder(user?.full_name, locale) : t(locale, 'chat.placeholder')}
          rows={1}
          className={`scrollbar-subtle flex-1 min-w-[120px] px-2 py-2.5 bg-transparent text-theme-fg placeholder:text-theme-fg-subtle focus:outline-none rounded-lg resize-none max-h-40 overflow-y-auto`}
          disabled={loading}
        />
        {(mode === 'image' || mode === 'video') && (
          <button
            type="button"
            onClick={() => setShowPromptBuilder(true)}
            className="btn-tap shrink-0 p-2 text-theme-fg-muted hover:text-theme-fg rounded-lg hover:bg-theme-bg-hover"
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
    <div className="shrink-0 border-t border-theme-border-subtle bg-theme-bg p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <form ref={formRef} onSubmit={handleSubmit} autoComplete="off" className="w-full max-w-2xl mx-auto flex flex-col gap-3">
        {mode === 'image' && (hasStarted || inspireMode) && (
          <ImageSettingsRow locale={locale} settings={imageSettings} onChange={setImageSettings} />
        )}
        {mode === 'video' && (hasStarted || inspireMode) && (
          <VideoSettingsRow
            locale={locale}
            settings={videoSettings}
            onChange={setVideoSettings}
            hasImage={videoModel === '1' && (attachments.length > 0 || referenceImageUrls.length > 0)}
            hasVideo={!!videoFile}
            videoModel={videoModel}
            onVideoModelChange={(m) => {
              setVideoModel(m);
              if (m === '1') { removeStartImageFile(); removeEndImageFile(); }
              else { removeVideoFile(); setVideoSettings((s) => ({ ...s, duration: s.duration === 5 || s.duration === 10 ? s.duration : 5 })); }
            }}
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
              transition={{ duration: 0.15 }}
              onClick={() => setMode(m)}
              className={mode === m
                ? 'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-theme-border-hover bg-theme-bg-hover-strong text-theme-fg text-sm font-medium transition-all duration-150'
                : 'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-theme-border bg-theme-bg-subtle text-theme-fg-muted hover:bg-theme-bg-hover hover:text-theme-fg hover:border-theme-border-hover text-sm font-medium transition-all duration-150'
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

  // Company curated gallery — replace with real AI images/videos when ready
  const P = (seed: string, w: number, h: number) => ({ url: `https://picsum.photos/seed/${seed}/${w}/${h}`, poster: '', type: 'image' as const, w, h });
  // Pexels free MP4 previews — small files, reliable CDN, allow embedding
  const V = (id: string, poster: string, w = 1280, h = 720) => ({
    url: `https://player.vimeo.com/external/${id}.hd.mp4?s=&profile_id=174`,
    poster: `https://picsum.photos/seed/${poster}/${w}/${h}`,
    type: 'video' as const, w, h,
  });
  // Cloudflare/Google media samples — small, fast-loading
  const S = (url: string, poster: string, w = 960, h = 540) => ({
    url, poster: `https://picsum.photos/seed/${poster}/${w}/${h}`, type: 'video' as const, w, h,
  });
  const COMPANY_IMAGES: { url: string; poster: string; type: 'image' | 'video'; w: number; h: number }[] = [
    P('aurora',    600, 900),
    P('canyon',    800, 520),
    S('https://storage.googleapis.com/media-session/big-buck-bunny/chapter1.mp4', 'vid1', 1280, 720),
    P('dusk',      500, 750),
    P('ember',     900, 600),
    P('forest',    480, 700),
    S('https://storage.googleapis.com/media-session/big-buck-bunny/chapter2.mp4', 'vid2', 1280, 720),
    P('glacier',   700, 480),
    P('harbor',    600, 600),
    P('iris',      420, 680),
    S('https://storage.googleapis.com/media-session/big-buck-bunny/chapter3.mp4', 'vid3', 1280, 720),
    P('jungle',    850, 560),
    P('kestrel',   560, 840),
    S('https://storage.googleapis.com/web-dev-assets/video-and-source-tags/chrome.mp4', 'vid4', 800, 600),
    P('lagoon',    780, 520),
    P('mesa',      500, 760),
    P('nebula',    900, 640),
    S('https://media.w3.org/2010/05/sintel/trailer.mp4', 'vid5', 1280, 544),
    P('ocean',     640, 900),
    P('prism',     700, 700),
    S('https://media.w3.org/2010/05/bunny/trailer.mp4', 'vid6', 1280, 720),
    P('quartz',    820, 540),
    P('ravine',    480, 720),
    P('savanna',   860, 580),
    S('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', 'vid7', 1280, 720),
    P('tide',      540, 860),
    P('umbra',     760, 500),
    S('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4', 'vid8', 1280, 720),
    P('vale',      500, 740),
    P('wash',      880, 600),
    P('xenon',     460, 700),
    S('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4', 'vid9', 1280, 720),
    P('yonder',    740, 480),
    P('zenith',    580, 880),
    S('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4', 'vid10', 1280, 720),
    P('apex',      820, 560),
    P('blaze',     500, 760),
    P('cascade',   760, 520),
    S('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4', 'vid11', 1280, 720),
    P('delta',     480, 740),
    P('echo',      900, 620),
    P('fjord',     560, 840),
    S('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4', 'vid12', 1280, 720),
    P('grove',     800, 540),
    P('helix',     440, 680),
    P('indigo',    860, 580),
    S('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/VolkswagenGTIReview.mp4', 'vid13', 1280, 720),
    P('jasper',    520, 780),
    P('karma',     780, 520),
    S('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4', 'vid14', 1280, 720),
    P('lumen',     460, 700),
    P('mirage',    900, 640),
    P('nimbus',    540, 820),
    P('onyx',      820, 540),
    P('pulse',     500, 760),
    P('ridge',     860, 580),
    P('solstice',  480, 720),
    P('terrace',   760, 500),
    P('ultra',     560, 860),
    P('vortex',    820, 560),
    P('wisp',      480, 740),
    P('xylem',     900, 600),
    P('yearning',  540, 820),
    P('zeal',      780, 520),
  ];

  const chatRenderModel = useMemo(() => {
    const rawList = [
      ...(pendingUserMessage && effectiveThreadId === pendingUserMessageThreadId
        ? [{ id: '_pending', type: 'chat' as const, input: { prompt: pendingUserMessage } }]
        : []),
      ...threadJobs.map((j) => ({ ...j, id: replaceMap[j.id] || j.id })),
      ...(jobId &&
      !threadJobs.some((j) => j.id === jobId) &&
      effectiveThreadId === pendingJobThreadId
        ? [{ id: jobId, type: pendingJobType, input: lastSentPrompt ? { prompt: lastSentPrompt } : {} }]
        : []),
    ];
    const seenIds = new Set<string>();
    const displayList = rawList.filter((j) => {
      if (seenIds.has(j.id)) return false;
      seenIds.add(j.id);
      return true;
    });
    const lastChatJobId = displayList.filter((j) => j.type === 'chat' && j.id !== '_pending').pop()?.id;
    const regeneratedIds = new Set(Object.values(replaceMap));
    return { displayList, lastChatJobId, regeneratedIds };
  }, [
    pendingUserMessage,
    effectiveThreadId,
    pendingUserMessageThreadId,
    threadJobs,
    replaceMap,
    jobId,
    pendingJobThreadId,
    pendingJobType,
    lastSentPrompt,
  ]);

  return (
    <div className={`flex-1 flex flex-col min-h-0 ${(hasStarted || inspireMode) ? '' : 'items-center justify-center overflow-y-auto scrollbar-subtle'} ${!inspireMode ? 'px-4 py-8' : ''}`}>
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
                {profileSaving ? t(locale, 'common.loading') : t(locale, 'login.submit')}
              </motion.button>
            </form>
          </motion.div>
        </div>
      )}

      {!hasStarted && inspireMode ? (
        <>
          {/* Inspire gallery — scrollable, fills available height */}
          <div className="flex-1 min-h-0 relative">
          <div className="h-full overflow-y-auto scrollbar-subtle">
            {/* Slim header */}
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
            {/* Masonry grid */}
            <div
              className="masonry-cols"
              style={{ columns: 'auto 160px', gap: '2px', padding: '2px' }}
            >
              {COMPANY_IMAGES.map((item, i) => (
                <div
                  key={i}
                  className="relative group overflow-hidden bg-theme-bg-elevated"
                  style={{ breakInside: 'avoid', marginBottom: '2px', display: 'block' }}
                >
                  {item.type === 'video' ? (
                    <div style={{ aspectRatio: `${item.w}/${item.h}`, position: 'relative' }}>
                      {/* Poster image — always visible, video loads on top */}
                      <img
                        src={item.poster}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                      <video
                        src={item.url}
                        className="absolute inset-0 w-full h-full object-cover"
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="metadata"
                      />
                    </div>
                  ) : (
                    <img
                      src={item.url}
                      alt=""
                      width={item.w}
                      height={item.h}
                      className="w-full block"
                      loading={i < 10 ? 'eager' : 'lazy'}
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
          {/* Endless fade — gradient from 50% height to background */}
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
      ) : !hasStarted ? (
        <div className="w-full max-w-2xl flex flex-col items-center">
          {incognito && (
            <div className="flex items-center gap-2 mb-6 px-4 py-2 rounded-xl bg-theme-accent-muted border border-theme-accent-border text-theme-accent">
              <IncognitoEyesIcon className="w-5 h-5 shrink-0" />
              <span className="text-sm font-medium">{t(locale, 'nav.incognitoActive')}</span>
            </div>
          )}
          <h2 className="font-display text-2xl font-bold text-theme-fg mb-4 tracking-tight">FLIPO5</h2>
          <form ref={formRef} onSubmit={handleSubmit} autoComplete="off" className="w-full flex flex-col items-center gap-4">
            {mode === 'image' && (
              <ImageSettingsRow locale={locale} settings={imageSettings} onChange={setImageSettings} />
            )}
            {mode === 'video' && (
              <VideoSettingsRow
                locale={locale}
                settings={videoSettings}
                onChange={setVideoSettings}
                hasImage={videoModel === '1' && (attachments.length > 0 || referenceImageUrls.length > 0)}
                hasVideo={!!videoFile}
                videoModel={videoModel}
                onVideoModelChange={(m) => {
                  setVideoModel(m);
                  if (m === '1') { removeStartImageFile(); removeEndImageFile(); }
                  else { removeVideoFile(); setVideoSettings((s) => ({ ...s, duration: s.duration === 5 || s.duration === 10 ? s.duration : 5 })); }
                }}
              />
            )}
            <div className="w-full flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
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
              <input ref={startImageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) addStartImageFile(f); e.target.value = ''; }} />
              <input ref={endImageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) addEndImageFile(f); e.target.value = ''; }} />
              <div
                className={`relative rounded-xl border bg-theme-bg-subtle focus-within:border-theme-border-strong focus-within:ring-1 focus-within:ring-theme-border-hover transition-all duration-200 flex items-center flex-wrap gap-1.5 px-2 py-1.5 ${promptDragOver ? 'border-theme-accent ring-1 ring-theme-accent' : 'border-theme-border'}`}
                onDragOver={onPromptDragOver}
                onDragLeave={onPromptDragLeave}
                onDrop={onPromptDrop}
              >
                {(mode === 'image' || (mode === 'video' && videoModel === '1') || mode === 'chat') && (
                  (referenceImageUrls.length > 0 || (attachments.length > 0 && mode !== 'chat')) ? (
                    <div className="relative shrink-0 group h-10 w-10">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="absolute inset-0 flex items-center justify-center rounded-full border border-theme-border bg-theme-bg-elevated p-0.5 overflow-hidden transition-colors hover:border-theme-border-hover"
                        aria-label="Attach image"
                      >
                        {(referenceImageUrls[0] || attachments[0]?.previewUrl) ? (
                          <img src={referenceImageUrls[0] || attachments[0]!.previewUrl} alt="" className="h-full w-full object-cover" decoding="async" />
                        ) : (
                          <DocumentIcon className="h-5 w-5 shrink-0 text-theme-fg-muted" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          removeFirstComposerSlot();
                        }}
                        className="absolute -right-0.5 -top-0.5 z-10 flex h-4 w-4 items-center justify-center rounded-full border border-theme-border-hover bg-theme-bg-overlay-strong text-theme-fg transition-opacity duration-150 hover:border-red-400/50 hover:bg-red-500/25 pointer-coarse:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100"
                        aria-label={t(locale, 'common.remove')}
                        title={t(locale, 'common.remove')}
                      >
                        <XIcon className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="btn-tap shrink-0 p-2 text-theme-fg-muted transition-colors hover:text-theme-fg" aria-label="Attach image">
                      <PaperclipIcon className="h-5 w-5" />
                    </button>
                  )
                )}
                {mode === 'video' && videoModel === '2' && (
                  <>
                    <button type="button" onClick={() => startImageFile ? removeStartImageFile() : startImageInputRef.current?.click()} className={startImageFile && startImagePreviewUrl ? 'shrink-0 p-0.5 rounded-full border border-theme-border overflow-hidden w-10 h-10 flex items-center justify-center relative group' : 'shrink-0 p-2 text-theme-fg-muted hover:text-theme-fg transition-colors'} title={t(locale, 'video.startImage')} aria-label={t(locale, 'video.startImage')}>
                      {startImageFile && startImagePreviewUrl ? (
                        <>
                          <img src={startImagePreviewUrl} alt="" className="w-full h-full object-cover" decoding="async" />
                          <span className="absolute bottom-0 left-0 right-0 py-0.5 bg-black/60 text-white text-[9px] font-medium uppercase text-center">Start</span>
                          <button type="button" onClick={(e) => { e.stopPropagation(); removeStartImageFile(); }} className="absolute top-0 right-0 w-3.5 h-3.5 rounded-full bg-theme-bg-overlay-strong border border-theme-border-hover text-theme-fg flex items-center justify-center hover:bg-theme-bg-hover opacity-0 group-hover:opacity-100 transition-opacity duration-150" aria-label={t(locale, 'common.remove')}><XIcon className="w-2 h-2" /></button>
                        </>
                      ) : (
                        <ImageIcon className="w-5 h-5" />
                      )}
                    </button>
                    <button type="button" onClick={() => endImageFile ? removeEndImageFile() : endImageInputRef.current?.click()} className={endImageFile && endImagePreviewUrl ? 'shrink-0 p-0.5 rounded-full border border-theme-border overflow-hidden w-10 h-10 flex items-center justify-center relative group' : 'shrink-0 p-2 text-theme-fg-muted hover:text-theme-fg transition-colors'} title={t(locale, 'video.endImage')} aria-label={t(locale, 'video.endImage')}>
                      {endImageFile && endImagePreviewUrl ? (
                        <>
                          <img src={endImagePreviewUrl} alt="" className="w-full h-full object-cover" decoding="async" />
                          <span className="absolute bottom-0 left-0 right-0 py-0.5 bg-black/60 text-white text-[9px] font-medium uppercase text-center">End</span>
                          <button type="button" onClick={(e) => { e.stopPropagation(); removeEndImageFile(); }} className="absolute top-0 right-0 w-3.5 h-3.5 rounded-full bg-theme-bg-overlay-strong border border-theme-border-hover text-theme-fg flex items-center justify-center hover:bg-theme-bg-hover opacity-0 group-hover:opacity-100 transition-opacity duration-150" aria-label={t(locale, 'common.remove')}><XIcon className="w-2 h-2" /></button>
                        </>
                      ) : (
                        <ImageIcon className="w-5 h-5" />
                      )}
                    </button>
                  </>
                )}
                {mode === 'video' && videoModel === '1' && (
                  <button type="button" onClick={() => videoFile ? removeVideoFile() : setShowVideoInputDialog(true)} className={videoFile && videoPreviewUrl ? 'shrink-0 p-0.5 rounded-full border border-theme-border overflow-hidden w-10 h-10 flex items-center justify-center' : 'shrink-0 p-2 text-theme-fg-muted hover:text-theme-fg transition-colors'} aria-label={t(locale, 'video.videoInput')}>
                    {videoFile && videoPreviewUrl ? <video src={videoPreviewUrl} className="w-full h-full object-cover" muted /> : <VideoClipIcon className="w-5 h-5" />}
                  </button>
                )}
                {((mode === 'image' || (mode === 'video' && videoModel === '1')) && (referenceImageUrls.length > 0 || attachments.length > 0)) || (mode === 'video' && videoModel === '1' && videoFile) || (mode === 'video' && videoModel === '2' && (startImageFile || endImageFile)) || (mode === 'chat' && attachments.length > 0) ? (
                  <>
                    {mode === 'chat' && attachments.map((a) => (
                      <div
                        key={a.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => removeAttachment(a.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); removeAttachment(a.id); } }}
                        className="relative shrink-0 group flex items-center w-8 h-8 rounded-full border border-theme-border bg-theme-bg-elevated overflow-hidden cursor-pointer hover:ring-2 hover:ring-theme-border-hover"
                        aria-label={t(locale, 'common.remove')}
                      >
                        {a.previewUrl ? (
                          <img src={a.previewUrl} alt="" className="w-full h-full object-cover" decoding="async" />
                        ) : (
                          <span title={a.file.name}><DocumentIcon className="w-4 h-4 text-theme-fg-muted shrink-0 mx-auto" /></span>
                        )}
                        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-theme-bg-overlay-strong border border-theme-border-hover text-theme-fg flex items-center justify-center pointer-events-none" aria-hidden><XIcon className="w-2.5 h-2.5" /></span>
                      </div>
                    ))}
                    {(mode === 'image' || (mode === 'video' && videoModel === '1' && !videoFile)) && (referenceImageUrls.length > 0 ? referenceImageUrls.slice(1) : referenceImageUrls).map((url) => (
                      <div key={url} className="relative shrink-0 group">
                        <img src={url} alt="" className="w-8 h-8 rounded-full object-cover border border-theme-border" loading="lazy" decoding="async" />
                        <button type="button" onClick={(e) => { e.stopPropagation(); removeReferenceImage(url); }} className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-theme-bg-overlay-strong border border-theme-border-hover text-theme-fg flex items-center justify-center hover:bg-theme-bg-hover opacity-90 hover:opacity-100 transition-opacity" aria-label={t(locale, 'common.remove')}><XIcon className="w-2.5 h-2.5" /></button>
                      </div>
                    ))}
                    {(mode === 'image' || (mode === 'video' && videoModel === '1' && !videoFile)) && (referenceImageUrls.length > 0 ? attachments : attachments.slice(1)).map((a) => (
                      <div key={a.id} className="relative shrink-0 group flex items-center w-8 h-8 rounded-full border border-theme-border bg-theme-bg-elevated overflow-hidden">
                        {a.previewUrl ? (
                          <img src={a.previewUrl} alt="" className="w-full h-full object-cover" decoding="async" />
                        ) : (
                          <span title={a.file.name}><DocumentIcon className="w-4 h-4 text-theme-fg-muted shrink-0 mx-auto" /></span>
                        )}
                        <button type="button" onClick={() => removeAttachment(a.id)} className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-theme-bg-overlay-strong border border-theme-border-hover text-theme-fg flex items-center justify-center hover:bg-theme-bg-hover opacity-90 hover:opacity-100 transition-opacity" aria-label={t(locale, 'common.remove')}><XIcon className="w-2.5 h-2.5" /></button>
                      </div>
                    ))}
                  </>
                ) : null}
                {promptDragOver && (
                  <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-theme-accent/10 border-2 border-dashed border-theme-accent text-theme-fg text-sm font-medium pointer-events-none z-10">
                    {t(locale, 'chat.dropFiles')}
                  </span>
                )}
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
                  transition={{ duration: 0.15 }}
                  onClick={() => setMode(m)}
                  className={mode === m
                    ? 'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-theme-border-hover bg-theme-bg-hover-strong text-theme-fg text-sm font-medium transition-all duration-150'
                    : 'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-theme-border bg-theme-bg-subtle text-theme-fg-muted hover:bg-theme-bg-hover hover:text-theme-fg hover:border-theme-border-hover text-sm font-medium transition-all duration-150'
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
            <div className="mt-10 w-full max-w-md mx-auto relative min-h-[72px]">
              <button
                type="button"
                onClick={() => setShowPromo(false)}
                className="absolute top-1.5 right-1.5 p-1 rounded-full text-theme-fg-subtle hover:text-theme-fg hover:bg-theme-bg-hover transition-colors z-10"
                aria-label="Close"
              >
                <XIcon className="w-3 h-3" />
              </button>
              <AnimatePresence mode="wait" initial={false}>
                {promoCarouselIndex === 1 && lastThreadPreview ? (
                  <motion.div
                    key="continue"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Link
                      href={`/dashboard?thread=${lastThreadPreview.threadId}`}
                      className="flex relative gap-3 px-3 py-2.5 rounded-xl bg-theme-bg-subtle border border-theme-border-subtle hover:border-theme-border-hover transition-colors items-center"
                    >
                      <div className="flex-1 min-w-0 pr-5">
                        <p className="text-xs font-medium text-theme-fg truncate">
                          {t(locale, 'dashboard.continueFromLast')}
                        </p>
                        <p className="text-[11px] text-theme-fg-subtle/80 mt-0.5 truncate">
                          {lastThreadPreview.lastPrompt
                            ? lastThreadPreview.lastPrompt
                            : t(locale, 'dashboard.continueFromLastSub')}
                        </p>
                      </div>
                      {lastThreadPreview.thumbnailUrl ? (
                        <div className="w-14 h-14 rounded-lg overflow-hidden border border-theme-border bg-theme-bg-elevated flex-shrink-0">
                          <img src={lastThreadPreview.thumbnailUrl} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-lg border border-theme-border bg-theme-bg-elevated flex-shrink-0 flex items-center justify-center">
                          <ChatIcon className="w-6 h-6 text-theme-fg-subtle" />
                        </div>
                      )}
                    </Link>
                  </motion.div>
                ) : (
                  <motion.div
                    key="creations"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    {contentTotal >= 5 ? (
                      <Link
                        href="/dashboard/content"
                        className="flex relative gap-3 px-3 py-2.5 rounded-xl bg-theme-bg-subtle border border-theme-border-subtle hover:border-theme-border-hover transition-colors items-center"
                      >
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
                        <p className="text-xs text-theme-fg-muted pr-6">
                          {t(locale, 'dashboard.promo')}
                        </p>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
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
            <AnimatePresence initial={false}>
            {chatRenderModel.displayList.map((job) => {
                const promptForRegenerate = (job.input as { prompt?: string })?.prompt;
                const isRegeneratedSlot = job.id !== '_pending' && chatRenderModel.regeneratedIds.has(job.id);
                const isLastReply = job.id === chatRenderModel.lastChatJobId;
                return (
                <motion.div
                  key={job.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="flex flex-col gap-2"
                >
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
                    onNotFound={job.id === jobId ? handleActiveJobNotFound : undefined}
                    onUseAsReference={addReferenceImage}
                    regenerateUsed={isRegeneratedSlot}
                    onRegenerate={
                      job.type === 'chat' && isLastReply && promptForRegenerate && effectiveThreadId && !isRegeneratedSlot
                        ? () => handleRegenerate(job.id, promptForRegenerate)
                        : job.type === 'image' && promptForRegenerate
                          ? () =>
                              handleRegenerateImage(
                                job.id,
                                promptForRegenerate,
                                'thread_id' in job ? (job.thread_id ?? null) : null,
                                extractImageInputsFromJobInput(job.input)
                              )
                          : job.type === 'video' && promptForRegenerate
                            ? () => handleRegenerateVideo(job.id, promptForRegenerate, 'thread_id' in job ? (job.thread_id ?? null) : null)
                            : undefined
                    }
                    onRetry={handleJobRetry}
                    onCancel={undefined}
                    onStartThreadFromText={handleStartThreadFromText}
                  />
                  )}
                </motion.div>
              ); })}
            </AnimatePresence>
            </div>
          </div>
          {!isArchived && bottomBar}
        </>
      )}
    </div>
  );
}

function VideoIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function VideoClipIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-4 h-4'} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
    </svg>
  );
}
function ImageIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}
function ChatIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}
