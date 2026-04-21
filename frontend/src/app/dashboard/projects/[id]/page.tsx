'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocale } from '@/app/components/LocaleContext';
import { useToast } from '@/app/components/ToastContext';
import { t } from '@/lib/i18n';
import {
  getChatProject,
  updateChatProject,
  deleteChatProject,
  uploadAndAttachChatProjectFiles,
  deleteChatProjectFile,
  createChat,
  getThread,
  type ChatProject,
  type ChatProjectFile,
  type Thread,
  type Job,
} from '@/lib/api';
import { ConfirmDialog } from '@/components/ConfirmDialog';

const JobCard = dynamic(
  () => import('../../components/JobCard').then((m) => ({ default: m.JobCard })),
  {
    ssr: false,
    loading: () => (
      <div className="max-w-[min(85vw,680px)] rounded-2xl rounded-tl-md bg-theme-bg-subtle px-4 py-8 min-h-[100px] animate-pulse-subtle" aria-hidden />
    ),
  },
);

type DisplayJob = Job | { id: '_pending'; type: 'chat'; status: 'pending'; input: { prompt: string }; output: null; error: null; user_id: string; thread_id: string | null; cost_cents: 0; created_at: string; updated_at: string };

export default function ChatProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id ?? '';
  const router = useRouter();
  const { locale } = useLocale();
  const { showToast } = useToast();

  // Project meta
  const [project, setProject] = useState<ChatProject | null>(null);
  const [files, setFiles] = useState<ChatProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit name + instructions + delete
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftInstructions, setDraftInstructions] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showInstructionsDialog, setShowInstructionsDialog] = useState(false);
  const [showSourcesDialog, setShowSourcesDialog] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Chat state — a project has ONE conversation. We always use the most recent thread linked to it.
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [threadJobs, setThreadJobs] = useState<Job[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [pendingUserMessage, setPendingUserMessage] = useState<string>('');
  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Load project meta + files. Also auto-pick the single thread of this project.
  const loadProjectMeta = useCallback(async () => {
    if (!projectId) return;
    try {
      const r = await getChatProject(projectId);
      setProject(r.project);
      setFiles(r.files ?? []);
      setDraftInstructions(r.project.instructions ?? '');
      setDraftName(r.project.name ?? '');
      // A project is ONE conversation: use the most recent thread linked to it, if any.
      const threads = r.threads ?? [];
      if (threads.length > 0) {
        setCurrentThreadId((prev) => prev ?? threads[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }, [projectId]);

  useEffect(() => {
    setLoading(true);
    loadProjectMeta().finally(() => setLoading(false));
  }, [loadProjectMeta]);

  // Load thread jobs when currentThreadId changes
  useEffect(() => {
    if (!currentThreadId) {
      setThreadJobs([]);
      setActiveJobId(null);
      setPendingUserMessage('');
      return;
    }
    let cancelled = false;
    setThreadLoading(true);
    getThread(currentThreadId)
      .then((r) => {
        if (cancelled) return;
        setThreadJobs(r.jobs ?? []);
      })
      .catch(() => {
        if (!cancelled) setThreadJobs([]);
      })
      .finally(() => {
        if (!cancelled) setThreadLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentThreadId]);

  // Refresh thread list (left sidebar) when an active job lands
  const refreshThread = useCallback(() => {
    if (!currentThreadId) return;
    getThread(currentThreadId)
      .then((r) => setThreadJobs(r.jobs ?? []))
      .catch(() => {});
  }, [currentThreadId]);

  // Light polling while a job is pending and not yet in threadJobs
  useEffect(() => {
    if (!activeJobId) return;
    if (threadJobs.some((j) => j.id === activeJobId)) {
      setActiveJobId(null);
      setPendingUserMessage('');
      // Refresh meta so left list updates thread counts
      loadProjectMeta();
      return;
    }
    const iv = setInterval(() => {
      refreshThread();
    }, 1500);
    return () => clearInterval(iv);
  }, [activeJobId, threadJobs, refreshThread, loadProjectMeta]);

  // Auto-scroll chat to bottom on new content
  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
  }, [threadJobs.length, pendingUserMessage, currentThreadId]);

  // Display list with optimistic pending user message
  const displayList = useMemo<DisplayJob[]>(() => {
    const list: DisplayJob[] = [...threadJobs];
    if (
      pendingUserMessage &&
      !list.some(
        (j) =>
          j.type === 'chat' &&
          (j.input as { prompt?: string })?.prompt === pendingUserMessage,
      )
    ) {
      list.push({
        id: '_pending',
        type: 'chat',
        status: 'pending',
        input: { prompt: pendingUserMessage },
        output: null,
        error: null,
        user_id: '',
        thread_id: currentThreadId,
        cost_cents: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    return list;
  }, [threadJobs, pendingUserMessage, currentThreadId]);

  // ----- Project meta actions -----
  const saveInstructions = async () => {
    if (!project) return;
    setSavingMeta(true);
    try {
      const updated = await updateChatProject(project.id, { instructions: draftInstructions.trim() });
      setProject(updated);
      setShowInstructionsDialog(false);
      showToast('toast.saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSavingMeta(false);
    }
  };

  const saveName = async () => {
    if (!project || !draftName.trim()) return;
    setSavingMeta(true);
    try {
      const updated = await updateChatProject(project.id, { name: draftName.trim() });
      setProject(updated);
      setEditingName(false);
      showToast('toast.saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSavingMeta(false);
    }
  };

  const handleFiles = async (selected: FileList | null) => {
    if (!selected || selected.length === 0 || !project) return;
    setUploading(true);
    try {
      const arr = Array.from(selected);
      const added = await uploadAndAttachChatProjectFiles(project.id, arr);
      setFiles((prev) => [...added, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const removeFile = async (fileId: string) => {
    try {
      await deleteChatProjectFile(fileId);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const handleDeleteProject = async () => {
    if (!project) return;
    try {
      await deleteChatProject(project.id);
      showToast('toast.deleted');
      router.push('/dashboard/projects');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  };

  // ----- Chat send -----
  const handleSend = async () => {
    const msg = prompt.trim();
    if (!project || !msg || sending) return;
    setSending(true);
    setError(null);
    setPendingUserMessage(msg);
    setPrompt('');
    try {
      const res = await createChat(
        msg,
        undefined,
        currentThreadId ?? undefined,
        false,
        undefined,
        currentThreadId ? undefined : project.id, // attach project only when creating the first thread
      );
      setActiveJobId(res.job_id);
      if (res.thread_id && res.thread_id !== currentThreadId) {
        setCurrentThreadId(res.thread_id);
      }
    } catch (e) {
      setPendingUserMessage('');
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSending(false);
      requestAnimationFrame(() => composerRef.current?.focus());
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="text-theme-fg-subtle animate-pulse-subtle">{t(locale, 'common.loading')}</p>
      </div>
    );
  }
  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="text-theme-fg-muted">{error ?? t(locale, 'common.failed')}</p>
      </div>
    );
  }

  const hasMessages = displayList.length > 0;

  return (
    <div className="flex-1 min-h-0 flex overflow-hidden">
      {/* Project sidebar */}
      {sidebarCollapsed ? (
        <div className="shrink-0 border-r border-theme-border bg-theme-bg flex flex-col items-center py-3 gap-2 w-12">
          <button
            type="button"
            onClick={() => setSidebarCollapsed(false)}
            className="p-2 rounded-md text-theme-fg-muted hover:text-theme-fg hover:bg-theme-bg-hover"
            aria-label={t(locale, 'chatProjects.expandSidebar')}
            title={project.name}
          >
            <PanelOpenIcon className="w-5 h-5" />
          </button>
        </div>
      ) : (
        <aside className="shrink-0 w-72 border-r border-theme-border bg-theme-bg flex flex-col min-h-0">
          {/* Header */}
          <div className="px-3 py-3 border-b border-theme-border flex items-center justify-between gap-2 min-h-[52px]">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <ProjectIcon className="w-4 h-4 shrink-0 text-theme-accent" />
              {editingName ? (
                <input
                  autoFocus
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={saveName}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') {
                      setDraftName(project.name);
                      setEditingName(false);
                    }
                  }}
                  className="flex-1 min-w-0 rounded-md border border-theme-border-hover bg-theme-bg text-theme-fg text-sm font-semibold px-2 py-1 focus:outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingName(true)}
                  className="flex-1 min-w-0 text-left text-sm font-semibold text-theme-fg truncate hover:text-theme-accent"
                  title={t(locale, 'common.edit')}
                >
                  {project.name}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="p-1.5 rounded-md text-theme-fg-subtle hover:text-theme-danger hover:bg-theme-bg-hover"
              aria-label={t(locale, 'common.delete')}
              title={t(locale, 'common.delete')}
            >
              <TrashIcon className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setSidebarCollapsed(true)}
              className="p-1.5 rounded-md text-theme-fg-subtle hover:text-theme-fg hover:bg-theme-bg-hover"
              aria-label={t(locale, 'chatProjects.collapseSidebar')}
              title={t(locale, 'chatProjects.collapseSidebar')}
            >
              <PanelCloseIcon className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-subtle p-3 space-y-2">
            {/* Instructions card */}
            <button
              type="button"
              onClick={() => {
                setDraftInstructions(project.instructions);
                setShowInstructionsDialog(true);
              }}
              className="w-full text-left rounded-xl border border-theme-border bg-theme-bg p-3 hover:bg-theme-bg-hover transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <CardIcon className="w-4 h-4 text-theme-accent shrink-0" />
                <span className="text-sm font-semibold text-theme-fg">{t(locale, 'chatProjects.instructions')}</span>
              </div>
              <p className="text-xs text-theme-fg-muted line-clamp-2">
                {project.instructions || t(locale, 'chatProjects.instructionsHint')}
              </p>
            </button>

            {/* Sources card */}
            <button
              type="button"
              onClick={() => setShowSourcesDialog(true)}
              className="w-full text-left rounded-xl border border-theme-border bg-theme-bg p-3 hover:bg-theme-bg-hover transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <DatabaseIcon className="w-4 h-4 text-theme-accent shrink-0" />
                <span className="text-sm font-semibold text-theme-fg">{t(locale, 'chatProjects.sources')}</span>
              </div>
              <p className="text-xs text-theme-fg-muted">{t(locale, 'chatProjects.sourcesHint')}</p>
              <div className="mt-2 flex items-center gap-2 text-[11px] text-theme-fg-subtle">
                <FolderIcon className="w-3.5 h-3.5" />
                <span>{t(locale, 'chatProjects.ownFiles')}</span>
                <span className="ml-auto">{files.length}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </button>

          </div>
        </aside>
      )}

      {/* Right: chat */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div ref={chatScrollRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-subtle">
          {!hasMessages ? (
            <div className="h-full flex items-center justify-center px-4">
              <div className="max-w-md text-center">
                <h2 className="font-display text-xl font-bold text-theme-fg mb-2">
                  {t(locale, 'chatProjects.startConversation')}
                </h2>
                <p className="text-sm text-theme-fg-muted mb-6">{t(locale, 'chatProjects.startConversationSub')}</p>
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => composerRef.current?.focus()}
                    className="btn-tap px-4 py-2 rounded-full text-sm font-medium border border-theme-border bg-theme-bg text-theme-fg hover:bg-theme-bg-hover"
                  >
                    {t(locale, 'chatProjects.askQuestion')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPrompt(t(locale, 'chatProjects.helpPrefill'));
                      composerRef.current?.focus();
                    }}
                    className="btn-tap px-4 py-2 rounded-full text-sm font-medium border border-theme-border bg-theme-bg text-theme-fg hover:bg-theme-bg-hover"
                  >
                    {t(locale, 'chatProjects.helpTask')}
                  </button>
                </div>
                {error && <p className="text-sm text-theme-danger mt-4">{error}</p>}
              </div>
            </div>
          ) : (
            <div className="w-full max-w-2xl mx-auto px-4 py-4 flex flex-col gap-3">
              {threadLoading && <p className="text-sm text-theme-fg-subtle">{t(locale, 'common.loading')}</p>}
              <AnimatePresence initial={false}>
                {displayList.map((job) => {
                  const userPrompt = (job.input as { prompt?: string })?.prompt;
                  return (
                    <motion.div
                      key={job.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      className="flex flex-col gap-2"
                    >
                      {userPrompt && (
                        <div className="flex justify-end">
                          <div className="max-w-[85%] rounded-2xl rounded-bl-md px-4 py-2.5 bg-theme-bg-hover text-theme-fg text-[15px] whitespace-pre-wrap leading-relaxed">
                            {userPrompt}
                          </div>
                        </div>
                      )}
                      {job.id !== '_pending' && (
                        <JobCard jobId={job.id} locale={locale} dark variant="chat" />
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              {error && <p className="text-sm text-theme-danger">{error}</p>}
            </div>
          )}
        </div>

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="shrink-0 border-t border-theme-border bg-theme-bg p-3"
        >
          <div className="max-w-2xl mx-auto rounded-xl border border-theme-border bg-theme-bg-subtle flex items-end gap-2 px-3 py-2">
            <textarea
              ref={composerRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                if (e.shiftKey) return;
                if ((e.nativeEvent as KeyboardEvent).isComposing) return;
                e.preventDefault();
                if (!sending) handleSend();
              }}
              placeholder={t(locale, 'chatProjects.composerPlaceholder')}
              rows={1}
              disabled={sending}
              className="flex-1 min-w-0 px-1 py-2 bg-transparent text-theme-fg placeholder:text-theme-fg-subtle focus:outline-none resize-none max-h-40 scrollbar-subtle disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={sending || !prompt.trim()}
              className="shrink-0 min-h-9 min-w-9 rounded-full bg-white text-black hover:bg-neutral-200 transition-colors flex items-center justify-center disabled:opacity-40"
              aria-label={t(locale, 'chatProjects.send')}
              title={t(locale, 'chatProjects.send')}
            >
              {sending ? (
                <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
              ) : (
                <ArrowUpIcon className="w-4 h-4" />
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Instructions dialog */}
      {showInstructionsDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={() => !savingMeta && setShowInstructionsDialog(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-theme-border bg-theme-bg shadow-xl"
          >
            <div className="px-5 py-4 border-b border-theme-border flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-theme-fg">{t(locale, 'chatProjects.instructions')}</h3>
              <button
                type="button"
                onClick={() => !savingMeta && setShowInstructionsDialog(false)}
                className="p-2 -m-2 rounded-lg text-theme-fg-muted hover:text-theme-fg hover:bg-theme-bg-hover"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              <textarea
                value={draftInstructions}
                onChange={(e) => setDraftInstructions(e.target.value.slice(0, 4000))}
                rows={8}
                placeholder={t(locale, 'chatProjects.instructionsPlaceholder')}
                className="w-full rounded-xl border border-theme-border bg-theme-bg-subtle text-theme-fg text-sm px-3 py-2.5 focus:outline-none focus:border-theme-border-hover resize-none scrollbar-subtle"
              />
              <p className="text-xs text-theme-fg-subtle mt-1">{draftInstructions.length} / 4000</p>
            </div>
            <div className="px-5 py-4 border-t border-theme-border flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraftInstructions(project.instructions);
                  setShowInstructionsDialog(false);
                }}
                className="btn-tap px-4 py-2 rounded-xl text-sm font-medium border border-theme-border text-theme-fg-muted hover:text-theme-fg hover:bg-theme-bg-hover"
              >
                {t(locale, 'common.cancel')}
              </button>
              <button
                type="button"
                onClick={saveInstructions}
                disabled={savingMeta}
                className="btn-tap px-4 py-2 rounded-xl text-sm font-semibold bg-white text-black disabled:opacity-50"
              >
                {savingMeta ? t(locale, 'common.saving') : t(locale, 'common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sources dialog */}
      {showSourcesDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={() => setShowSourcesDialog(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-theme-border bg-theme-bg shadow-xl"
          >
            <div className="px-5 py-4 border-b border-theme-border flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-theme-fg">{t(locale, 'chatProjects.sources')}</h3>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="btn-tap min-h-9 min-w-9 rounded-lg border border-theme-border bg-theme-bg-hover text-theme-fg hover:bg-theme-bg-hover-strong disabled:opacity-50 flex items-center justify-center"
                  aria-label={t(locale, 'chatProjects.addFiles')}
                >
                  {uploading ? (
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  ) : (
                    <PlusIcon className="w-4 h-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSourcesDialog(false)}
                  className="p-2 -m-2 rounded-lg text-theme-fg-muted hover:text-theme-fg hover:bg-theme-bg-hover"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="px-5 py-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.txt,.doc,.docx,.csv"
                multiple
                className="hidden"
                onChange={(e) => {
                  handleFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              {files.length === 0 ? (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleFiles(e.dataTransfer.files);
                  }}
                  className="rounded-xl border-2 border-dashed border-theme-border p-6 text-center text-sm text-theme-fg-subtle"
                >
                  {t(locale, 'chatProjects.sourcesEmpty')}
                </div>
              ) : (
                <ul className="rounded-xl border border-theme-border divide-y divide-theme-border bg-theme-bg-subtle">
                  {files.map((f) => (
                    <li key={f.id} className="flex items-center gap-2 px-3 py-2">
                      <FileSmallIcon className="w-4 h-4 shrink-0 text-theme-fg-subtle" />
                      <span className="text-sm text-theme-fg truncate flex-1">{f.file_name || 'file'}</span>
                      {f.size_bytes ? (
                        <span className="text-xs text-theme-fg-subtle shrink-0">{Math.round(f.size_bytes / 1024)} KB</span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => removeFile(f.id)}
                        className="p-1 rounded-md text-theme-fg-subtle hover:text-theme-danger hover:bg-theme-bg-hover"
                        aria-label={t(locale, 'common.remove')}
                      >
                        <XIcon className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={t(locale, 'chatProjects.deleteTitle')}
        message={t(locale, 'chatProjects.deleteMessage')}
        confirmLabel={t(locale, 'common.delete')}
        cancelLabel={t(locale, 'common.cancel')}
        confirmClass="bg-theme-danger-muted text-theme-danger hover:bg-theme-danger-muted"
        onConfirm={() => {
          setConfirmDelete(false);
          handleDeleteProject();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}
function CardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  );
}
function DatabaseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6m-16 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
    </svg>
  );
}
function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
    </svg>
  );
}
function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
    </svg>
  );
}
function FileSmallIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5A3.375 3.375 0 0010.125 2.25H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}
function ProjectIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}
function PanelCloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.7}>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path strokeLinecap="round" d="M9 4.5v15M14 9l-3 3 3 3" />
    </svg>
  );
}
function PanelOpenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.7}>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path strokeLinecap="round" d="M9 4.5v15M11 9l3 3-3 3" />
    </svg>
  );
}
function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0V4.875c0-1.035-.84-1.875-1.875-1.875h-3.75c-1.035 0-1.875.84-1.875 1.875v.518" />
    </svg>
  );
}
function ChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}
function ArrowUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 11l7-7m0 0l7 7m-7-7v18" />
    </svg>
  );
}
