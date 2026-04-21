'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocale } from '@/app/components/LocaleContext';
import { useToast } from '@/app/components/ToastContext';
import { t } from '@/lib/i18n';
import { createChatProject, uploadAndAttachChatProjectFiles, type ChatProject } from '@/lib/api';

type Step = 'meta' | 'sources';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (project: ChatProject) => void;
}

export function CreateChatProjectDialog({ open, onClose, onCreated }: Props) {
  const { locale } = useLocale();
  const { showToast } = useToast();
  const [step, setStep] = useState<Step>('meta');
  const [name, setName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setStep('meta');
      setName('');
      setInstructions('');
      setFiles([]);
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const canNext = name.trim().length > 0;

  const goNext = () => {
    if (!canNext) return;
    setError(null);
    setStep('sources');
  };

  const handleAddFiles = (selected: FileList | File[] | null) => {
    if (!selected) return;
    const arr = Array.isArray(selected) ? selected : Array.from(selected);
    setFiles((prev) => [...prev, ...arr]);
  };

  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const submit = async (withFiles: boolean) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const project = await createChatProject(name.trim(), instructions.trim());
      if (withFiles && files.length > 0) {
        await uploadAndAttachChatProjectFiles(project.id, files);
      }
      showToast('chatProjects.createdToast');
      onCreated?.(project);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
        onClick={() => !submitting && onClose()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.15 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md rounded-2xl border border-theme-border bg-theme-bg shadow-xl overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-theme-border flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <ProjectIcon className="w-5 h-5 text-theme-accent shrink-0" />
              <h3 className="text-base font-semibold text-theme-fg truncate">
                {step === 'meta' ? t(locale, 'chatProjects.dialogTitleMeta') : t(locale, 'chatProjects.dialogTitleSources')}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => !submitting && onClose()}
              className="p-2 -m-2 rounded-lg text-theme-fg-muted hover:text-theme-fg hover:bg-theme-bg-hover"
              aria-label={t(locale, 'common.close')}
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>

          {step === 'meta' && (
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-theme-fg-muted mb-1.5">
                  {t(locale, 'chatProjects.fieldName')}
                </label>
                <input
                  autoFocus
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 200))}
                  placeholder={t(locale, 'chatProjects.namePlaceholder')}
                  className="w-full rounded-xl border border-theme-border bg-theme-bg-subtle text-theme-fg text-sm px-3 py-2.5 focus:outline-none focus:border-theme-border-hover"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-theme-fg-muted mb-1.5">
                  {t(locale, 'chatProjects.fieldInstructions')}
                </label>
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value.slice(0, 4000))}
                  placeholder={t(locale, 'chatProjects.instructionsPlaceholder')}
                  rows={5}
                  className="w-full rounded-xl border border-theme-border bg-theme-bg-subtle text-theme-fg text-sm px-3 py-2.5 focus:outline-none focus:border-theme-border-hover resize-none scrollbar-subtle"
                />
                <p className="text-xs text-theme-fg-subtle mt-1">{instructions.length} / 4000</p>
              </div>
              {error && <p className="text-sm text-theme-danger">{error}</p>}
            </div>
          )}

          {step === 'sources' && (
            <div className="px-5 py-4 space-y-4">
              <p className="text-sm text-theme-fg-muted">{t(locale, 'chatProjects.sourcesDesc')}</p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-theme-fg-muted">
                  {t(locale, 'chatProjects.files')} {files.length > 0 ? `(${files.length})` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-tap min-h-9 min-w-9 rounded-lg border border-theme-border bg-theme-bg-hover text-theme-fg hover:bg-theme-bg-hover-strong flex items-center justify-center"
                  aria-label={t(locale, 'chatProjects.addFiles')}
                >
                  <PlusIcon className="w-4 h-4" />
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.txt,.doc,.docx,.csv"
                multiple
                className="hidden"
                onChange={(e) => {
                  handleAddFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files?.length) handleAddFiles(e.dataTransfer.files);
                }}
                className="rounded-xl border-2 border-dashed border-theme-border hover:border-theme-border-hover p-6 text-center"
              >
                <CloudUpIcon className="w-7 h-7 mx-auto text-theme-fg-subtle mb-2" />
                <p className="text-sm text-theme-fg">{t(locale, 'chatProjects.dropFiles')}</p>
                <p className="text-xs text-theme-fg-subtle mt-1">{t(locale, 'chatProjects.orUseButton')}</p>
              </div>
              {files.length > 0 && (
                <ul className="rounded-xl border border-theme-border divide-y divide-theme-border bg-theme-bg-subtle">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center gap-2 px-3 py-2">
                      <FileIcon className="w-4 h-4 shrink-0 text-theme-fg-subtle" />
                      <span className="text-sm text-theme-fg truncate flex-1">{f.name}</span>
                      <span className="text-xs text-theme-fg-subtle shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="p-1 rounded-md text-theme-fg-subtle hover:text-theme-danger hover:bg-theme-bg-hover"
                        aria-label={t(locale, 'common.remove')}
                      >
                        <XIcon className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {error && <p className="text-sm text-theme-danger">{error}</p>}
            </div>
          )}

          <div className="px-5 py-4 border-t border-theme-border flex items-center justify-between gap-3">
            {step === 'meta' ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="btn-tap px-4 py-2 rounded-xl text-sm font-medium border border-theme-border text-theme-fg-muted hover:text-theme-fg hover:bg-theme-bg-hover disabled:opacity-50"
                >
                  {t(locale, 'common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={!canNext}
                  className="btn-tap px-4 py-2 rounded-xl text-sm font-semibold bg-white text-black disabled:opacity-50"
                >
                  {t(locale, 'common.next')}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => submit(false)}
                  disabled={submitting}
                  className="btn-tap px-3 py-2 rounded-xl text-sm font-medium text-theme-fg-muted hover:text-theme-fg disabled:opacity-50"
                >
                  {t(locale, 'chatProjects.addLater')}
                </button>
                <button
                  type="button"
                  onClick={() => submit(true)}
                  disabled={submitting}
                  className="btn-tap px-4 py-2 rounded-xl text-sm font-semibold bg-white text-black disabled:opacity-50 flex items-center gap-2"
                >
                  {submitting && <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />}
                  {t(locale, 'chatProjects.create')}
                </button>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
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
function CloudUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 12.75V18m0-5.25-2.25 2.25M12 12.75l2.25 2.25" />
    </svg>
  );
}
function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5A3.375 3.375 0 0010.125 2.25H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}
function ProjectIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
    </svg>
  );
}
