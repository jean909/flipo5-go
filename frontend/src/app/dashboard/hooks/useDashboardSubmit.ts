import { getIntentFromPrompt, isRegenerateKeyword } from '@/lib/promptIntent';

type SubmitCtx = {
  prompt: string;
  attachments: Array<{ file: File }>;
  mode: 'chat' | 'image' | 'video';
  imageSettings: { size: string; aspectRatio: string };
  videoSettings: { duration: number; aspectRatio: string; resolution: string };
  referenceImageUrls: string[];
  videoFile: File | null;
  videoModel: '1' | '2';
  startImageFile: File | null;
  endImageFile: File | null;
  isSubmittingRef: { current: boolean };
  pendingNormalSessionSubmit: { current: boolean };
  incognito: boolean;
  incognitoThreadId: string | null;
  threadId: string | null;
  effectiveThreadId: string | null;
  pendingJobThreadId: string | null;
  pendingJobType: 'chat' | 'image' | 'video';
  jobId: string | null;
  lastSentPrompt: string;
  threadJobs: any[];
  locale: 'en' | 'de';
  t: (locale: 'en' | 'de', key: string) => string;

  setShowIncognitoMediaDialog: (v: boolean) => void;
  setError: (v: string) => void;
  setLoading: (v: boolean) => void;
  setPendingUserMessage: (v: string) => void;
  setPendingUserMessageThreadId: (v: string | null) => void;
  setJobId: (v: string | null) => void;
  setLastSentPrompt: (v: string) => void;
  setPendingJobThreadId: (v: string | null) => void;
  setPendingJobType: (v: 'chat' | 'image' | 'video') => void;
  setThreadId: (v: string | null) => void;
  setIncognitoThreadId: (v: string | null) => void;
  setThreadData: (v: any) => void;
  setThreadJobs: (v: any[]) => void;
  setHasStarted: (v: boolean) => void;
  setPrompt: (v: string) => void;
  setReferenceImageUrls: (v: string[]) => void;

  uploadAttachments: (files: File[]) => Promise<string[]>;
  createChat: (msg: string, urls?: string[], threadId?: string, incognito?: boolean, types?: string[]) => Promise<{ job_id: string; thread_id?: string | null }>;
  createImage: (payload: any) => Promise<{ job_id: string; thread_id?: string | null }>;
  createVideo: (payload: any) => Promise<{ job_id: string; thread_id?: string | null }>;
  getThread: (id: string) => Promise<{ thread?: any; jobs?: any[] }>;
  routerReplace: (href: string) => void;
  refreshThread: () => void;
  addOptimisticJob: (job: { id: string; type: 'image' | 'video'; thread_id: string | null }) => void;
  handleRegenerateImage: (oldJobId: string, prompt: string, jobThreadId: string | null) => Promise<void>;
  handleRegenerateVideo: (oldJobId: string, prompt: string, jobThreadId: string | null) => Promise<void>;
  clearAttachments: () => void;
  clearVideoComposer: () => void;
  scheduleThreadRefresh: (tid: string | null) => void;
  formReset: () => void;
  /** Subtle toast after prompt was queued successfully */
  onSentToast?: () => void;
};

