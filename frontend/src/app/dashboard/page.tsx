'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useLocale } from '@/app/components/LocaleContext';
import { useIncognito } from '@/app/components/IncognitoContext';
import { t } from '@/lib/i18n';
import { createChat, createImage, createVideo, uploadAttachments, getMe, getThread, updateProfile, type User, type Job, type Thread } from '@/lib/api';
import { getFriendlyPlaceholder } from '@/lib/placeholder';
import { JobCard } from './components/JobCard';
import { ImageSettingsRow, type ImageSettings } from './components/ImageSettingsRow';
import { ConfirmDialog } from '@/components/ConfirmDialog';

type AttachmentItem = { id: string; file: File; previewUrl: string };

type Mode = 'chat' | 'image' | 'video';

function isProfileIncomplete(user: User | null): boolean {
  if (!user) return false;
  return !user.full_name?.trim() || !user.where_heard?.trim() || !user.use_case?.trim();
}

export default function DashboardPage() {
  const { locale } = useLocale();
  const { incognito, setIncognito, incognitoThreadId, setIncognitoThreadId } = useIncognito();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<Mode>('chat');
  const [jobId, setJobId] = useState<string | null>(null);
  const [pendingJobThreadId, setPendingJobThreadId] = useState<string | null>(null);
  const [pendingJobType, setPendingJobType] = useState<'image' | 'video'>('image');
  const [hasStarted, setHasStarted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [fullName, setFullName] = useState('');
  const [whereHeard, setWhereHeard] = useState('');
  const [useCase, setUseCase] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [showPromo, setShowPromo] = useState(true);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threadData, setThreadData] = useState<Thread | null>(null);
  const [threadJobs, setThreadJobs] = useState<Job[]>([]);
  const [lastSentPrompt, setLastSentPrompt] = useState<string>('');
  const [imageSettings, setImageSettings] = useState<ImageSettings>({
    size: '2K',
    aspectRatio: 'match_input_image',
  });
  const [referenceImageUrls, setReferenceImageUrls] = useState<string[]>([]);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [showIncognitoMediaDialog, setShowIncognitoMediaDialog] = useState(false);
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
  }, []);
  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const one = prev.find((a) => a.id === id);
      if (one) URL.revokeObjectURL(one.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }, []);
  const clearAttachments = useCallback(() => {
    attachments.forEach((a) => URL.revokeObjectURL(a.previewUrl));
    setAttachments([]);
  }, [attachments]);

  useEffect(() => {
    getMe().then((u) => {
      setUser(u ?? null);
      if (u) {
        setFullName(u.full_name ?? '');
        setWhereHeard(u.where_heard ?? '');
        setUseCase(u.use_case ?? '');
      }
      setProfileLoaded(true);
    });
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
    const loadId = incognito ? incognitoThreadId : urlThreadId;
    if (loadId && loadId !== threadId) {
      setThreadId(loadId);
      setHasStarted(true);
      getThread(loadId)
        .then((r) => {
          setThreadData(r.thread ?? null);
          setThreadJobs(r.jobs ?? []);
        })
        .catch(() => {
          setThreadData(null);
          setThreadJobs([]);
          setThreadId(null);
          if (!incognito) router.replace('/dashboard', { scroll: false });
          else setIncognitoThreadId(null);
        });
    }
    if (!incognito && !urlThreadId && threadId) {
      setThreadId(null);
      setThreadData(null);
      setThreadJobs([]);
    }
  }, [urlThreadId, incognito, incognitoThreadId, router]);

  const refreshThread = useCallback(() => {
    const id = incognito ? incognitoThreadId : threadId;
    if (!id) return;
    getThread(id).then((r) => {
      setThreadData(r.thread ?? null);
      setThreadJobs(r.jobs ?? []);
    }).catch(() => setThreadJobs([]));
  }, [threadId, incognito, incognitoThreadId]);

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
        let attachmentUrls: string[] = [];
        if (attachments.length > 0) {
          attachmentUrls = await uploadAttachments(attachments.map((a) => a.file));
        }
        const res = await createChat(trimmed || ' ', attachmentUrls.length ? attachmentUrls : undefined, useNormalSession ? undefined : tid ?? undefined, effectiveIncognito);
        setJobId(res.job_id);
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
        const res = await createVideo(trimmed, useNormalSession ? undefined : tid ?? undefined, effectiveIncognito);
        setJobId(res.job_id);
        setPendingJobThreadId(res.thread_id ?? tid ?? null);
        setPendingJobType('video');
        if (res.thread_id) {
          setThreadId(res.thread_id);
          if (effectiveIncognito) setIncognitoThreadId(res.thread_id);
        }
        if (tid) setTimeout(refreshThread, 2000);
      }
      setHasStarted(true);
      setPrompt('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t(locale, 'error.generic'));
    } finally {
      setLoading(false);
    }
  }

  const inputCls = 'w-full rounded-xl border border-theme-border bg-theme-bg-subtle px-4 py-3 text-theme-fg placeholder:text-theme-fg-subtle focus:border-theme-border-strong focus:outline-none focus:ring-1 focus:ring-theme-border-hover';
  const labelCls = 'block text-sm font-medium text-theme-fg-muted mb-1';
  const btnPrimary = 'w-full rounded-xl bg-white py-3 px-4 text-sm font-semibold text-black hover:bg-neutral-100 transition-colors';

  const showPaperclip = hasStarted || mode === 'image';
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
        {(mode === 'image' && referenceImageUrls.length > 0) || attachments.length > 0 ? (
          <>
            {referenceImageUrls.map((url) => (
              <div key={url} className="relative shrink-0">
                <img src={url} alt="" className="w-8 h-8 rounded-full object-cover border border-theme-border" />
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
            {attachments.map((a) => (
              <div key={a.id} className="relative shrink-0">
                <img src={a.previewUrl} alt="" className="w-8 h-8 rounded-full object-cover border border-theme-border" />
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
      </div>
    </>
  );

  const bottomBar = (
    <div className="shrink-0 border-t border-theme-border-subtle bg-theme-bg p-4">
      <form ref={formRef} onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto flex flex-col gap-3">
        {mode === 'image' && hasStarted && (
          <ImageSettingsRow locale={locale} settings={imageSettings} onChange={setImageSettings} />
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
                ? 'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-neutral-500 bg-neutral-700/80 text-white text-sm font-medium transition-all'
                : 'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-neutral-600 bg-neutral-800/60 text-neutral-300 hover:bg-neutral-700/60 hover:text-white hover:border-neutral-500 text-sm font-medium transition-all'
              }
            >
              {m === 'video' && <VideoIcon />}
              {m === 'image' && <ImageIcon />}
              {m === 'chat' && <ChatIcon />}
              {t(locale, `mode.${m}`)}
            </motion.button>
          ))}
        </div>
        {error && <p className="text-sm text-red-400">{error === 'rate' ? t(locale, 'error.rate') : error}</p>}
      </form>
    </div>
  );

  return (
    <div className={`flex-1 flex flex-col min-h-0 ${hasStarted ? '' : 'items-center justify-center overflow-y-auto scrollbar-subtle'} px-4 py-8`}>
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
              {profileError && <p className="text-sm text-red-400">{profileError}</p>}
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
          <form ref={formRef} onSubmit={handleSubmit} className="w-full flex flex-col items-center gap-4">
            {mode === 'image' && (
              <ImageSettingsRow locale={locale} settings={imageSettings} onChange={setImageSettings} />
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
              <div className="rounded-xl border border-theme-border bg-theme-bg-subtle focus-within:border-theme-border-strong focus-within:ring-1 focus-within:ring-theme-border-hover transition-all flex items-center flex-wrap gap-1.5 px-2 py-1.5">
                {mode === 'image' && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="shrink-0 p-2 text-theme-fg-muted hover:text-theme-fg transition-colors"
                    aria-label="Attach image"
                  >
                    <PaperclipIcon className="w-5 h-5" />
                  </button>
                )}
                {attachments.length > 0 ? (
                  <>
                    {attachments.map((a) => (
                      <div key={a.id} className="relative shrink-0">
                        <img src={a.previewUrl} alt="" className="w-8 h-8 rounded-full object-cover border border-theme-border" />
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
                    ? 'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-neutral-500 bg-neutral-700/80 text-white text-sm font-medium transition-all'
                    : 'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-neutral-600 bg-neutral-800/60 text-neutral-300 hover:bg-neutral-700/60 hover:text-white hover:border-neutral-500 text-sm font-medium transition-all'
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
          {error && <p className="mt-4 text-sm text-red-400">{error === 'rate' ? t(locale, 'error.rate') : error}</p>}
          {showPromo && (
            <div className="mt-10 w-full max-w-xl mx-auto relative px-4 py-4 rounded-2xl bg-theme-bg-subtle text-center">
              <button
                type="button"
                onClick={() => setShowPromo(false)}
                className="absolute top-2 right-2 p-1 rounded-full text-theme-fg-subtle hover:text-theme-fg hover:bg-theme-bg-hover transition-colors"
                aria-label="Close"
              >
                <XIcon className="w-4 h-4" />
              </button>
              <p className="text-sm text-theme-fg-muted pr-6">
                {t(locale, 'dashboard.promo')}
              </p>
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
            {[
              ...threadJobs,
              ...(jobId &&
              !threadJobs.some((j) => j.id === jobId) &&
              effectiveThreadId === pendingJobThreadId
                ? [{ id: jobId, type: pendingJobType, input: lastSentPrompt ? { prompt: lastSentPrompt } : {} }]
                : []),
            ].map((job) => (
              <div key={job.id} className="flex flex-col gap-2">
                {((job.type === 'chat') || (job.type === 'image')) && (job.input as { prompt?: string })?.prompt && (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-bl-md px-4 py-2.5 bg-theme-bg-hover text-theme-fg text-[15px] whitespace-pre-wrap leading-relaxed">
                      {(job.input as { prompt: string }).prompt}
                    </div>
                  </div>
                )}
                <JobCard
                  jobId={job.id}
                  locale={locale}
                  dark
                  variant="chat"
                  onNotFound={job.id === jobId ? () => { setJobId(null); setPendingJobThreadId(null); } : undefined}
                  onUseAsReference={addReferenceImage}
                />
              </div>
            ))}
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
