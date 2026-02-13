'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useLocale } from '@/app/components/LocaleContext';
import { getProject, updateProject, deleteProject, addProjectItem, removeProjectItem, uploadProjectItem, listContent, getToken, getMediaDisplayUrl, type Project, type ProjectItem, type Job } from '@/lib/api';
import { t } from '@/lib/i18n';
import { getOutputUrls } from '@/lib/jobOutput';
import { ImageViewModal } from '../../components/ImageViewModal';
import { ConfirmDialog } from '@/components/ConfirmDialog';

// Reference for Nano Banana: always selectedItem.latest_url (latest version)
function getReferenceUrl(item: ProjectItem | null): string | null {
  if (!item) return null;
  return item.latest_url || item.source_url || null;
}

export default function StudioProjectPage() {
  const params = useParams();
  const router = useRouter();
  const { locale } = useLocale();
  const id = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [items, setItems] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [selectedItem, setSelectedItem] = useState<ProjectItem | null>(null);
  const [showAddFromContent, setShowAddFromContent] = useState(false);
  const [contentJobs, setContentJobs] = useState<Array<Job & { outputUrls: string[] }>>([]);
  const [viewingMedia, setViewingMedia] = useState<{ urls: string[] } | null>(null);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<ProjectItem | null>(null);
  const [pendingDeleteProject, setPendingDeleteProject] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [canvasScale, setCanvasScale] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [mediaToken, setMediaToken] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const referenceUrl = getReferenceUrl(selectedItem);
  const displayUrl = referenceUrl ? getMediaDisplayUrl(referenceUrl, mediaToken) : null;

  useEffect(() => {
    getToken().then(setMediaToken);
  }, []);

  function fetchProject() {
    if (!id) return;
    getProject(id)
      .then((r) => {
        const itemList = r.items ?? [];
        setProject(r.project);
        setItems(itemList);
        setProjectName(r.project?.name ?? '');
        setSelectedItem((prev) => {
          const next = itemList.find((i) => i.id === prev?.id);
          return next ?? itemList[0] ?? null;
        });
      })
      .catch(() => {
        setProject(null);
        setItems([]);
        setSelectedItem(null);
      });
  }

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getProject(id)
      .then((r) => {
        if (cancelled) return;
        const itemList = r.items ?? [];
        setProject(r.project);
        setItems(itemList);
        setProjectName(r.project?.name ?? '');
        setSelectedItem((prev) => {
          const next = itemList.find((i) => i.id === prev?.id);
          return next ?? itemList[0] ?? null;
        });
      })
      .catch(() => {
        if (cancelled) return;
        setProject(null);
        setItems([]);
        setSelectedItem(null);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  // Refetch when tab becomes visible (user returns) - ensures persisted items are visible
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && id && !loading) fetchProject();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [id, loading]);

  // Sync selectedItem when items change (e.g. after add/upload)
  useEffect(() => {
    if (items.length === 0) return;
    setSelectedItem((prev) => {
      if (!prev) return items[0];
      return items.some((i) => i.id === prev.id) ? prev : items[0];
    });
  }, [items]);

  // Reset scale when selecting a different item
  useEffect(() => {
    setCanvasScale(1);
  }, [selectedItem?.id]);

  useEffect(() => {
    if (!showAddFromContent) return;
    let cancelled = false;
    listContent({ limit: 30 })
      .then((r) => {
        if (cancelled) return;
        const jobs = (r.jobs ?? []).map((j) => ({
          ...j,
          outputUrls: j.status === 'completed' && j.output ? getOutputUrls(j.output) : [],
        }));
        setContentJobs(jobs.filter((j) => j.outputUrls.length > 0 && (j.type === 'image' || j.type === 'video')));
      })
      .catch(() => { if (!cancelled) setContentJobs([]); });
    return () => { cancelled = true; };
  }, [showAddFromContent]);

  async function handleSaveName() {
    if (!project || !projectName.trim()) return;
    try {
      await updateProject(id, projectName.trim());
      setProject({ ...project, name: projectName.trim() });
      setEditingName(false);
    } catch {}
  }

  async function handleAddItem(url: string, type: 'image' | 'video', jobId?: string) {
    setError(null);
    try {
      const { id: itemId } = await addProjectItem(id, type, url, jobId);
      const newItem: ProjectItem = {
        id: itemId,
        project_id: id,
        type,
        source_url: url,
        latest_url: url,
        sort_order: items.length,
        created_at: new Date().toISOString(),
      };
      setItems((prev) => [...prev, newItem]);
      setSelectedItem(newItem);
      setShowAddFromContent(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Add failed');
    }
  }

  async function handleRemoveItem() {
    if (!pendingDeleteItem) return;
    try {
      await removeProjectItem(pendingDeleteItem.id);
      const next = items.filter((i) => i.id !== pendingDeleteItem.id);
      setItems(next);
      setSelectedItem((prev) => (prev?.id === pendingDeleteItem.id ? next[0] ?? null : prev));
      setPendingDeleteItem(null);
    } catch {}
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!id || !project) {
      setError('Please wait for the project to load');
      return;
    }
    const valid = file.type.startsWith('image/') || ['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type);
    if (!valid) return;
    setError(null);
    setUploading(true);
    e.target.value = '';
    try {
      const { item } = await uploadProjectItem(id, file);
      const newItem: ProjectItem = { ...item, sort_order: items.length };
      setItems((prev) => [...prev, newItem]);
      setSelectedItem(newItem);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteProject() {
    try {
      await deleteProject(id);
      router.push('/dashboard/studio');
    } catch {}
    setPendingDeleteProject(false);
  }

  function handleDownload() {
    const url = referenceUrl;
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = url.split('/').pop() || 'download';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  const versionLabel = selectedItem
    ? `1/${(selectedItem.version_num ?? 0) + 1}`
    : '0/0';

  if (loading && !project) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center text-theme-fg-subtle">
        <p>{t(locale, 'common.loading')}</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto p-6 scrollbar-subtle">
        <p className="text-theme-fg-subtle">{t(locale, 'jobs.notFound')}</p>
        <Link href="/dashboard/studio" className="text-theme-accent hover:underline mt-2 inline-block">
          ← {t(locale, 'studio.title')}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-theme-bg">
      {error && (
        <div className="shrink-0 px-4 py-2 bg-theme-danger-muted border-b border-theme-danger/50 text-theme-danger text-sm flex items-center justify-between gap-2">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="p-1 rounded hover:bg-theme-danger/20">×</button>
        </div>
      )}
      {/* Top bar: project + undo/redo + versions + New + tools + view + download/upload */}
      <header className="shrink-0 border-b border-theme-border bg-theme-bg">
        <div className="h-11 px-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0 shrink-0">
            <Link href="/dashboard/studio" className="text-theme-fg-subtle hover:text-theme-fg p-1" aria-label="Back">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            {editingName ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                  className="px-2 py-1 rounded bg-theme-bg text-theme-fg text-sm w-40 border border-theme-border focus:outline-none focus:ring-1 focus:ring-theme-border-strong"
                  autoFocus
                />
                <button type="button" onClick={handleSaveName} className="px-2 py-1 rounded text-xs bg-theme-bg-hover text-theme-fg hover:bg-theme-bg-hover-strong">Save</button>
                <button type="button" onClick={() => { setEditingName(false); setProjectName(project.name); }} className="px-2 py-1 rounded text-xs text-theme-fg-subtle hover:text-theme-fg">Cancel</button>
              </div>
            ) : (
              <div className="relative flex items-center gap-1">
                <h1 className="text-sm font-medium text-theme-fg truncate cursor-pointer hover:text-theme-fg/90" onClick={() => setEditingName(true)}>
                  {project.name || t(locale, 'studio.untitled')}
                </h1>
                <button type="button" onClick={() => setProjectMenuOpen((o) => !o)} className="p-1 rounded text-theme-fg-subtle hover:text-theme-fg hover:bg-theme-bg-hover" aria-label="Menu">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></svg>
                </button>
                {projectMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setProjectMenuOpen(false)} />
                    <div className="absolute left-0 top-full mt-1 py-1 rounded-lg bg-theme-bg border border-theme-border shadow-xl z-50 min-w-[140px]">
                      <button type="button" onClick={() => { setEditingName(true); setProjectMenuOpen(false); }} className="w-full px-4 py-2 text-left text-sm text-theme-fg hover:bg-theme-bg-hover">{t(locale, 'studio.rename')}</button>
                      <button type="button" onClick={() => { setPendingDeleteProject(true); setProjectMenuOpen(false); }} className="w-full px-4 py-2 text-left text-sm text-theme-danger hover:bg-theme-danger-muted">Remove project</button>
                    </div>
                  </>
                )}
              </div>
            )}
            <button type="button" className="p-1 rounded text-theme-fg-subtle hover:text-theme-fg hover:bg-theme-bg-hover" title="Undo" aria-label="Undo">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
            </button>
            <button type="button" className="p-1 rounded text-theme-fg-subtle hover:text-theme-fg hover:bg-theme-bg-hover" title="Redo" aria-label="Redo">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6 6" /></svg>
            </button>
            <span className="text-xs text-theme-fg-subtle shrink-0">{versionLabel} versions</span>
            <Link href="/dashboard/studio" className="px-2.5 py-1.5 rounded-lg border border-theme-border bg-theme-bg-subtle text-theme-fg hover:bg-theme-bg-hover text-xs font-medium shrink-0">
              {t(locale, 'studio.backToProjects')}
            </Link>
          </div>

          {/* Tools bar - center */}
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-subtle flex-1 min-w-0 justify-center">
            <ToolBtn label="Remove BG" />
            <ToolBtn label="Filters" />
            <ToolBtn label="Crop & Rotate" />
            <ToolBtn label="Adjustments" />
            <ToolBtn label="AI Edit" />
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button type="button" onClick={handleDownload} disabled={!referenceUrl} className="p-2 rounded-lg text-theme-fg-subtle hover:text-theme-fg hover:bg-theme-bg-hover disabled:opacity-40" title="Download">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            </button>
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="p-2 rounded-lg text-theme-fg-subtle hover:text-theme-fg hover:bg-theme-bg-hover disabled:opacity-50" title="Upload">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            </button>
          </div>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*,video/mp4,video/webm,video/quicktime" className="hidden" onChange={handleUpload} disabled={uploading} />
      </header>

      {/* Main: sidebar + canvas */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left sidebar: Model top, AI prompt bottom */}
        <aside className="w-52 shrink-0 flex flex-col border-r border-theme-border bg-theme-bg p-4">
          <div className="mb-6">
            <label className="block text-xs font-medium text-theme-fg-muted mb-2">Model</label>
            <div className="flex gap-2">
              <button type="button" className="flex-1 px-3 py-2 rounded-lg border border-theme-border bg-theme-bg-hover text-theme-fg text-sm font-medium">
                Light
              </button>
              <button type="button" className="flex-1 px-3 py-2 rounded-lg border border-theme-border bg-theme-bg-subtle text-theme-fg-subtle hover:text-theme-fg hover:bg-theme-bg-hover text-sm">
                Complete
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 flex flex-col justify-end">
            <div>
              <label className="block text-xs font-medium text-theme-fg-muted mb-2">AI prompt</label>
              <div className="flex gap-2">
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Describe how I should edit the image..."
                  rows={3}
                  className="flex-1 px-3 py-2 rounded-lg border border-theme-border bg-theme-bg-subtle text-theme-fg placeholder:text-theme-fg-subtle text-sm focus:outline-none focus:ring-1 focus:ring-theme-border-strong focus:border-transparent resize-none"
                />
                <button type="button" className="p-2 rounded-lg border border-theme-border bg-theme-bg-hover text-theme-fg hover:bg-theme-bg-hover-strong shrink-0 self-end" title="Edit with AI (Nano Banana)">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                </button>
              </div>
              {referenceUrl && (
                <p className="mt-1.5 text-xs text-theme-fg-subtle">Reference: last selected image (latest version)</p>
              )}
            </div>
          </div>
        </aside>

        {/* Main canvas: black with subtle grid (canvas feel) + selected image center + bottom strip */}
        <main className="flex-1 min-h-0 flex flex-col overflow-hidden bg-theme-bg bg-grid-dark">
          {items.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-sm">
                <p className="text-theme-fg-subtle mb-4">No items yet. Upload or add from My Content.</p>
                <div className="flex gap-2 justify-center flex-wrap">
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="px-4 py-2 rounded-xl border border-theme-border bg-theme-bg-hover text-theme-fg hover:bg-theme-bg-hover-strong disabled:opacity-50 text-sm font-medium">
                    {uploading ? '...' : t(locale, 'studio.upload')}
                  </button>
                  <button type="button" onClick={() => setShowAddFromContent(true)} className="px-4 py-2 rounded-xl border border-theme-border bg-theme-bg-subtle text-theme-fg hover:bg-theme-bg-hover text-sm font-medium">
                    {t(locale, 'studio.addFromContent')}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 min-h-0 flex items-center justify-center p-4 overflow-auto">
                {selectedItem && displayUrl ? (
                  <div className="relative group flex items-center justify-center">
                    <div
                      className="relative origin-center"
                      style={{ transform: `scale(${canvasScale})` }}
                    >
                      <button
                        type="button"
                        onClick={() => setViewingMedia({ urls: [displayUrl] })}
                        className="block"
                      >
                        {selectedItem.type === 'video' ? (
                          <video src={displayUrl} className="max-w-full max-h-[calc(100vh-14rem)] object-contain" controls playsInline />
                        ) : (
                          <img src={displayUrl} alt="" className="max-w-full max-h-[calc(100vh-14rem)] object-contain" draggable={false} />
                        )}
                      </button>
                      <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button type="button" onClick={() => setPendingDeleteItem(selectedItem)} className="p-2 rounded-lg bg-theme-bg-overlay hover:bg-theme-danger text-theme-fg">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                      {(selectedItem.version_num ?? 0) > 0 && (
                        <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-theme-bg-overlay text-xs text-theme-fg">v{(selectedItem.version_num ?? 0) + 1}</span>
                      )}
                    </div>
                    <div className="absolute bottom-2 right-2 flex items-center gap-2 px-2 py-1.5 rounded-lg bg-theme-bg-overlay opacity-0 group-hover:opacity-100 transition-opacity">
                      <button type="button" onClick={() => setCanvasScale((s) => Math.max(0.25, s - 0.25))} className="p-1 rounded text-theme-fg hover:bg-theme-bg-hover" title="Smaller">−</button>
                      <span className="text-xs text-theme-fg min-w-[3rem] text-center">{Math.round(canvasScale * 100)}%</span>
                      <button type="button" onClick={() => setCanvasScale((s) => Math.min(3, s + 0.25))} className="p-1 rounded text-theme-fg hover:bg-theme-bg-hover" title="Larger">+</button>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Bottom: full-width strip with all project images/versions */}
              <div className="shrink-0 border-t border-theme-border bg-theme-bg p-3">
                <div className="flex items-center gap-3 overflow-x-auto scrollbar-subtle">
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setAddMenuOpen((o) => !o)}
                      disabled={uploading}
                      className="w-16 h-16 rounded-lg border-2 border-dashed border-theme-border hover:border-theme-border-hover text-theme-fg-subtle hover:text-theme-fg flex items-center justify-center disabled:opacity-50"
                      title="Add"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    </button>
                    {addMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setAddMenuOpen(false)} />
                        <div className="absolute left-0 top-full mt-1 py-1 rounded-lg bg-theme-bg border border-theme-border shadow-xl z-50 min-w-[160px]">
                          <button type="button" onClick={() => { fileInputRef.current?.click(); setAddMenuOpen(false); }} className="w-full px-4 py-2 text-left text-sm text-theme-fg hover:bg-theme-bg-hover">
                            {t(locale, 'studio.upload')}
                          </button>
                          <button type="button" onClick={() => { setShowAddFromContent(true); setAddMenuOpen(false); }} className="w-full px-4 py-2 text-left text-sm text-theme-fg hover:bg-theme-bg-hover">
                            {t(locale, 'studio.addFromContent')}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  {items.map((item) => {
                    const thumbUrl = getMediaDisplayUrl(item.latest_url || item.source_url, mediaToken);
                    return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedItem(item)}
                      className={`w-16 h-16 rounded-lg overflow-hidden shrink-0 border-2 transition-colors relative ${
                        selectedItem?.id === item.id ? 'border-theme-border-strong ring-2 ring-theme-border-strong' : 'border-theme-border hover:border-theme-border-hover'
                      }`}
                    >
                      {item.type === 'video' ? (
                        <video src={thumbUrl} className="w-full h-full object-cover" muted preload="metadata" playsInline />
                      ) : (
                        <img src={thumbUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                      )}
                      <span className="absolute top-0.5 right-0.5 px-1 rounded bg-theme-bg-overlay text-[10px] text-theme-fg font-medium">
                        {(item.version_num ?? 0) === 0 ? 'Original' : `v${(item.version_num ?? 0) + 1}`}
                      </span>
                    </button>
                  );})}
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {showAddFromContent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-theme-bg-overlay">
          <div className="bg-theme-bg-elevated rounded-2xl border border-theme-border w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-theme-border flex justify-between items-center">
              <h3 className="font-semibold text-theme-fg">{t(locale, 'studio.addFromContent')}</h3>
              <button type="button" onClick={() => setShowAddFromContent(false)} className="text-theme-fg-subtle hover:text-theme-fg text-2xl">×</button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 grid grid-cols-3 sm:grid-cols-4 gap-2">
              {contentJobs.map((job) =>
                job.outputUrls.slice(0, 4).map((url, i) => (
                  <button
                    key={`${job.id}-${i}`}
                    type="button"
                    onClick={() => handleAddItem(url, job.type as 'image' | 'video', job.id)}
                    className="aspect-square rounded-lg overflow-hidden border border-theme-border hover:border-theme-accent"
                  >
                    {job.type === 'video' ? (
                      <video src={url} className="w-full h-full object-cover" muted preload="metadata" playsInline />
                    ) : (
                      <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {viewingMedia && viewingMedia.urls[0] && (
        <ImageViewModal url={viewingMedia.urls[0]} urls={viewingMedia.urls.length > 1 ? viewingMedia.urls : undefined} onClose={() => setViewingMedia(null)} locale={locale} />
      )}

      <ConfirmDialog open={!!pendingDeleteItem} title="Remove item" message="Remove this item from the project?" confirmLabel="Remove" cancelLabel={t(locale, 'dialog.cancel')} confirmClass="bg-theme-danger-muted text-theme-danger hover:bg-theme-danger-muted" onConfirm={handleRemoveItem} onCancel={() => setPendingDeleteItem(null)} />
      <ConfirmDialog open={pendingDeleteProject} title="Delete project" message="Delete this project and all its items? This cannot be undone." confirmLabel="Delete" cancelLabel={t(locale, 'dialog.cancel')} confirmClass="bg-theme-danger-muted text-theme-danger hover:bg-theme-danger-muted" onConfirm={handleDeleteProject} onCancel={() => setPendingDeleteProject(false)} />
    </div>
  );
}

function ToolBtn({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="px-2 py-1.5 rounded text-xs font-medium shrink-0 whitespace-nowrap text-theme-fg-subtle hover:text-theme-fg hover:bg-theme-bg-hover"
    >
      {label}
    </button>
  );
}