export async function submitDashboardPrompt(ctx: SubmitCtx): Promise<void> {
  const trimmed = ctx.prompt.trim();
  if (!trimmed && ctx.attachments.length === 0) return;

  ctx.isSubmittingRef.current = true;
  const effectiveMode: 'chat' | 'image' | 'video' = ctx.mode === 'chat' ? (getIntentFromPrompt(trimmed) ?? 'chat') : ctx.mode;
  const requestKey = `${effectiveMode}-${trimmed}-${JSON.stringify({
    attachments: ctx.attachments.map((a) => a.file.name),
    imageSettings: effectiveMode === 'image' ? ctx.imageSettings : undefined,
    videoSettings: effectiveMode === 'video' ? ctx.videoSettings : undefined,
    referenceImageUrls: ctx.referenceImageUrls,
    videoFile: ctx.videoFile?.name,
    videoModel: effectiveMode === 'video' ? ctx.videoModel : undefined,
    startImageFile: ctx.startImageFile?.name,
    endImageFile: ctx.endImageFile?.name,
  })}`;

  if (effectiveMode === 'video' && typeof window !== 'undefined') {
    try {
      const raw = sessionStorage.getItem('flipo5_video_pending');
      if (raw) {
        const { key: pendingKey, t } = JSON.parse(raw) as { key?: string; t?: number };
        if (pendingKey === requestKey && typeof t === 'number' && Date.now() - t < 90_000) {
          ctx.isSubmittingRef.current = false;
          return;
        }
        sessionStorage.removeItem('flipo5_video_pending');
      }
    } catch { sessionStorage.removeItem('flipo5_video_pending'); }
  }

  const useNormalSession = ctx.pendingNormalSessionSubmit.current;
  if (useNormalSession) ctx.pendingNormalSessionSubmit.current = false;
  if (!useNormalSession && ctx.incognito && (effectiveMode === 'image' || effectiveMode === 'video')) {
    ctx.setShowIncognitoMediaDialog(true);
    ctx.isSubmittingRef.current = false;
    return;
  }

  ctx.setError('');
  ctx.setLoading(true);
  const effectiveIncognito = useNormalSession ? false : ctx.incognito;
  const tid = effectiveIncognito ? ctx.incognitoThreadId : ctx.threadId;

  try {
    if (effectiveMode === 'chat') {
      const msg = trimmed || ' ';
      ctx.setPendingUserMessage(msg);
      ctx.setPendingUserMessageThreadId(tid ?? null);
      let attachmentUrls: string[] = [];
      const attachmentContentTypes = ctx.attachments.map((a) => a.file.type);
      if (ctx.attachments.length > 0) attachmentUrls = await ctx.uploadAttachments(ctx.attachments.map((a) => a.file));
      const res = await ctx.createChat(msg, attachmentUrls.length ? attachmentUrls : undefined, useNormalSession ? undefined : tid ?? undefined, effectiveIncognito, attachmentUrls.length ? attachmentContentTypes : undefined);
      ctx.setPendingUserMessage('');
      ctx.setPendingUserMessageThreadId(null);
      ctx.setJobId(res.job_id);
      ctx.setLastSentPrompt(msg);
      ctx.setPendingJobThreadId(res.thread_id ?? tid ?? null);
      ctx.setPendingJobType('chat');
      if (res.thread_id) {
        ctx.setThreadId(res.thread_id);
        if (effectiveIncognito) ctx.setIncognitoThreadId(res.thread_id);
        if (!tid) {
          if (!effectiveIncognito) ctx.routerReplace(`/dashboard?thread=${res.thread_id}`);
          setTimeout(() => ctx.getThread(res.thread_id!).then((r) => { ctx.setThreadData(r.thread ?? null); ctx.setThreadJobs(r.jobs ?? []); }).catch(() => ctx.setThreadJobs([])), 400);
          setTimeout(() => ctx.getThread(res.thread_id!).then((r) => { ctx.setThreadData(r.thread ?? null); ctx.setThreadJobs(r.jobs ?? []); }).catch(() => {}), 2000);
        }
      }
      ctx.clearAttachments();
      ctx.scheduleThreadRefresh(tid);
    } else if (effectiveMode === 'image') {
      if (isRegenerateKeyword(trimmed)) {
        const lastImageJob = [...ctx.threadJobs].reverse().find((j) => j.type === 'image');
        const promptToUse = lastImageJob ? (lastImageJob.input as { prompt?: string })?.prompt : (ctx.pendingJobType === 'image' && ctx.effectiveThreadId === ctx.pendingJobThreadId && ctx.jobId ? ctx.lastSentPrompt : null);
        const jobIdToReplace = lastImageJob?.id ?? (ctx.pendingJobType === 'image' && ctx.effectiveThreadId === ctx.pendingJobThreadId ? ctx.jobId : null);
        const threadIdForJob = lastImageJob && 'thread_id' in lastImageJob ? (lastImageJob.thread_id ?? null) : (ctx.effectiveThreadId ?? null);
        if (jobIdToReplace && promptToUse) {
          await ctx.handleRegenerateImage(jobIdToReplace, promptToUse, threadIdForJob);
          ctx.setHasStarted(true);
          ctx.setPrompt('');
          ctx.formReset();
          ctx.clearAttachments();
          ctx.setReferenceImageUrls([]);
          ctx.scheduleThreadRefresh(tid);
          ctx.onSentToast?.();
          return;
        }
        ctx.setError(ctx.t(ctx.locale, 'feedback.noPreviousImage') || 'No previous image to regenerate.');
        return;
      }

      let imageInput: string[] | undefined;
      const refUrls = ctx.referenceImageUrls.length > 0 ? ctx.referenceImageUrls : undefined;
      if (ctx.attachments.length > 0) {
        const uploaded = await ctx.uploadAttachments(ctx.attachments.map((a) => a.file));
        imageInput = [...(refUrls ?? []), ...uploaded];
      } else if (refUrls) {
        imageInput = refUrls;
      }

      const res = await ctx.createImage({
        prompt: trimmed || ' ',
        threadId: useNormalSession ? undefined : tid ?? undefined,
        incognito: effectiveIncognito,
        size: ctx.imageSettings.size,
        aspectRatio: ctx.imageSettings.aspectRatio,
        imageInput,
        maxImages: 4,
      });
      ctx.addOptimisticJob({ id: res.job_id, type: 'image', thread_id: res.thread_id ?? tid ?? null });
      ctx.setJobId(res.job_id);
      ctx.setPendingJobThreadId(res.thread_id ?? tid ?? null);
      ctx.setPendingJobType('image');
      ctx.setLastSentPrompt(trimmed || ' ');
      if (res.thread_id) {
        ctx.setThreadId(res.thread_id);
        if (effectiveIncognito) ctx.setIncognitoThreadId(res.thread_id);
        if (!tid) {
          if (!effectiveIncognito) ctx.routerReplace(`/dashboard?thread=${res.thread_id}`);
          setTimeout(() => ctx.getThread(res.thread_id!).then((r) => { ctx.setThreadData(r.thread ?? null); ctx.setThreadJobs(r.jobs ?? []); }).catch(() => ctx.setThreadJobs([])), 400);
          setTimeout(() => ctx.getThread(res.thread_id!).then((r) => { ctx.setThreadData(r.thread ?? null); ctx.setThreadJobs(r.jobs ?? []); }).catch(() => {}), 2000);
        }
      }
      ctx.clearAttachments();
      ctx.setReferenceImageUrls([]);
      ctx.scheduleThreadRefresh(tid);
    } else {
      if (isRegenerateKeyword(trimmed)) {
        const lastVideoJob = [...ctx.threadJobs].reverse().find((j) => j.type === 'video');
        const promptToUse = lastVideoJob ? (lastVideoJob.input as { prompt?: string })?.prompt : (ctx.pendingJobType === 'video' && ctx.effectiveThreadId === ctx.pendingJobThreadId && ctx.jobId ? ctx.lastSentPrompt : null);
        const jobIdToReplace = lastVideoJob?.id ?? (ctx.pendingJobType === 'video' && ctx.effectiveThreadId === ctx.pendingJobThreadId ? ctx.jobId : null);
        const threadIdForJob = lastVideoJob && 'thread_id' in lastVideoJob ? (lastVideoJob.thread_id ?? null) : (ctx.effectiveThreadId ?? null);
        if (jobIdToReplace && promptToUse) {
          await ctx.handleRegenerateVideo(jobIdToReplace, promptToUse, threadIdForJob);
          ctx.setHasStarted(true);
          ctx.setPrompt('');
          ctx.formReset();
          ctx.clearAttachments();
          ctx.setReferenceImageUrls([]);
          ctx.clearVideoComposer();
          ctx.scheduleThreadRefresh(tid);
          ctx.onSentToast?.();
          return;
        }
        ctx.setError(ctx.t(ctx.locale, 'feedback.noPreviousVideo') || 'No previous video to regenerate.');
        return;
      }

      let imageUrl: string | undefined;
      let videoUrl: string | undefined;
      let startImageUrl: string | undefined;
      let endImageUrl: string | undefined;
      if (ctx.videoModel === '2') {
        const toUpload: File[] = [];
        if (ctx.startImageFile) toUpload.push(ctx.startImageFile);
        if (ctx.endImageFile) toUpload.push(ctx.endImageFile);
        if (toUpload.length > 0) {
          const urls = await ctx.uploadAttachments(toUpload);
          let i = 0;
          if (ctx.startImageFile) startImageUrl = urls[i++];
          if (ctx.endImageFile) endImageUrl = urls[i];
        }
      } else {
        const refUrls = ctx.referenceImageUrls.length > 0 ? ctx.referenceImageUrls : undefined;
        if (ctx.attachments.length > 0) {
          const uploaded = await ctx.uploadAttachments(ctx.attachments.map((a) => a.file));
          imageUrl = (refUrls ? [...refUrls, ...uploaded] : uploaded)[0];
        } else if (refUrls?.[0]) {
          imageUrl = refUrls[0];
        }
        if (ctx.videoFile) {
          const urls = await ctx.uploadAttachments([ctx.videoFile]);
          videoUrl = urls[0];
        }
      }

      const res = await ctx.createVideo({
        prompt: trimmed || ' ',
        threadId: useNormalSession ? undefined : tid ?? undefined,
        incognito: effectiveIncognito,
        videoModel: ctx.videoModel,
        duration: ctx.videoSettings.duration,
        aspectRatio: ctx.videoSettings.aspectRatio,
        resolution: ctx.videoSettings.resolution,
        ...(ctx.videoModel === '2' ? { startImage: startImageUrl, endImage: endImageUrl } : { image: imageUrl, video: videoUrl }),
      });
      if (typeof window !== 'undefined') sessionStorage.setItem('flipo5_video_pending', JSON.stringify({ key: requestKey, t: Date.now() }));
      ctx.addOptimisticJob({ id: res.job_id, type: 'video', thread_id: res.thread_id ?? tid ?? null });
      ctx.setJobId(res.job_id);
      ctx.setPendingJobThreadId(res.thread_id ?? tid ?? null);
      ctx.setPendingJobType('video');
      ctx.setLastSentPrompt(trimmed || ' ');
      if (res.thread_id) {
        ctx.setThreadId(res.thread_id);
        if (effectiveIncognito) ctx.setIncognitoThreadId(res.thread_id);
        if (!tid) {
          if (!effectiveIncognito) ctx.routerReplace(`/dashboard?thread=${res.thread_id}`);
          setTimeout(() => ctx.getThread(res.thread_id!).then((r) => { ctx.setThreadData(r.thread ?? null); ctx.setThreadJobs(r.jobs ?? []); }).catch(() => ctx.setThreadJobs([])), 400);
          setTimeout(() => ctx.getThread(res.thread_id!).then((r) => { ctx.setThreadData(r.thread ?? null); ctx.setThreadJobs(r.jobs ?? []); }).catch(() => {}), 2000);
        }
      }
      ctx.clearAttachments();
      ctx.setReferenceImageUrls([]);
      ctx.clearVideoComposer();
      ctx.scheduleThreadRefresh(tid);
    }

    ctx.setHasStarted(true);
    ctx.setPrompt('');
    ctx.formReset();
    ctx.onSentToast?.();
  } catch (err) {
    ctx.setPendingUserMessage('');
    ctx.setPendingUserMessageThreadId(null);
    ctx.setError(err instanceof Error ? err.message : ctx.t(ctx.locale, 'error.generic'));
  } finally {
    ctx.setLoading(false);
    ctx.isSubmittingRef.current = false;
  }
}
