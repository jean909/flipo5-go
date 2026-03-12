'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';
import {
  listFiles,
  deleteFile,
  renameFile,
  getToken,
  listContent,
  listTranslationProjects,
  getTranslationProject,
  listProducts,
  getProduct,
  downloadMediaUrl,
  getMediaDisplayUrl,
  type UserFile,
  type TranslationProject,
  type TranslationItem,
  type Job,
  type Product,
  type ProductPhoto,
} from '@/lib/api';
import { getOutputUrls } from '@/lib/jobOutput';
import { ImageViewModal } from '../components/ImageViewModal';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return iso; }
}

function truncate(str: string, len: number) {
  if (!str) return '';
  return str.length <= len ? str : str.slice(0, len) + '…';
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

function TranslateIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-4 h-4 shrink-0 text-theme-fg-muted'} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" />
    </svg>
  );
}

type ViewingProjectItem = { project: TranslationProject; item: TranslationItem };

function LogoIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-4 h-4 shrink-0 text-theme-fg-muted'} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.38 3.39a15.995 15.995 0 004.769-2.95M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

type ImageModalState = { displayUrls: string[]; downloadUrls: string[]; index: number } | null;

export default function FilesPage() {
  const { locale } = useLocale();
  const searchParams = useSearchParams();
  const [files, setFiles] = useState<UserFile[]>([]);
  const [projects, setProjects] = useState<TranslationProject[]>([]);
  const [projectItems, setProjectItems] = useState<Record<string, TranslationItem[]>>({});
  const [logoJobs, setLogoJobs] = useState<Job[]>([]);
  const [logoLoading, setLogoLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [productDetail, setProductDetail] = useState<{ product: Product; photos: ProductPhoto[]; generated_jobs: Job[] } | null>(null);
  const [loadingProductId, setLoadingProductId] = useState<string | null>(null);
  const [mediaToken, setMediaToken] = useState<string | null>(null);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [loadingProjects, setLoadingProjects] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewingFile, setViewingFile] = useState<UserFile | null>(null);
  const [viewingProjectItem, setViewingProjectItem] = useState<ViewingProjectItem | null>(null);
  const [viewingLogo, setViewingLogo] = useState<Job | null>(null);
  const [imageModal, setImageModal] = useState<ImageModalState>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'seo' | 'text' | 'translation' | 'logo' | 'product'>('all');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const hasViewerOpen = !!viewingFile || !!viewingProjectItem || !!viewingLogo;
  const fetchProducts = useCallback(() => {
    listProducts().then((r) => setProducts(r.products ?? [])).catch(() => setProducts([]));
  }, []);

  useEffect(() => {
    const type = searchParams.get('type');
    if (type === 'logo') setTypeFilter('logo');
    if (type === 'product') setTypeFilter('product');
  }, [searchParams]);

  const fetchFiles = useCallback(() => {
    setLoading(true);
    listFiles()
      .then((r) => setFiles(r.files ?? []))
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }, []);

  const fetchProjects = useCallback(() => {
    listTranslationProjects()
      .then((r) => setProjects(r.projects ?? []))
      .catch(() => setProjects([]));
  }, []);

  const fetchLogos = useCallback(() => {
    setLogoLoading(true);
    listContent({ type: 'logo', limit: 50 })
      .then((r) => setLogoJobs(r.jobs ?? []))
      .catch(() => setLogoJobs([]))
      .finally(() => setLogoLoading(false));
  }, []);

  useEffect(() => {
    getToken().then(setMediaToken);
  }, []);

  useEffect(() => {
    fetchFiles();
    fetchProjects();
  }, [fetchFiles, fetchProjects]);

  useEffect(() => {
    if (typeFilter === 'all' || typeFilter === 'logo') fetchLogos();
  }, [typeFilter, fetchLogos]);

  useEffect(() => {
    if (typeFilter === 'all' || typeFilter === 'product') fetchProducts();
  }, [typeFilter, fetchProducts]);

  const loadProductDetail = useCallback((productId: string) => {
    setLoadingProductId(productId);
    getProduct(productId)
      .then((r) => setProductDetail({ product: r.product, photos: r.photos ?? [], generated_jobs: r.generated_jobs ?? [] }))
      .catch(() => setProductDetail(null))
      .finally(() => setLoadingProductId(null));
  }, []);

  const toggleProduct = useCallback((productId: string) => {
    setExpandedProductId((prev) => {
      const next = prev === productId ? null : productId;
      if (next) loadProductDetail(next);
      else setProductDetail(null);
      return next;
    });
  }, [loadProductDetail]);

  const loadProjectItems = useCallback((projectId: string) => {
    if (projectItems[projectId]) return;
    setLoadingProjects((prev) => prev || projectId);
    getTranslationProject(projectId)
      .then((r) => setProjectItems((prev) => ({ ...prev, [projectId]: r.items ?? [] })))
      .catch(() => setProjectItems((prev) => ({ ...prev, [projectId]: [] })))
      .finally(() => setLoadingProjects(null));
  }, [projectItems]);

  const toggleProject = useCallback((projectId: string) => {
    setExpandedProjectId((prev) => {
      const next = prev === projectId ? null : projectId;
      if (next) loadProjectItems(next);
      return next;
    });
  }, [loadProjectItems]);

  const filtered = useMemo(() => {
    let list = files;
    if (typeFilter !== 'all') list = list.filter((f) => f.file_type === typeFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((f) => f.name.toLowerCase().includes(q) || f.content.toLowerCase().includes(q));
    }
    return list;
  }, [files, typeFilter, search]);

  const filteredProjects = useMemo(() => {
    if (!search.trim()) return projects;
    const q = search.trim().toLowerCase();
    return projects.filter(
      (p) => p.name.toLowerCase().includes(q)
        || (projectItems[p.id] ?? []).some((it) => (it.source_value || '').toLowerCase().includes(q) || (it.result_text || '').toLowerCase().includes(q))
    );
  }, [projects, projectItems, search]);

  const filteredLogos = useMemo(() => {
    if (!search.trim()) return logoJobs;
    const q = search.trim().toLowerCase();
    return logoJobs.filter((job) => {
      const input = job.input as Record<string, unknown> | null;
      const prompt = (input?.prompt as string) ?? '';
      return typeof prompt === 'string' && prompt.toLowerCase().includes(q);
    });
  }, [logoJobs, search]);

  const openFile = (file: UserFile) => {
    setViewingProjectItem(null);
    setViewingLogo(null);
    setViewingFile((prev) => (prev?.id === file.id ? null : file));
  };

  const openProjectItem = (project: TranslationProject, item: TranslationItem) => {
    if (!item.result_text) return;
    setViewingFile(null);
    setViewingLogo(null);
    setViewingProjectItem((prev) => (prev?.item.id === item.id ? null : { project, item }));
  };

  const openLogo = (job: Job) => {
    setViewingFile(null);
    setViewingProjectItem(null);
    setViewingLogo((prev) => (prev?.id === job.id ? null : job));
  };

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
      <div className={`flex flex-col min-h-0 border-r border-theme-border-subtle transition-all ${hasViewerOpen ? 'w-72 shrink-0' : 'flex-1'}`}>
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
          <div className="flex gap-1 flex-wrap">
            {(['all', 'seo', 'text', 'translation', 'logo'] as const).map((type) => {
              const translationCount = projects.length;
              const label = type === 'all' ? `All (${files.length + translationCount + logoJobs.length})` : type === 'seo' ? `SEO (${files.filter(f => f.file_type === 'seo').length})` : type === 'text' ? `Text (${files.filter(f => f.file_type === 'text').length})` : type === 'translation' ? `Translation (${translationCount})` : `Logo (${logoJobs.length})`;
              return (
                <button key={type} type="button" onClick={() => setTypeFilter(type)}
                  className={`btn-tap px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize ${typeFilter === type ? 'bg-theme-bg-hover text-theme-fg' : 'text-theme-fg-muted hover:text-theme-fg'}`}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-subtle p-2">
          {loading && <p className="text-sm text-theme-fg-subtle animate-pulse-subtle px-3 py-4">{t(locale, 'common.loading')}</p>}

          {/* Translation projects — visible for All and Translation */}
          {(typeFilter === 'all' || typeFilter === 'translation') && (
          <div className="mb-4">
            <p className="text-[10px] font-medium text-theme-fg-muted uppercase tracking-wider px-2 pb-1.5">{t(locale, 'files.projects')}</p>
            {projects.length === 0 && !loading && <p className="text-xs text-theme-fg-subtle px-3 py-1">{t(locale, 'files.noProjects')}</p>}
            {filteredProjects.map((project) => {
              const isExpanded = expandedProjectId === project.id;
              const items = (projectItems[project.id] ?? []).filter((it) => it.status === 'completed' && it.result_text);
              const loadingThis = loadingProjects === project.id;
              return (
                <div key={project.id} className="rounded-xl border border-theme-border-subtle overflow-hidden mb-1.5">
                  <button type="button" onClick={() => toggleProject(project.id)}
                    className="w-full text-left flex items-center gap-2 px-3 py-2.5 rounded-t-xl hover:bg-theme-bg-subtle transition-colors">
                    <span className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                      <svg className="w-3.5 h-3.5 text-theme-fg-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </span>
                    <TranslateIcon className="w-4 h-4 shrink-0 text-theme-fg-muted" />
                    <span className="flex-1 text-sm font-medium text-theme-fg truncate">{project.name}</span>
                    {isExpanded && items.length > 0 && <span className="text-[10px] text-theme-fg-subtle">{items.length}</span>}
                  </button>
                  {isExpanded && (
                    <div className="border-t border-theme-border-subtle bg-theme-bg-subtle/50">
                      {loadingThis && <p className="text-xs text-theme-fg-subtle px-3 py-2">{t(locale, 'common.loading')}</p>}
                      {!loadingThis && items.length === 0 && <p className="text-xs text-theme-fg-subtle px-3 py-2">No translated items yet.</p>}
                      {!loadingThis && items.map((item) => (
                        <button key={item.id} type="button" onClick={() => openProjectItem(project, item)}
                          className={`w-full text-left flex items-start gap-2 px-3 py-2 rounded-lg mx-1 mb-1 transition-colors group ${viewingProjectItem?.item.id === item.id ? 'bg-theme-bg-subtle border border-theme-border-subtle' : 'hover:bg-theme-bg-subtle border border-transparent'}`}>
                          <TranslateIcon className="w-3.5 h-3.5 shrink-0 mt-0.5 text-theme-fg-muted" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-theme-fg truncate">{truncate(item.source_value || 'Translation', 40)}</p>
                            <p className="text-[10px] text-theme-fg-subtle mt-0.5">{formatDate(item.updated_at)}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          )}

          {/* Logos — visible for All and Logo */}
          {(typeFilter === 'all' || typeFilter === 'logo') && (
          <div className="mb-4">
            <p className="text-[10px] font-medium text-theme-fg-muted uppercase tracking-wider px-2 pb-1.5">{t(locale, 'files.logos')}</p>
            {logoLoading ? (
              <p className="text-xs text-theme-fg-subtle px-3 py-2 animate-pulse-subtle">{t(locale, 'common.loading')}</p>
            ) : filteredLogos.length === 0 ? (
              <p className="text-xs text-theme-fg-subtle px-3 py-1">{t(locale, 'files.noLogos')}</p>
            ) : (
              <ul className="space-y-1.5">
                {filteredLogos.map((job) => {
                  const urls = getOutputUrls(job.output);
                  const thumbUrl = urls[0];
                  const prompt = (job.input as Record<string, unknown>)?.prompt as string;
                  const displayUrl = mediaToken && thumbUrl ? getMediaDisplayUrl(thumbUrl, mediaToken) || thumbUrl : thumbUrl;
                  return (
                    <li key={job.id}>
                      <button type="button" onClick={() => openLogo(job)}
                        className={`w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-xl transition-colors border border-transparent ${viewingLogo?.id === job.id ? 'bg-theme-bg-subtle border-theme-border-subtle' : 'hover:bg-theme-bg-subtle'}`}>
                        {displayUrl ? (
                          <img src={displayUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-theme-bg-elevated flex items-center justify-center shrink-0">
                            <LogoIcon className="w-5 h-5" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-theme-fg truncate">{truncate(prompt || 'Logo', 24)}</p>
                          <p className="text-[10px] text-theme-fg-subtle">{formatDate(job.created_at)}</p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          )}

          {/* Standalone files — visible for All, SEO, Text */}
          {(typeFilter === 'all' || typeFilter === 'seo' || typeFilter === 'text') && (
          <div>
            <p className="text-[10px] font-medium text-theme-fg-muted uppercase tracking-wider px-2 pb-1.5">{t(locale, 'files.standalone')}</p>
            {!loading && filtered.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-6 text-center px-4">
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
                  <button type="button" onClick={() => openFile(file)}
                    className={`w-full text-left flex items-start gap-2.5 px-3 py-2.5 rounded-xl transition-colors group border border-transparent ${viewingFile?.id === file.id ? 'bg-theme-bg-subtle border-theme-border-subtle' : 'hover:bg-theme-bg-subtle'}`}>
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
          )}
        </div>
      </div>

      {/* Viewer - wrapper so panel gets flex space when open */}
      <div className={hasViewerOpen ? 'flex-1 min-w-0 flex flex-col min-h-0' : 'hidden'}>
      <AnimatePresence mode="wait">
        {viewingFile && (
          <motion.div key={`file-${viewingFile.id}`} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.16 }} className="flex-1 min-w-0 flex flex-col min-h-0">
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
        {viewingProjectItem && (
          <motion.div key={`project-${viewingProjectItem.project.id}-${viewingProjectItem.item.id}`} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.16 }} className="flex-1 min-w-0 flex flex-col min-h-0">
            <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-3.5 border-b border-theme-border-subtle">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-theme-fg truncate">{viewingProjectItem.project.name}</p>
                <p className="text-[10px] text-theme-fg-subtle mt-0.5 truncate" title={viewingProjectItem.item.source_value}>{truncate(viewingProjectItem.item.source_value || 'Translation', 60)}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Link href="/dashboard/translations" className="btn-tap inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-theme-border bg-theme-bg-subtle text-theme-fg-muted hover:text-theme-fg hover:bg-theme-bg-hover text-xs font-medium">
                  {t(locale, 'files.manageInTranslations')}
                </Link>
                <button type="button" onClick={() => setViewingProjectItem(null)} className="p-1.5 text-theme-fg-subtle hover:text-theme-fg rounded-lg hover:bg-theme-bg-hover">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-subtle px-5 py-4">
              <div className="file-content-markdown text-sm text-theme-fg leading-relaxed break-words whitespace-pre-wrap">
                {viewingProjectItem.item.result_text ?? ''}
              </div>
            </div>
          </motion.div>
        )}
        {viewingLogo && (
          <motion.div key={`logo-${viewingLogo.id}`} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.16 }} className="flex-1 min-w-0 flex flex-col min-h-0">
            <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-3.5 border-b border-theme-border-subtle">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-theme-fg truncate">{truncate((viewingLogo.input as Record<string, unknown>)?.prompt as string || 'Logo', 50)}</p>
                <p className="text-[10px] text-theme-fg-subtle mt-0.5">{formatDate(viewingLogo.created_at)}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Link href="/dashboard/logo" className="btn-tap inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-theme-border bg-theme-bg-subtle text-theme-fg-muted hover:text-theme-fg hover:bg-theme-bg-hover text-xs font-medium">
                  {t(locale, 'logo.title')}
                </Link>
                <button type="button" onClick={() => setViewingLogo(null)} className="p-1.5 text-theme-fg-subtle hover:text-theme-fg rounded-lg hover:bg-theme-bg-hover">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-subtle px-5 py-4">
              {(() => {
                const urls = getOutputUrls(viewingLogo.output ?? null);
                if (urls.length === 0) {
                  return <p className="text-sm text-theme-fg-muted py-4">{t(locale, 'files.noLogos')}</p>;
                }
                const displayUrls = urls.map((u) => mediaToken ? getMediaDisplayUrl(u, mediaToken) || u : u);
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {urls.map((url, i) => {
                      const displayUrl = displayUrls[i];
                      return (
                        <div key={i} className="rounded-xl border border-theme-border bg-theme-bg overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setImageModal({ displayUrls, downloadUrls: urls, index: i })}
                            className="w-full aspect-square flex items-center justify-center p-2 bg-theme-bg-subtle hover:bg-theme-bg-hover transition-colors cursor-pointer"
                          >
                            <img src={displayUrl} alt="" className="max-w-full max-h-full w-auto h-auto object-contain pointer-events-none" />
                          </button>
                          <div className="p-2 flex gap-2 border-t border-theme-border">
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const blob = await downloadMediaUrl(url);
                                  const a = document.createElement('a');
                                  a.href = URL.createObjectURL(blob);
                                  a.download = `logo-${i + 1}.png`;
                                  a.click();
                                  URL.revokeObjectURL(a.href);
                                } catch {
                                  window.open(url, '_blank');
                                }
                              }}
                              className="btn-tap px-2 py-1 rounded-lg border border-theme-border bg-theme-bg-hover text-theme-fg text-xs font-medium"
                            >
                              PNG
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>

      {imageModal && (
        <ImageViewModal
          url={imageModal.displayUrls[imageModal.index]}
          urls={imageModal.displayUrls}
          downloadUrls={imageModal.downloadUrls}
          onClose={() => setImageModal(null)}
          locale={locale}
        />
      )}
    </div>
  );
}
