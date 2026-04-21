'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useLocale } from '@/app/components/LocaleContext';
import { useToast } from '@/app/components/ToastContext';
import { t } from '@/lib/i18n';
import {
  getChatProject,
  updateChatProject,
  deleteChatProject,
  uploadAndAttachChatProjectFiles,
  deleteChatProjectFile,
  type ChatProject,
  type ChatProjectFile,
  type Thread,
} from '@/lib/api';
import { ConfirmDialog } from '@/components/ConfirmDialog';

export default function ChatProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const router = useRouter();
  const { locale } = useLocale();
  const { showToast } = useToast();

  const [project, setProject] = useState<ChatProject | null>(null);
  const [files, setFiles] = useState<ChatProjectFile[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingInstructions, setEditingInstructions] = useState(false);
  const [draftInstructions, setDraftInstructions] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);

  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const r = await getChatProject(id);
      setProject(r.project);
      setFiles(r.files ?? []);
      setThreads(r.threads ?? []);
      setDraftInstructions(r.project.instructions ?? '');
      setDraftName(r.project.name ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const saveInstructions = async () => {
    if (!project) return;
    setSavingMeta(true);
    try {
      const updated = await updateChatProject(project.id, { instructions: draftInstructions.trim() });
      setProject(updated);
      setEditingInstructions(false);
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

  const startNewChat = (preset?: string) => {
    if (!project) return;
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('flipo5_pending_chat_project', project.id);
      if (preset) sessionStorage.setItem('flipo5_pending_chat_prefill', preset);
    }
    router.push('/dashboard?new=1');
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

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-subtle p-4 md:p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-4">
          <Link href="/dashboard/projects" className="text-sm text-theme-fg-muted hover:text-theme-fg">
            ← {t(locale, 'nav.projects')}
          </Link>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="text-xs text-theme-fg-subtle hover:text-theme-danger"
          >
            {t(locale, 'common.delete')}
          </button>
        </div>

        {editingName ? (
          <div className="flex items-center gap-2 mb-1">
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveName();
                if (e.key === 'Escape') {
                  setDraftName(project.name);
                  setEditingName(false);
                }
              }}
              className="flex-1 rounded-xl border border-theme-border bg-theme-bg-subtle text-theme-fg text-lg font-semibold px-3 py-2 focus:outline-none focus:border-theme-border-hover"
            />
            <button
              type="button"
              onClick={saveName}
              disabled={savingMeta || !draftName.trim()}
              className="btn-tap px-3 py-2 rounded-xl text-sm font-semibold bg-white text-black disabled:opacity-50"
            >
              {t(locale, 'common.save')}
            </button>
          </div>
        ) : (
          <h1
            className="font-display text-2xl font-bold text-theme-fg mb-1 cursor-text"
            onClick={() => setEditingName(true)}
            title={t(locale, 'common.edit')}
          >
            {project.name}
          </h1>
        )}

        <p className="text-xs text-theme-fg-subtle mb-6">
          {t(locale, 'chatProjects.statThreads').replace('{n}', String(project.thread_count))}
          {' · '}
          {t(locale, 'chatProjects.statFiles').replace('{n}', String(project.file_count))}
        </p>

        {error && <p className="text-sm text-theme-danger mb-3">{error}</p>}

        {/* Instructions card */}
        <section className="rounded-2xl border border-theme-border bg-theme-bg-subtle p-4 md:p-5 mb-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-theme-fg flex items-center gap-2">
              <CardIcon className="w-4 h-4 text-theme-accent" />
              {t(locale, 'chatProjects.instructions')}
            </h2>
            {!editingInstructions ? (
              <button
                type="button"
                onClick={() => {
                  setDraftInstructions(project.instructions);
                  setEditingInstructions(true);
                }}
                className="btn-tap px-3 py-1.5 rounded-lg text-xs font-medium border border-theme-border bg-theme-bg text-theme-fg hover:bg-theme-bg-hover"
              >
                {t(locale, 'common.edit')}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDraftInstructions(project.instructions);
                    setEditingInstructions(false);
                  }}
                  className="btn-tap px-3 py-1.5 rounded-lg text-xs font-medium border border-theme-border text-theme-fg-muted hover:text-theme-fg"
                >
                  {t(locale, 'common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={saveInstructions}
                  disabled={savingMeta}
                  className="btn-tap px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-black disabled:opacity-50"
                >
                  {t(locale, 'common.save')}
                </button>
              </div>
            )}
          </div>
          {editingInstructions ? (
            <textarea
              value={draftInstructions}
              onChange={(e) => setDraftInstructions(e.target.value.slice(0, 4000))}
              rows={6}
              placeholder={t(locale, 'chatProjects.instructionsPlaceholder')}
              className="w-full rounded-xl border border-theme-border bg-theme-bg text-theme-fg text-sm px-3 py-2.5 focus:outline-none focus:border-theme-border-hover resize-none scrollbar-subtle"
            />
          ) : project.instructions ? (
            <p className="text-sm text-theme-fg/90 whitespace-pre-wrap leading-relaxed">{project.instructions}</p>
          ) : (
            <p className="text-sm text-theme-fg-subtle italic">{t(locale, 'chatProjects.instructionsEmpty')}</p>
          )}
        </section>

        {/* Sources card */}
        <section className="rounded-2xl border border-theme-border bg-theme-bg-subtle p-4 md:p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-theme-fg flex items-center gap-2">
              <FolderIcon className="w-4 h-4 text-theme-accent" />
              {t(locale, 'chatProjects.sources')}
            </h2>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="btn-tap min-h-9 min-w-9 rounded-lg border border-theme-border bg-theme-bg text-theme-fg hover:bg-theme-bg-hover disabled:opacity-50 flex items-center justify-center"
              aria-label={t(locale, 'chatProjects.addFiles')}
            >
              {uploading ? (
                <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
              ) : (
                <PlusIcon className="w-4 h-4" />
              )}
            </button>
          </div>
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
            <ul className="rounded-xl border border-theme-border divide-y divide-theme-border bg-theme-bg">
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
        </section>

        {/* Conversations + CTA */}
        <section className="rounded-2xl border border-theme-border bg-theme-bg-subtle p-4 md:p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-theme-fg flex items-center gap-2">
              <ChatIcon className="w-4 h-4 text-theme-accent" />
              {t(locale, 'chatProjects.conversations')}
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => startNewChat()}
                className="btn-tap px-3 py-1.5 rounded-lg text-xs font-medium border border-theme-border bg-theme-bg text-theme-fg hover:bg-theme-bg-hover"
              >
                {t(locale, 'chatProjects.askQuestion')}
              </button>
              <button
                type="button"
                onClick={() => startNewChat(t(locale, 'chatProjects.helpPrefill'))}
                className="btn-tap px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-black"
              >
                {t(locale, 'chatProjects.helpTask')}
              </button>
            </div>
          </div>
          {threads.length === 0 ? (
            <p className="text-sm text-theme-fg-subtle py-4 text-center italic">{t(locale, 'chatProjects.conversationsEmpty')}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {threads.map((thr) => (
                <li key={thr.id}>
                  <Link
                    href={`/dashboard?thread=${thr.id}`}
                    className="block px-3 py-2 rounded-lg text-sm text-theme-fg-muted hover:bg-theme-bg-hover hover:text-theme-fg transition-colors truncate"
                  >
                    {thr.title || t(locale, 'chatProjects.untitledThread')}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

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
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026M3.75 9.776A2.25 2.25 0 001.5 12.026v6.224a2.25 2.25 0 002.25 2.25h16.5a2.25 2.25 0 002.25-2.25v-6.224a2.25 2.25 0 00-2.25-2.25M3.75 9.776V6A2.25 2.25 0 016 3.75h12A2.25 2.25 0 0120.25 6v3.776" />
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
