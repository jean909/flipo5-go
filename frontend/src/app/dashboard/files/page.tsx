'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';
import { listFiles, deleteFile, renameFile, getToken, type UserFile } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return iso; }
}

function FileIcon({ type }: { type: string }) {
  if (type === 'seo') {
    return (
      <svg className="w-4 h-4 shrink-0 text-theme-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4 shrink-0 text-theme-fg-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

export default function FilesPage() {
  const { locale } = useLocale();
  const [files, setFiles] = useState<UserFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingFile, setViewingFile] = useState<UserFile | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'seo' | 'text'>('all');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const fetchFiles = useCallback(() => {
    setLoading(true);
    listFiles()
      .then((r) => setFiles(r.files ?? []))
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  const filtered = useMemo(() => {
    let list = files;
    if (typeFilter !== 'all') list = list.filter((f) => f.file_type === typeFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((f) => f.name.toLowerCase().includes(q) || f.content.toLowerCase().includes(q));
    }
    return list;
  }, [files, typeFilter, search]);

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
    const res = await fetch(`${API_URL}/api/files/${file.id}?download=1`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name + '.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const startRename = (file: UserFile) => {
    setRenamingId(file.id);
    setRenameValue(file.name);
  };

  const commitRename = async (file: UserFile) => {
    const name = renameValue.trim();
    if (!name || name === file.name) { setRenamingId(null); return; }
    try {
      await renameFile(file.id, name);
      setFiles((prev) => prev.map((f) => f.id === file.id ? { ...f, name } : f));
      if (viewingFile?.id === file.id) setViewingFile((v) => v ? { ...v, name } : v);
    } catch {}
    setRenamingId(null);
  };

  return (
    <div className="flex-1 min-h-0 flex overflow-hidden">
      {/* Files list */}
      <div className={`flex flex-col min-h-0 border-r border-theme-border-subtle transition-all ${viewingFile ? 'w-72 shrink-0' : 'flex-1'}`}>
        {/* Toolbar */}
        <div className="shrink-0 flex flex-col gap-2 px-4 pt-4 pb-3 border-b border-theme-border-subtle">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-semibold text-theme-fg">{t(locale, 'files.title')}</h1>
            <div className="flex items-center gap-1.5">
              <Link href="/dashboard/seo" className="text-xs text-theme-fg-muted hover:text-theme-fg transition-colors px-2 py-1 rounded hover:bg-theme-bg-hover">SEO</Link>
              <Link href="/dashboard/outline" className="text-xs text-theme-fg-muted hover:text-theme-fg transition-colors px-2 py-1 rounded hover:bg-theme-bg-hover">Outline</Link>
              <Link href="/dashboard/translations" className="text-xs text-theme-fg-muted hover:text-theme-fg transition-colors px-2 py-1 rounded hover:bg-theme-bg-hover">Translations</Link>
            </div>
          </div>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-theme-fg-subtle pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={t(locale, 'files.search')}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-theme-border bg-theme-bg-subtle text-theme-fg text-xs placeholder:text-theme-fg-subtle focus:outline-none focus:border-theme-border-hover" />
          </div>
          <div className="flex gap-1">
            {(['all', 'seo', 'text'] as const).map((type) => (
              <button key={type} type="button" onClick={() => setTypeFilter(type)}
                className={`btn-tap px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize ${typeFilter === type ? 'bg-theme-bg-hover text-theme-fg' : 'text-theme-fg-muted hover:text-theme-fg'}`}>
                {type === 'all' ? `All (${files.length})` : type === 'seo' ? `SEO (${files.filter(f => f.file_type === 'seo').length})` : `Text (${files.filter(f => f.file_type === 'text').length})`}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-subtle p-2">
          {loading && <p className="text-sm text-theme-fg-subtle animate-pulse-subtle px-3 py-4">{t(locale, 'common.loading')}</p>}
          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-10 text-center px-4">
              <p className="text-sm text-theme-fg-muted">{search ? 'No results.' : t(locale, 'files.empty')}</p>
              {!search && <Link href="/dashboard/seo" className="btn-tap inline-flex px-4 py-2 rounded-xl border border-theme-border-hover bg-theme-bg-hover text-theme-fg text-xs font-medium">SEO Tool</Link>}
            </div>
          )}

          {filtered.map((file, i) => (
            <motion.div key={file.id} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.13, delay: Math.min(i * 0.02, 0.08) }}>
              {renamingId === file.id ? (
                <div className="px-3 py-2 flex items-center gap-2">
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitRename(file); if (e.key === 'Escape') setRenamingId(null); }}
                    onBlur={() => commitRename(file)}
                    className="flex-1 min-w-0 text-sm text-theme-fg bg-theme-bg border border-theme-border-hover rounded-lg px-3 py-1.5 focus:outline-none"
                  />
                </div>
              ) : (
                <button type="button" onClick={() => setViewingFile(viewingFile?.id === file.id ? null : file)}
                  className={`w-full text-left flex items-start gap-2.5 px-3 py-2.5 rounded-xl transition-colors group ${viewingFile?.id === file.id ? 'bg-theme-bg-hover' : 'hover:bg-theme-bg-subtle'}`}>
                  <FileIcon type={file.file_type} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-theme-fg truncate">{file.name}</p>
                    <p className="text-[10px] text-theme-fg-subtle mt-0.5">{formatDate(file.created_at)}</p>
                  </div>
                  <button type="button" onClick={(e) => { e.stopPropagation(); startRename(file); }}
                    className="shrink-0 p-1.5 rounded-md text-theme-fg-subtle hover:text-theme-fg hover:bg-theme-bg-hover opacity-0 group-hover:opacity-100 transition-opacity"
                    title={t(locale, 'files.rename')}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                  </button>
                </button>
              )}
            </motion.div>
          ))}
        </div>
      </div>

      {/* Viewer */}
      <AnimatePresence>
        {viewingFile && (
          <motion.div key={viewingFile.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.16 }} className="flex-1 min-w-0 flex flex-col min-h-0">
            <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-3.5 border-b border-theme-border-subtle">
              <div className="min-w-0">
                {renamingId === viewingFile.id ? (
                  <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitRename(viewingFile); if (e.key === 'Escape') setRenamingId(null); }}
                    onBlur={() => commitRename(viewingFile)}
                    className="text-sm font-semibold text-theme-fg bg-theme-bg border border-theme-border-hover rounded-lg px-3 py-1 focus:outline-none w-full max-w-sm" />
                ) : (
                  <button type="button" onClick={() => startRename(viewingFile)} className="text-left group flex items-center gap-2">
                    <p className="text-sm font-semibold text-theme-fg truncate">{viewingFile.name}</p>
                    <svg className="w-3.5 h-3.5 text-theme-fg-subtle opacity-0 group-hover:opacity-100 transition-opacity shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                  </button>
                )}
                <p className="text-[10px] text-theme-fg-subtle mt-0.5">{formatDate(viewingFile.created_at)}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button type="button" onClick={() => handleDownload(viewingFile)}
                  className="btn-tap inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-theme-border bg-theme-bg-subtle text-theme-fg-muted hover:text-theme-fg hover:bg-theme-bg-hover text-xs font-medium">
                  ↓ {t(locale, 'files.download')}
                </button>
                <button type="button" onClick={() => handleDelete(viewingFile)} disabled={deleting === viewingFile.id}
                  className="btn-tap inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-theme-border bg-theme-bg-subtle text-theme-danger hover:bg-theme-bg-hover text-xs font-medium disabled:opacity-50">
                  {t(locale, 'files.delete')}
                </button>
                <button type="button" onClick={() => setViewingFile(null)} className="p-1.5 text-theme-fg-subtle hover:text-theme-fg rounded-lg hover:bg-theme-bg-hover">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-subtle px-5 py-4">
              <div className="file-content-markdown text-sm text-theme-fg leading-relaxed break-words">
                <ReactMarkdown
                  components={{
                    h1: ({ children }) => <h1 className="text-lg font-semibold text-theme-fg mt-4 mb-2 first:mt-0">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-base font-semibold text-theme-fg mt-4 mb-1.5">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-sm font-semibold text-theme-fg mt-3 mb-1">{children}</h3>,
                    p: ({ children }) => <p className="text-theme-fg-muted mb-2">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-0.5 text-theme-fg-muted">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-0.5 text-theme-fg-muted">{children}</ol>,
                    li: ({ children }) => <li className="text-theme-fg-muted">{children}</li>,
                    code: ({ children }) => <code className="px-1 py-0.5 rounded bg-theme-bg-hover text-theme-fg text-xs">{children}</code>,
                    pre: ({ children }) => <pre className="p-3 rounded-lg bg-theme-bg-subtle text-theme-fg-muted text-xs overflow-x-auto mb-2">{children}</pre>,
                  }}
                >
                  {viewingFile.content || ''}
                </ReactMarkdown>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
