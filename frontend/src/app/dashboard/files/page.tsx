'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';
import { listFiles, deleteFile, getToken, type UserFile } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

export default function FilesPage() {
  const { locale } = useLocale();
  const [files, setFiles] = useState<UserFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingFile, setViewingFile] = useState<UserFile | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchFiles = useCallback(() => {
    setLoading(true);
    listFiles()
      .then((r) => setFiles(r.files ?? []))
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  const handleDelete = async (file: UserFile) => {
    if (!confirm(`Delete "${file.name}"?`)) return;
    setDeleting(file.id);
    try {
      await deleteFile(file.id);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
      if (viewingFile?.id === file.id) setViewingFile(null);
    } catch {}
    setDeleting(null);
  };

  const handleDownload = async (file: UserFile) => {
    const token = await getToken();
    if (!token) return;
    const url = `${API_URL}/api/files/${file.id}?download=1`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name + '.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex-1 min-h-0 flex overflow-hidden">
      {/* Files list */}
      <div className={`flex flex-col min-h-0 overflow-y-auto scrollbar-subtle border-r border-theme-border-subtle transition-all ${viewingFile ? 'w-80 shrink-0' : 'flex-1'} p-4 gap-1`}>
        <div className="flex items-center justify-between mb-4 px-1">
          <h1 className="text-base font-semibold text-theme-fg">{t(locale, 'files.title')}</h1>
          <Link href="/dashboard/seo" className="text-xs text-theme-fg-muted hover:text-theme-fg transition-colors">
            + {t(locale, 'nav.seo')}
          </Link>
        </div>

        {loading && <p className="text-sm text-theme-fg-subtle animate-pulse-subtle px-2 py-4">{t(locale, 'common.loading')}</p>}

        {!loading && files.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-12 text-center px-4">
            <p className="text-sm text-theme-fg-muted">{t(locale, 'files.empty')}</p>
            <Link href="/dashboard/seo" className="btn-tap inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-theme-border-hover bg-theme-bg-hover text-theme-fg text-sm font-medium hover:bg-theme-bg-hover-strong">
              {t(locale, 'nav.seo')}
            </Link>
          </div>
        )}

        {!loading && files.map((file, i) => (
          <motion.button
            key={file.id}
            type="button"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, delay: Math.min(i * 0.02, 0.1) }}
            onClick={() => setViewingFile(viewingFile?.id === file.id ? null : file)}
            className={`btn-tap w-full text-left flex items-start gap-3 px-3 py-3 rounded-xl border transition-colors ${
              viewingFile?.id === file.id
                ? 'bg-theme-bg-hover border-theme-border-hover text-theme-fg'
                : 'border-transparent hover:border-theme-border hover:bg-theme-bg-subtle text-theme-fg-muted hover:text-theme-fg'
            }`}
          >
            <FileIcon type={file.file_type} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-theme-fg truncate">{file.name}</p>
              <p className="text-xs text-theme-fg-subtle mt-0.5">{formatDate(file.created_at)}</p>
            </div>
            <span className={`shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
              file.file_type === 'seo' ? 'bg-theme-bg-hover text-theme-accent' : 'bg-theme-bg-hover text-theme-fg-muted'
            }`}>
              {t(locale, `files.type.${file.file_type}`)}
            </span>
          </motion.button>
        ))}
      </div>

      {/* File viewer */}
      <AnimatePresence>
        {viewingFile && (
          <motion.div
            key={viewingFile.id}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.18 }}
            className="flex-1 min-w-0 flex flex-col min-h-0"
          >
            {/* File header */}
            <div className="shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-b border-theme-border-subtle">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-theme-fg truncate">{viewingFile.name}</p>
                <p className="text-xs text-theme-fg-subtle mt-0.5">{formatDate(viewingFile.created_at)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleDownload(viewingFile)}
                  className="btn-tap inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-theme-border bg-theme-bg-subtle text-theme-fg-muted hover:text-theme-fg hover:bg-theme-bg-hover text-xs font-medium"
                >
                  ↓ {t(locale, 'files.download')}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(viewingFile)}
                  disabled={deleting === viewingFile.id}
                  className="btn-tap inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-theme-border bg-theme-bg-subtle text-theme-danger hover:bg-theme-bg-hover text-xs font-medium disabled:opacity-50"
                >
                  {t(locale, 'files.delete')}
                </button>
                <button type="button" onClick={() => setViewingFile(null)} className="p-1.5 text-theme-fg-subtle hover:text-theme-fg rounded-lg hover:bg-theme-bg-hover transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            {/* File content */}
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-subtle px-6 py-5">
              <pre className="text-sm text-theme-fg-muted font-mono whitespace-pre-wrap leading-relaxed break-words">{viewingFile.content}</pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FileIcon({ type }: { type: string }) {
  if (type === 'seo') {
    return (
      <svg className="w-5 h-5 shrink-0 mt-0.5 text-theme-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      </svg>
    );
  }
  return (
    <svg className="w-5 h-5 shrink-0 mt-0.5 text-theme-fg-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}
