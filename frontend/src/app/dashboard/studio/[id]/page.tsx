'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useLocale } from '@/app/components/LocaleContext';
import { getProject, updateProject, deleteProject, addProjectItem, removeProjectItem, uploadProjectItem, listContent, type Project, type ProjectItem, type Job } from '@/lib/api';
import { t } from '@/lib/i18n';
import { getOutputUrls } from '@/lib/jobOutput';
import { ImageViewModal } from '../../components/ImageViewModal';
import { ConfirmDialog } from '@/components/ConfirmDialog';

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
  const [showAddFromContent, setShowAddFromContent] = useState(false);
  const [contentJobs, setContentJobs] = useState<Array<Job & { outputUrls: string[] }>>([]);
  const [viewingMedia, setViewingMedia] = useState<{ urls: string[] } | null>(null);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<ProjectItem | null>(null);
  const [pendingDeleteProject, setPendingDeleteProject] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    if (!id) return;
    getProject(id)
      .then((r) => {
        setProject(r.project);
        setItems(r.items ?? []);
        setProjectName(r.project?.name ?? '');
      })
      .catch(() => {
        setProject(null);
        setItems([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, [id]);

  useEffect(() => {
    if (showAddFromContent) {
      listContent({ limit: 30 })
        .then((r) => {
          const jobs = (r.jobs ?? []).map((j) => ({
            ...j,
            outputUrls: j.status === 'completed' && j.output ? getOutputUrls(j.output) : [],
          }));
          setContentJobs(jobs.filter((j) => j.outputUrls.length > 0 && (j.type === 'image' || j.type === 'video')));
        })
        .catch(() => setContentJobs([]));
    }
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
    try {
      await addProjectItem(id, type, url, jobId);
      refresh();
      setShowAddFromContent(false);
    } catch {}
  }

  async function handleRemoveItem() {
    if (!pendingDeleteItem) return;
    try {
      await removeProjectItem(pendingDeleteItem.id);
      setItems((prev) => prev.filter((i) => i.id !== pendingDeleteItem.id));
      setPendingDeleteItem(null);
    } catch {}
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const valid = file.type.startsWith('image/') || ['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type);
    if (!valid) return;
    setUploading(true);
    e.target.value = '';
    try {
      await uploadProjectItem(id, file);
      refresh();
    } catch {
      setUploading(false);
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

  if (loading && !project) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto p-6 scrollbar-subtle">
        <p className="text-theme-fg-subtle">{t(locale, 'common.loading')}</p>
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
    <div className="flex-1 min-h-0 overflow-y-auto p-6 scrollbar-subtle">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/studio" className="text-theme-fg-subtle hover:text-theme-fg">←</Link>
        {editingName ? (
          <div className="flex-1 flex gap-2">
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
              className="flex-1 px-3 py-1.5 rounded-lg border border-theme-border bg-theme-bg-subtle text-theme-fg"
              autoFocus
            />
            <button type="button" onClick={handleSaveName} className="px-3 py-1.5 rounded-lg bg-theme-accent-muted text-theme-accent text-sm">
              Save
            </button>
            <button type="button" onClick={() => { setEditingName(false); setProjectName(project.name); }} className="px-3 py-1.5 rounded-lg text-theme-fg-subtle hover:text-theme-fg text-sm">
              Cancel
            </button>
          </div>
        ) : (
          <h1
            className="text-xl font-semibold text-theme-fg cursor-pointer hover:text-theme-fg/90"
            onClick={() => setEditingName(true)}
          >
            {project.name || t(locale, 'studio.untitled')}
          </h1>
        )}
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/mp4,video/webm,video/quicktime"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-4 py-2 rounded-xl bg-theme-accent-muted text-theme-accent hover:bg-theme-accent-hover disabled:opacity-50 text-sm font-medium"
          >
            {uploading ? '...' : t(locale, 'studio.upload')}
          </button>
          <button
            type="button"
            onClick={() => setShowAddFromContent(true)}
            className="px-4 py-2 rounded-xl bg-theme-bg-hover text-theme-fg hover:bg-theme-bg-hover-strong text-sm font-medium border border-theme-border"
          >
            {t(locale, 'studio.addFromContent')}
          </button>
          <button
            type="button"
            onClick={() => setPendingDeleteProject(true)}
            className="px-4 py-2 rounded-xl border border-red-500/50 text-red-400 hover:bg-red-500/10 text-sm font-medium"
          >
            Delete project
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-theme-border p-12 text-center text-theme-fg-subtle">
          <p className="mb-4">No images or videos yet. Upload from device or add from My Content.</p>
          <div className="flex gap-2 justify-center flex-wrap">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-4 py-2 rounded-xl bg-theme-accent-muted text-theme-accent hover:bg-theme-accent-hover disabled:opacity-50"
            >
              {uploading ? '...' : t(locale, 'studio.upload')}
            </button>
            <button
              type="button"
              onClick={() => setShowAddFromContent(true)}
              className="px-4 py-2 rounded-xl bg-theme-bg-hover text-theme-fg hover:bg-theme-bg-hover-strong"
            >
              {t(locale, 'studio.addFromContent')}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {items.map((item) => (
            <div key={item.id} className="relative group rounded-xl overflow-hidden border border-theme-border bg-theme-bg-subtle">
              <button
                type="button"
                onClick={() => setViewingMedia({ urls: [item.latest_url || item.source_url] })}
                className="w-full aspect-square block"
              >
                {item.type === 'video' ? (
                  <video
                    src={item.latest_url || item.source_url}
                    className="w-full h-full object-cover"
                    muted
                    preload="metadata"
                    playsInline
                  />
                ) : (
                  <img src={item.latest_url || item.source_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setPendingDeleteItem(item)}
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 hover:bg-red-500/80 text-white flex items-center justify-center text-sm"
              >
                ×
              </button>
              {item.version_num > 0 && (
                <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/60 text-xs text-white">
                  v{item.version_num}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {showAddFromContent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
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
        <ImageViewModal
          url={viewingMedia.urls[0]}
          urls={viewingMedia.urls.length > 1 ? viewingMedia.urls : undefined}
          onClose={() => setViewingMedia(null)}
          locale={locale}
        />
      )}

      <ConfirmDialog
        open={!!pendingDeleteItem}
        title="Remove item"
        message="Remove this item from the project?"
        confirmLabel="Remove"
        cancelLabel={t(locale, 'dialog.cancel')}
        confirmClass="bg-red-500/20 text-red-400 hover:bg-red-500/30"
        onConfirm={handleRemoveItem}
        onCancel={() => setPendingDeleteItem(null)}
      />
      <ConfirmDialog
        open={pendingDeleteProject}
        title="Delete project"
        message="Delete this project and all its items? This cannot be undone."
        confirmLabel="Delete"
        cancelLabel={t(locale, 'dialog.cancel')}
        confirmClass="bg-red-500/20 text-red-400 hover:bg-red-500/30"
        onConfirm={handleDeleteProject}
        onCancel={() => setPendingDeleteProject(false)}
      />
    </div>
  );
}
