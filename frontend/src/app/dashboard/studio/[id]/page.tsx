'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useLocale } from '@/app/components/LocaleContext';
import { getProject, updateProject, deleteProject, addProjectItem, removeProjectItem, uploadProjectItem, removeProjectItemBackground, listProjectVersions, removeProjectVersion, uploadProjectVersion, addProjectVersionByUrl, listContent, getToken, getMediaDisplayUrl, downloadMediaUrl, createImage, createImageInpaint, uploadAttachments, getJob, exportToCollection, type Project, type ProjectItem, type ProjectVersion, type Job } from '@/lib/api';
import { t } from '@/lib/i18n';
import { getOutputUrls } from '@/lib/jobOutput';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CropRotateModal } from './CropRotateModal';
import { AdjustmentsModal } from './AdjustmentsModal';
import { FiltersModal } from './FiltersModal';
import { PaintCanvas, type PaintTool } from './PaintCanvas';
import { MultiLogoPlacer, type LogoOverlayItem } from './MultiLogoPlacer';
import { LogoDialog, type SavedLogo } from './LogoDialog';
import { TextFloatingBar } from './TextFloatingBar';
import { ThemeColorPicker } from './ThemeColorPicker';

const LOGO_LIBRARY_KEY = 'flipo5_user_logos';
const MAX_SAVED_LOGOS = 30;
export type EditorTool = PaintTool | 'logo';

function loadSavedLogos(): SavedLogo[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOGO_LIBRARY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as SavedLogo[];
    return Array.isArray(arr) ? arr.slice(0, MAX_SAVED_LOGOS) : [];
  } catch {
    return [];
  }
}
function saveLogosToStorage(logos: SavedLogo[]) {
  try {
    localStorage.setItem(LOGO_LIBRARY_KEY, JSON.stringify(logos.slice(0, MAX_SAVED_LOGOS)));
  } catch {}
}

function getReferenceUrl(item: ProjectItem | null): string | null {
  if (!item) return null;
  return item.latest_url || item.source_url || null;
}

/** Relative URLs (e.g. uploads/...) need token for /api/media proxy; avoid broken img until token is ready. */
function getSafeDisplayUrl(url: string | null | undefined, token: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return getMediaDisplayUrl(url, token);
  if (!token) return null;
  return getMediaDisplayUrl(url, token);
}

/** Extension from blob/url for download filename (match ImageViewModal). */
function getDownloadExt(blob: Blob, url: string): string {
  if (blob.type.includes('video')) return blob.type.includes('webm') ? 'webm' : 'mp4';
  if (blob.type.includes('png')) return 'png';
  if (blob.type.includes('webp')) return 'webp';
  if (blob.type.includes('gif')) return 'gif';
  if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) return url.toLowerCase().includes('webm') ? 'webm' : 'mp4';
  if (/\.(png|webp|gif)(\?|$)/i.test(url)) return url.match(/\.(png|webp|gif)/i)?.[1]?.toLowerCase() ?? 'jpg';
  return 'jpg';
}

/** useParams().id can be string | string[] in some Next versions; normalize to string. */
function useProjectId(): string {
  const params = useParams();
  const raw = params?.id;
  return typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] ?? '' : '';
}

export default function StudioProjectPage() {
  const id = useProjectId();
  const router = useRouter();
  const { locale } = useLocale();
  const [project, setProject] = useState<Project | null>(null);
  const [items, setItems] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [selectedItem, setSelectedItem] = useState<ProjectItem | null>(null);
  const [showAddFromContent, setShowAddFromContent] = useState(false);
  const [contentJobs, setContentJobs] = useState<Array<Job & { outputUrls: string[] }>>([]);
  const [contentLoading, setContentLoading] = useState(false);
  const [previewZoomOpen, setPreviewZoomOpen] = useState(false);
  const [cropRotateOpen, setCropRotateOpen] = useState(false);
  const [adjustmentsOpen, setAdjustmentsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<ProjectItem | null>(null);
  const [pendingDeleteVersionNum, setPendingDeleteVersionNum] = useState<number | null>(null);
  const [pendingDeleteProject, setPendingDeleteProject] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removingBg, setRemovingBg] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [exportingToCollection, setExportingToCollection] = useState(false);
  const [itemVersions, setItemVersions] = useState<ProjectVersion[] | null>(null);
  const [viewingVersionNum, setViewingVersionNum] = useState<number | null>(null);
  const [dragOverCount, setDragOverCount] = useState(0);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [canvasScale, setCanvasScale] = useState(0.75);
  const [canvasPan, setCanvasPan] = useState({ x: 0, y: 0 });
  const [canvasDragging, setCanvasDragging] = useState(false);
  const canvasDragRef = useRef({ startX: 0, startY: 0, startPan: { x: 0, y: 0 } });
  const [editorTool, setEditorTool] = useState<EditorTool | null>(null);
  const [savedLogos, setSavedLogos] = useState<SavedLogo[]>([]);
  const [logoOverlays, setLogoOverlays] = useState<LogoOverlayItem[]>([]);
  const [logoApplying, setLogoApplying] = useState(false);
  const [showLogoDialog, setShowLogoDialog] = useState(false);
  const [textBarTargetId, setTextBarTargetId] = useState<string | null>(null);
  const [brushSize, setBrushSize] = useState(24);
  const [colorizeColor, setColorizeColor] = useState('#f96');
  const [highlightColor, setHighlightColor] = useState('#ffeb3b');
  const [highlightOpacity, setHighlightOpacity] = useState(0.4);
  const [paintApplying, setPaintApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mediaToken, setMediaToken] = useState<string | null>(null);
  const [aiEditJobId, setAiEditJobId] = useState<string | null>(null);
  const [brushEditForInpaint, setBrushEditForInpaint] = useState(false);
  const [maskBlobForInpaint, setMaskBlobForInpaint] = useState<Blob | null>(null);
  const [editMode, setEditMode] = useState<'edit' | 'edit_brush'>('edit');
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  useEffect(() => {
    if (leftPanelOpen || rightPanelOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [leftPanelOpen, rightPanelOpen]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageWrapRef = useRef<HTMLDivElement>(null);
  const [imageBoxSize, setImageBoxSize] = useState<{ w: number; h: number } | null>(null);

  // History: Original (source) + v1, v2, … for selected item
  const versionHistory = (() => {
    if (!selectedItem) return [];
    const list: { version_num: number; url: string; label: string }[] = [
      { version_num: 0, url: selectedItem.source_url, label: t(locale, 'studio.original') },
    ];
    if (itemVersions && itemVersions.length > 0) {
      const sorted = [...itemVersions].sort((a, b) => a.version_num - b.version_num);
      sorted.forEach((v) => list.push({ version_num: v.version_num, url: v.url, label: `v${v.version_num}` }));
    }
    return list;
  })();

  const referenceUrl = (() => {
    if (!selectedItem) return null;
    if (viewingVersionNum !== null) {
      const entry = versionHistory.find((e) => e.version_num === viewingVersionNum);
      return entry?.url ?? getReferenceUrl(selectedItem);
    }
    return getReferenceUrl(selectedItem);
  })();
  const displayUrl = getSafeDisplayUrl(referenceUrl, mediaToken);

  useEffect(() => {
    getToken().then(setMediaToken);
  }, []);
  useEffect(() => {
    setSavedLogos(loadSavedLogos());
  }, []);

  function fetchProject() {
    if (!id) return;
    getProject(id)
      .then((r) => {
        const proj = r.project ?? null;
        const itemList = r.items ?? [];
        setProject(proj);
        setItems(itemList);
        setProjectName(proj?.name ?? '');
        setSelectedItem((prev) => {
          const next = itemList.find((i) => i.id === prev?.id);
          if (next) return next;
          const firstImage = itemList.find((i) => i.type === 'image');
          return firstImage ?? itemList[0] ?? null;
        });
      })
      .catch((e: unknown) => {
        if ((e as Error)?.message === 'session_expired') {
          window.location.href = '/start';
          return;
        }
        setProject(null);
        setItems([]);
        setProjectName('');
        setSelectedItem(null);
      });
  }

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    getProject(id)
      .then((r) => {
        if (cancelled) return;
        const itemList = r.items ?? [];
        const proj = r.project ?? null;
        setProject(proj);
        setItems(itemList);
        setProjectName(proj?.name ?? '');
        setSelectedItem((prev) => {
          const next = itemList.find((i) => i.id === prev?.id);
          if (next) return next;
          const firstImage = itemList.find((i) => i.type === 'image');
          return firstImage ?? itemList[0] ?? null;
        });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if ((e as Error)?.message === 'session_expired') {
          window.location.href = '/start';
          return;
        }
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

  // Sync selectedItem when items change (e.g. after add/upload); prefer an image when current is missing or not image
  useEffect(() => {
    if (items.length === 0) return;
    setSelectedItem((prev) => {
      const stillThere = prev && items.some((i) => i.id === prev.id);
      if (stillThere) return prev;
      const firstImage = items.find((i) => i.type === 'image');
      return firstImage ?? items[0];
    });
  }, [items]);

  // Reset scale, pan, version view and paint tool when selecting a different item (exit brush)
  useEffect(() => {
    setCanvasScale(0.75);
    setCanvasPan({ x: 0, y: 0 });
    setViewingVersionNum(null);
    setEditorTool(null);
    setBrushEditForInpaint(false);
    setMaskBlobForInpaint(null);
    setImageBoxSize(null);
  }, [selectedItem?.id]);

  // Reset pan when switching version (same item, different image)
  useEffect(() => {
    setCanvasPan({ x: 0, y: 0 });
    setImageBoxSize(null);
  }, [referenceUrl]);

  // Measure image wrapper so Brush/PaintCanvas can use same size (no resize jump)
  useEffect(() => {
    const el = imageWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (w > 0 && h > 0) setImageBoxSize({ w, h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [selectedItem?.id, referenceUrl]);

  // Fetch version history for selected item
  useEffect(() => {
    if (!selectedItem?.id) {
      setItemVersions(null);
      return;
    }
    let cancelled = false;
    listProjectVersions(selectedItem.id)
      .then((r) => {
        if (!cancelled) setItemVersions(r.versions ?? []);
      })
      .catch(() => {
        if (!cancelled) setItemVersions([]);
      });
    return () => { cancelled = true; };
  }, [selectedItem?.id]);

  useEffect(() => {
    if (!showAddFromContent) return;
    let cancelled = false;
    setContentLoading(true);
    listContent({ limit: 30 })
      .then((r) => {
        if (cancelled) return;
        const jobs = (r.jobs ?? []).map((j) => ({
          ...j,
          outputUrls: j.status === 'completed' && j.output ? getOutputUrls(j.output) : [],
        }));
        setContentJobs(jobs.filter((j) => j.outputUrls.length > 0 && (j.type === 'image' || j.type === 'video')));
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if ((e as Error)?.message === 'session_expired') {
          window.location.href = '/start';
          return;
        }
        setContentJobs([]);
      })
      .finally(() => { if (!cancelled) setContentLoading(false); });
    return () => { cancelled = true; };
  }, [showAddFromContent]);

  async function handleSaveName() {
    if (!project || !projectName.trim()) return;
    try {
      await updateProject(id, projectName.trim());
      setProject({ ...project, name: projectName.trim() });
      setEditingName(false);
    } catch (e: unknown) {
      if ((e as Error)?.message === 'session_expired') {
        window.location.href = '/start';
        return;
      }
      setError('Failed to save name');
    }
  }

  async function handleAddItem(url: string, type: 'image' | 'video', jobId?: string) {
    setError(null);
    try {
      const res = await addProjectItem(id, type, url, jobId);
      const itemId = res?.id;
      if (!itemId) {
        setError('Add failed');
        return;
      }
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
      if ((e as Error)?.message === 'session_expired') {
        window.location.href = '/start';
        return;
      }
      setError(e instanceof Error ? e.message : 'Add failed');
    }
  }

  async function handleRemoveVersion() {
    if (!selectedItem || pendingDeleteVersionNum === null || !id) return;
    const v = pendingDeleteVersionNum;
    const itemId = selectedItem.id;
    setPendingDeleteVersionNum(null);
    try {
      await removeProjectVersion(itemId, v);
      setViewingVersionNum(null);
      const { versions: versionsList } = await listProjectVersions(itemId);
      setItemVersions(versionsList ?? []);
      getProject(id)
        .then((r) => {
          const itemList = r.items ?? [];
          const proj = r.project ?? null;
          setProject(proj);
          setItems(itemList);
          setProjectName(proj?.name ?? '');
          setSelectedItem((prev) => {
            const next = itemList.find((i) => i.id === prev?.id);
            if (next) return next;
            return itemList.find((i) => i.type === 'image') ?? itemList[0] ?? null;
          });
        })
        .catch((e: unknown) => {
          setError((e as Error)?.message ?? 'Could not refresh project');
        });
    } catch (e: unknown) {
      if ((e as Error)?.message === 'session_expired') {
        window.location.href = '/start';
        return;
      }
      setError((e as Error)?.message ?? 'Failed to remove version');
      try {
        const r = await listProjectVersions(itemId);
        setItemVersions(r.versions ?? []);
      } catch {
        setItemVersions([]);
      }
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
    } catch (e: unknown) {
      if ((e as Error)?.message === 'session_expired') {
        window.location.href = '/start';
        return;
      }
      setError('Failed to remove item');
    }
  }

  function isValidUploadFile(file: File): boolean {
    return file.type.startsWith('image/') || ['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type);
  }

  async function doUploadFile(file: File) {
    if (!id || !project) {
      setError('Please wait for the project to load');
      return;
    }
    if (!isValidUploadFile(file)) {
      setError('Use an image or video (MP4, WebM, QuickTime)');
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const res = await uploadProjectItem(id, file);
      const item = res?.item;
      if (!item?.id) {
        setError('Upload succeeded but invalid response');
        return;
      }
      const newItem: ProjectItem = { ...item, sort_order: items.length };
      setItems((prev) => [...prev, newItem]);
      setSelectedItem(newItem);
    } catch (err) {
      if ((err as Error)?.message === 'session_expired') {
        window.location.href = '/start';
        return;
      }
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleExportToCollection() {
    if (!selectedItem || !referenceUrl) return;
    setExportingToCollection(true);
    setError(null);
    try {
      await exportToCollection(referenceUrl, selectedItem.type);
    } catch (e: unknown) {
      if ((e as Error)?.message === 'session_expired') {
        window.location.href = '/start';
        return;
      }
      setError((e as Error)?.message ?? 'Export failed');
    } finally {
      setExportingToCollection(false);
    }
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    doUploadFile(file);
    e.target.value = '';
  }

  function handleDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setDragOverCount((c) => c + 1);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverCount((c) => Math.max(0, c - 1));
  }

  function handleDrop(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOverCount(0);
    const file = e.dataTransfer.files?.[0];
    if (file) doUploadFile(file);
  }

  async function handleDeleteProject() {
    setPendingDeleteProject(false);
    try {
      await deleteProject(id);
      router.push('/dashboard/studio');
    } catch (e: unknown) {
      if ((e as Error)?.message === 'session_expired') {
        window.location.href = '/start';
        return;
      }
      setError('Failed to delete project');
    }
  }

  async function handleDownload() {
    if (!referenceUrl || !displayUrl) return;
    setDownloading(true);
    try {
      let blob: Blob;
      try {
        blob = await downloadMediaUrl(referenceUrl);
      } catch {
        const res = await fetch(referenceUrl);
        if (!res.ok) throw new Error('Fetch failed');
        blob = await res.blob();
      }
      const ext = getDownloadExt(blob, referenceUrl);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `flipo5-${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError((e as Error)?.message ?? 'Download failed');
    } finally {
      setDownloading(false);
    }
  }

  async function handleRemoveBg() {
    if (!id || !selectedItem || selectedItem.type !== 'image') return;
    const itemId = selectedItem.id;
    setError(null);
    setRemovingBg(true);
    try {
      await removeProjectItemBackground(id, itemId);
      await fetchProject();
      const { versions } = await listProjectVersions(itemId);
      setItemVersions(versions ?? []);
    } catch (e: unknown) {
      if ((e as Error)?.message === 'session_expired') {
        window.location.href = '/start';
        return;
      }
      setError((e as Error)?.message ?? 'Remove background failed');
      setTimeout(async () => {
        await fetchProject();
        try {
          const r = await listProjectVersions(itemId);
          setItemVersions(r.versions ?? []);
        } catch (_) {}
      }, 2000);
    } finally {
      setRemovingBg(false);
    }
  }

  async function pollJobUntilDone(jobId: string): Promise<{ outputUrl: string | null; failed: boolean }> {
    const maxAttempts = 120;
    for (let i = 0; i < maxAttempts; i++) {
      const job = await getJob(jobId);
      if (!job) return { outputUrl: null, failed: true };
      if (job.status === 'completed') {
        const urls = getOutputUrls(job.output ?? {});
        return { outputUrl: urls[0] ?? null, failed: false };
      }
      if (job.status === 'failed') return { outputUrl: null, failed: true };
      await new Promise((r) => setTimeout(r, 2500));
    }
    return { outputUrl: null, failed: true };
  }

  async function handleEdit() {
    if (!selectedItem || selectedItem.type !== 'image' || !referenceUrl || !aiPrompt.trim()) return;
    setError(null);
    setAiEditJobId('…');
    try {
      const { job_id } = await createImage({
        prompt: aiPrompt.trim(),
        size: 'HD',
        imageInput: [referenceUrl],
      });
      const { outputUrl, failed } = await pollJobUntilDone(job_id);
      if (failed || !outputUrl) {
        setError('Edit failed or timed out');
        return;
      }
      await addProjectVersionByUrl(selectedItem.id, outputUrl);
      await fetchProject();
      const { versions } = await listProjectVersions(selectedItem.id);
      const versionsList = versions ?? [];
      setItemVersions(versionsList);
      if (versionsList.length > 0) {
        const newVer = versionsList.find((v) => v.url === outputUrl) ?? versionsList.reduce((a, b) => (a.version_num >= b.version_num ? a : b), versionsList[0]);
        setViewingVersionNum(newVer.version_num);
      }
      setAiPrompt('');
    } catch (e: unknown) {
      if ((e as Error)?.message === 'session_expired') {
        window.location.href = '/start';
        return;
      }
      setError((e as Error)?.message ?? 'Edit failed');
    } finally {
      setAiEditJobId(null);
    }
  }

  async function handleSubmitBrushEdit() {
    if (!selectedItem || selectedItem.type !== 'image' || !referenceUrl || !aiPrompt.trim() || !maskBlobForInpaint) return;
    setError(null);
    setPaintApplying(true);
    try {
      const file = new File([maskBlobForInpaint], 'mask.png', { type: 'image/png' });
      const [maskUrl] = await uploadAttachments([file]);
      if (!maskUrl) {
        setError('Upload mask failed');
        return;
      }
      const { job_id } = await createImageInpaint({
        prompt: aiPrompt.trim(),
        imageUrl: referenceUrl,
        maskUrl,
      });
      setMaskBlobForInpaint(null);
      setAiEditJobId(job_id);
      const { outputUrl, failed } = await pollJobUntilDone(job_id);
      setAiEditJobId(null);
      if (failed || !outputUrl) {
        setError('Edit with brush failed or timed out');
        return;
      }
      await addProjectVersionByUrl(selectedItem.id, outputUrl);
      await fetchProject();
      const { versions } = await listProjectVersions(selectedItem.id);
      const versionsList = versions ?? [];
      setItemVersions(versionsList);
      if (versionsList.length > 0) {
        const newVer = versionsList.find((v) => v.url === outputUrl) ?? versionsList.reduce((a, b) => (a.version_num >= b.version_num ? a : b), versionsList[0]);
        setViewingVersionNum(newVer.version_num);
      }
      setAiPrompt('');
    } catch (e: unknown) {
      if ((e as Error)?.message === 'session_expired') {
        window.location.href = '/start';
        return;
      }
      setError((e as Error)?.message ?? 'Edit failed');
    } finally {
      setPaintApplying(false);
    }
  }

  function handleOpenBrushForInpaint() {
    if (editMode !== 'edit_brush' || !selectedItem || selectedItem.type !== 'image' || !referenceUrl) return;
    setBrushEditForInpaint(true);
    setEditorTool('highlight');
  }

  const handleEditWithBrush = handleOpenBrushForInpaint;

  useEffect(() => {
    if (!previewZoomOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewZoomOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewZoomOpen]);

  function handleMaskOk(maskBlob: Blob) {
    setMaskBlobForInpaint(maskBlob);
    setEditorTool(null);
    setBrushEditForInpaint(false);
  }

  const currentVersionLabel = (() => {
    if (!selectedItem || versionHistory.length === 0) return '0/0';
    if (viewingVersionNum !== null) {
      const entry = versionHistory.find((e) => e.version_num === viewingVersionNum);
      const idx = versionHistory.findIndex((e) => e.version_num === viewingVersionNum);
      return entry ? `${entry.label} (${idx + 1}/${versionHistory.length})` : `${versionHistory.length}/${versionHistory.length}`;
    }
    return `${versionHistory.length}/${versionHistory.length}`;
  })();

  if (loading && !project) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center text-theme-fg-subtle">
        <p>{t(locale, 'common.loading')}</p>
      </div>
    );
  }

  if (!id || !project) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto p-6 scrollbar-subtle">
        <p className="text-theme-fg-subtle">{t(locale, 'studio.projectNotFound')}</p>
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
        <div className="min-h-[48px] h-11 px-3 sm:px-4 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-1 sm:gap-2 min-w-0 shrink-0">
            <Link href="/dashboard/studio" className="text-theme-fg-subtle hover:text-theme-fg min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md -ml-1 sm:ml-0" aria-label="Back">
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
            <span className="text-xs text-theme-fg-subtle shrink-0">{currentVersionLabel} versions</span>
            <Link href="/dashboard/studio" className="px-2.5 py-1.5 rounded-lg border border-theme-border bg-theme-bg-subtle text-theme-fg hover:bg-theme-bg-hover text-xs font-medium shrink-0">
              {t(locale, 'studio.backToProjects')}
            </Link>
          </div>

          {/* Tools bar - center (on mobile: Edit/Tools open drawers first) */}
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-subtle flex-1 min-w-0 justify-center">
            <div className="lg:hidden flex items-center gap-1 shrink-0 mr-1">
              <button type="button" onClick={() => { setLeftPanelOpen(true); setRightPanelOpen(false); }} className="min-h-[44px] px-3 py-2 rounded-lg border border-theme-border bg-theme-bg-hover text-theme-fg text-xs font-medium" aria-label="Edit panel">Edit</button>
              {items.some((i) => i.type === 'image') && (
                <button type="button" onClick={() => { setRightPanelOpen(true); setLeftPanelOpen(false); }} className="min-h-[44px] px-3 py-2 rounded-lg border border-theme-border bg-theme-bg-hover text-theme-fg text-xs font-medium" aria-label="Tools panel">{t(locale, 'studio.tools')}</button>
              )}
            </div>
            <button
              type="button"
              onClick={handleRemoveBg}
              disabled={!selectedItem || selectedItem.type !== 'image' || removingBg}
              className="px-2 py-1.5 rounded text-xs font-medium shrink-0 whitespace-nowrap text-theme-fg-subtle hover:text-theme-fg hover:bg-theme-bg-hover disabled:opacity-50 disabled:pointer-events-none"
              title={t(locale, 'studio.removeBgTitle')}
            >
              {removingBg ? '...' : 'Remove BG'}
            </button>
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              disabled={!selectedItem || selectedItem.type !== 'image' || !referenceUrl}
              className="px-2 py-1.5 rounded text-xs font-medium shrink-0 whitespace-nowrap text-theme-fg-subtle hover:text-theme-fg hover:bg-theme-bg-hover disabled:opacity-50 disabled:pointer-events-none"
              title={t(locale, 'studio.filters')}
            >
              {t(locale, 'studio.filters')}
            </button>
            <button
              type="button"
              onClick={() => setCropRotateOpen(true)}
              disabled={!selectedItem || selectedItem.type !== 'image' || !referenceUrl}
              className="px-2 py-1.5 rounded text-xs font-medium shrink-0 whitespace-nowrap text-theme-fg-subtle hover:text-theme-fg hover:bg-theme-bg-hover disabled:opacity-50 disabled:pointer-events-none"
              title={t(locale, 'studio.cropRotate')}
            >
              {t(locale, 'studio.cropRotate')}
            </button>
            <button
              type="button"
              onClick={() => setAdjustmentsOpen(true)}
              disabled={!selectedItem || selectedItem.type !== 'image' || !referenceUrl}
              className="px-2 py-1.5 rounded text-xs font-medium shrink-0 whitespace-nowrap text-theme-fg-subtle hover:text-theme-fg hover:bg-theme-bg-hover disabled:opacity-50 disabled:pointer-events-none"
              title={t(locale, 'studio.adjustments')}
            >
              {t(locale, 'studio.adjustments')}
            </button>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button type="button" onClick={handleDownload} disabled={!displayUrl || downloading} className="p-2 rounded-lg text-theme-fg-subtle hover:text-theme-fg hover:bg-theme-bg-hover disabled:opacity-40" title="Download">
              {downloading ? (
                <span className="w-5 h-5 block border-2 border-theme-fg-subtle border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              )}
            </button>
            <button type="button" onClick={handleExportToCollection} disabled={!selectedItem || !referenceUrl || exportingToCollection} className="p-2 rounded-lg text-theme-fg-subtle hover:text-theme-fg hover:bg-theme-bg-hover disabled:opacity-50" title={t(locale, 'studio.exportToCollection')}>
              {exportingToCollection ? (
                <span className="w-5 h-5 block border-2 border-theme-fg-subtle border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              )}
            </button>
          </div>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*,video/mp4,video/webm,video/quicktime" className="hidden" onChange={handleUpload} disabled={uploading} />
      </header>

      {/* Main: sidebar + canvas — on lg sidebars inline; on mobile drawers */}
      <div className="flex-1 min-h-0 flex overflow-hidden relative">
        {/* Backdrop when a panel is open on mobile */}
        {(leftPanelOpen || rightPanelOpen) && (
          <div
            className="lg:hidden fixed inset-0 z-30 bg-theme-bg-overlay"
            onClick={() => { setLeftPanelOpen(false); setRightPanelOpen(false); }}
            aria-hidden
          />
        )}
        {/* Left sidebar: Edit | Edit using Brush (top), AI prompt (bottom) — drawer on mobile */}
        <aside className={`fixed lg:relative inset-y-0 left-0 z-40 w-72 lg:w-52 shrink-0 flex flex-col border-r border-theme-border bg-theme-bg p-4 transition-transform duration-200 lg:translate-x-0 ${leftPanelOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex items-center justify-between mb-3 lg:hidden">
            <span className="text-sm font-medium text-theme-fg">Edit</span>
            <button type="button" onClick={() => setLeftPanelOpen(false)} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-theme-fg-muted hover:text-theme-fg" aria-label="Close">×</button>
          </div>
          <div className="mb-4">
            <label className="block text-xs font-medium text-theme-fg-muted mb-1.5">Edit</label>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => { setEditMode('edit'); setMaskBlobForInpaint(null); }}
                className={`flex-1 px-2 py-1.5 rounded-md border text-xs font-medium flex items-center justify-center gap-1 ${editMode === 'edit' ? 'border-theme-accent bg-theme-accent/10 text-theme-accent' : 'border-theme-border bg-theme-bg-hover text-theme-fg hover:bg-theme-bg-hover-strong'}`}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditMode('edit_brush');
                  setMaskBlobForInpaint(null);
                  if (selectedItem?.type === 'image' && referenceUrl) {
                    setBrushEditForInpaint(true);
                    setEditorTool('highlight');
                  }
                }}
                className={`flex-1 px-2 py-1.5 rounded-md border text-xs font-medium flex items-center justify-center gap-1 ${editMode === 'edit_brush' ? 'border-theme-accent bg-theme-accent/10 text-theme-accent' : 'border-theme-border bg-theme-bg-hover text-theme-fg hover:bg-theme-bg-hover-strong'}`}
                title="Edit using Brush"
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                Edit
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 flex flex-col justify-end">
            <div>
              <label className="block text-xs font-medium text-theme-fg-muted mb-2">AI prompt</label>
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' || e.shiftKey) return;
                  e.preventDefault();
                  if (editMode === 'edit' && referenceUrl && aiPrompt.trim() && !aiEditJobId) handleEdit();
                  else if (editMode === 'edit_brush' && maskBlobForInpaint && aiPrompt.trim() && !aiEditJobId && !paintApplying) handleSubmitBrushEdit();
                }}
                placeholder={editMode === 'edit_brush' && !maskBlobForInpaint ? 'Paint zone, press OK, then describe the edit...' : 'Describe how I should edit the image...'}
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-theme-border bg-theme-bg-subtle text-theme-fg placeholder:text-theme-fg-subtle text-sm focus:outline-none focus:ring-1 focus:ring-theme-border-strong focus:border-transparent resize-none mb-2"
              />
              {editMode === 'edit' && (
                <button
                  type="button"
                  onClick={handleEdit}
                  disabled={!referenceUrl || !aiPrompt.trim() || !!aiEditJobId}
                  className="w-full px-3 py-2 rounded-lg border border-theme-border bg-theme-bg-hover text-theme-fg hover:bg-theme-bg-hover-strong disabled:opacity-50 text-sm font-medium"
                >
                  {aiEditJobId ? '...' : 'Edit'}
                </button>
              )}
              {editMode === 'edit_brush' && (
                <>
                  {maskBlobForInpaint ? (
                    <button
                      type="button"
                      onClick={handleSubmitBrushEdit}
                      disabled={!aiPrompt.trim() || !!aiEditJobId || paintApplying}
                      className="w-full px-3 py-2 rounded-lg bg-theme-accent text-theme-fg-inverse hover:opacity-90 disabled:opacity-50 text-sm font-medium"
                    >
                      {paintApplying || aiEditJobId ? '...' : 'Edit with AI'}
                    </button>
                  ) : (
                    <p className="text-xs text-theme-fg-subtle">Use Brush in the tools panel (right), paint the zone, then OK.</p>
                  )}
                </>
              )}
              {referenceUrl && (
                <p className="mt-1.5 text-xs text-theme-fg-subtle">Reference: last selected image</p>
              )}
            </div>
          </div>
        </aside>

        {/* Main canvas: drop zone for upload + selected image + bottom strip */}
        <main
          className="flex-1 min-h-0 flex flex-col overflow-hidden bg-theme-bg bg-grid-dark relative"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {dragOverCount > 0 && !uploading && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-theme-bg/90 border-2 border-dashed border-theme-accent rounded-lg m-2 pointer-events-none">
              <p className="text-theme-fg font-medium">{t(locale, 'studio.upload')} — drop here</p>
            </div>
          )}
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
            <div className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 min-h-0 flex items-center justify-center p-4 overflow-auto relative scrollbar-subtle">
                {(removingBg || aiEditJobId) && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-theme-bg/85 rounded-lg">
                    <div className="flex flex-col items-center gap-3 text-theme-fg">
                      <div className="w-10 h-10 border-2 border-theme-accent border-t-transparent rounded-full animate-spin" />
                      <p className="text-sm font-medium">
                        {removingBg ? t(locale, 'studio.removingBackground') : t(locale, 'studio.editingWithAi')}
                      </p>
                    </div>
                  </div>
                )}
                {editorTool && selectedItem?.type === 'image' && referenceUrl && !((displayUrl && displayUrl.startsWith('http')) || referenceUrl.startsWith('http')) ? (
                  <div className="flex flex-col items-center justify-center gap-2 text-theme-fg-subtle py-12">
                    <div className="w-8 h-8 border-2 border-theme-accent border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm">Loading image…</p>
                  </div>
                ) : selectedItem && displayUrl ? (
                  <div
                    className={`relative group flex items-center justify-center transition-[filter] duration-200 overflow-hidden ${removingBg || aiEditJobId ? 'blur-sm' : ''} ${!editorTool ? 'cursor-grab active:cursor-grabbing' : ''}`}
                    onMouseDown={(e) => {
                      if (editorTool || selectedItem?.type !== 'image') return;
                      if ((e.target as HTMLElement).closest('button')) return;
                      setCanvasDragging(true);
                      canvasDragRef.current = { startX: e.clientX, startY: e.clientY, startPan: { ...canvasPan } };
                    }}
                    onMouseMove={(e) => {
                      if (!canvasDragging) return;
                      setCanvasPan({
                        x: canvasDragRef.current.startPan.x + (e.clientX - canvasDragRef.current.startX),
                        y: canvasDragRef.current.startPan.y + (e.clientY - canvasDragRef.current.startY),
                      });
                    }}
                    onMouseUp={() => setCanvasDragging(false)}
                    onMouseLeave={() => setCanvasDragging(false)}
                  >
                    <div
                      ref={imageWrapRef}
                      className="relative origin-center"
                      style={{
                        transform: `translate(${canvasPan.x}px, ${canvasPan.y}px) scale(${canvasScale})`,
                        ...(imageBoxSize ? { width: imageBoxSize.w, height: imageBoxSize.h } : {}),
                      }}
                    >
                      {editorTool === 'logo' && logoOverlays.length > 0 && selectedItem?.type === 'image' && displayUrl ? (
                        <MultiLogoPlacer
                          baseImageUrl={displayUrl}
                          overlays={logoOverlays}
                          getLogoDisplayUrl={(url) => getMediaDisplayUrl(url, mediaToken) ?? url}
                          onUpdate={(id, patch) => {
                            setLogoOverlays((prev) => prev.map((o) => o.id === id ? { ...o, ...patch } : o));
                          }}
                          onRemove={(id) => setLogoOverlays((prev) => prev.filter((o) => o.id !== id))}
                          onApplyElement={async (canvas, id) => {
                            if (!selectedItem) return;
                            setLogoApplying(true);
                            setError(null);
                            try {
                              const blob = await new Promise<Blob>((res, rej) => {
                                canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png');
                              });
                              const file = new File([blob], 'with-element.png', { type: 'image/png' });
                              await uploadProjectVersion(selectedItem.id, file);
                              await fetchProject();
                              const { versions } = await listProjectVersions(selectedItem.id);
                              setItemVersions(versions ?? []);
                              const maxVer = versions?.length ? Math.max(...versions.map((v) => v.version_num)) : 0;
                              setViewingVersionNum(maxVer);
                              setLogoOverlays((prev) => prev.filter((o) => o.id !== id));
                            } catch (e) {
                              setError((e as Error)?.message ?? 'Apply failed');
                            } finally {
                              setLogoApplying(false);
                            }
                          }}
                          onApply={async (canvas) => {
                            if (!selectedItem) return;
                            setLogoApplying(true);
                            setError(null);
                            try {
                              const blob = await new Promise<Blob>((res, rej) => {
                                canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png');
                              });
                              const file = new File([blob], 'with-logo.png', { type: 'image/png' });
                              await uploadProjectVersion(selectedItem.id, file);
                              await fetchProject();
                              const { versions } = await listProjectVersions(selectedItem.id);
                              setItemVersions(versions ?? []);
                              setEditorTool(null);
                              setLogoOverlays([]);
                            } catch (e) {
                              setError((e as Error)?.message ?? 'Apply failed');
                            } finally {
                              setLogoApplying(false);
                            }
                          }}
                          onClose={() => { setEditorTool(null); setLogoOverlays([]); setTextBarTargetId(null); }}
                          applying={logoApplying}
                          contentSize={imageBoxSize ?? { w: 400, h: 400 }}
                        />
                      ) : editorTool && editorTool !== 'logo' && selectedItem?.type === 'image' && referenceUrl && ((displayUrl && displayUrl.startsWith('http')) || referenceUrl.startsWith('http')) ? (
                        <PaintCanvas
                          imageUrl={(displayUrl && displayUrl.startsWith('http') ? displayUrl : referenceUrl) as string}
                          tool={editorTool}
                          brushSize={brushSize}
                          colorizeColor={colorizeColor}
                          highlightColor={highlightColor}
                          highlightOpacity={highlightOpacity}
                          contentSize={imageBoxSize ?? undefined}
                          onApply={async (canvas) => {
                      setPaintApplying(true);
                      setError(null);
                      try {
                        const blob = await new Promise<Blob>((res, rej) => {
                          canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png');
                        });
                        const file = new File([blob], 'paint.png', { type: 'image/png' });
                        await uploadProjectVersion(selectedItem.id, file);
                        await fetchProject();
                        const { versions } = await listProjectVersions(selectedItem.id);
                        setItemVersions(versions ?? []);
                        setEditorTool(null);
                        setBrushEditForInpaint(false);
                      } catch (e) {
                        setError((e as Error)?.message ?? 'Apply failed');
                      } finally {
                        setPaintApplying(false);
                      }
                    }}
                    onMaskOk={brushEditForInpaint ? handleMaskOk : undefined}
                          onClose={() => { setEditorTool(null); setBrushEditForInpaint(false); }}
                          applying={paintApplying}
                          locale={locale}
                        />
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => !canvasDragging && selectedItem.type === 'image' && setPreviewZoomOpen(true)}
                            className="block w-full h-full min-w-0 min-h-0 relative group/img"
                          >
                            {selectedItem.type === 'video' ? (
                              <video src={displayUrl} className="max-w-full max-h-[calc(100vh-14rem)] object-contain" controls playsInline />
                            ) : (
                              <>
                                <img src={displayUrl} alt="" className="max-w-full max-h-[calc(100vh-14rem)] object-contain" draggable={false} decoding="async" />
                                <span className="absolute bottom-2 right-2 px-2 py-1 rounded-lg bg-theme-bg-overlay text-theme-fg-subtle opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center gap-1.5 text-xs" title={t(locale, 'studio.previewZoom')}>
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /></svg>
                                  {t(locale, 'studio.previewZoom')}
                                </span>
                              </>
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
                        </>
                      )}
                    </div>
                    {editorTool === 'logo' && textBarTargetId && (() => {
                      const o = logoOverlays.find((x) => x.id === textBarTargetId);
                      if (!o || o.type !== 'text') return null;
                      return (
                        <TextFloatingBar
                          overlay={o}
                          onUpdate={(patch) => setLogoOverlays((prev) => prev.map((x) => (x.id === textBarTargetId ? { ...x, ...patch } : x)))}
                          onApply={() => setTextBarTargetId(null)}
                          locale={locale}
                        />
                      );
                    })()}
                    <div className="absolute bottom-2 right-2 flex items-center gap-2 px-2 py-1.5 rounded-lg bg-theme-bg-overlay opacity-0 group-hover:opacity-100 transition-opacity">
                      <button type="button" onClick={() => setCanvasScale((s) => Math.max(0.25, s - 0.25))} className="p-1 rounded text-theme-fg hover:bg-theme-bg-hover" title="Smaller">−</button>
                      <span className="text-xs text-theme-fg min-w-[3rem] text-center">{Math.round(canvasScale * 100)}%</span>
                      <button type="button" onClick={() => setCanvasScale((s) => Math.min(3, s + 0.25))} className="p-1 rounded text-theme-fg hover:bg-theme-bg-hover" title="Larger">+</button>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Version history: only when item has at least 2 versions */}
              {selectedItem && versionHistory.length >= 2 && (
                <div className="shrink-0 border-t border-theme-border bg-theme-bg px-3 py-2">
                  <p className="text-xs text-theme-fg-subtle mb-2">{t(locale, 'studio.versionHistory')}</p>
                  <div className="flex items-center gap-2 overflow-x-auto scrollbar-subtle">
                    {versionHistory.map((entry) => {
                      const latestEntry = versionHistory[versionHistory.length - 1];
                      const active = viewingVersionNum === entry.version_num || (viewingVersionNum === null && latestEntry && entry.version_num === latestEntry.version_num);
                      const thumbUrl = getSafeDisplayUrl(entry.url, mediaToken);
                      const canDeleteVersion = entry.version_num >= 1;
                      return (
                        <div key={entry.version_num} className="relative shrink-0 w-14 h-14">
                          <button
                            type="button"
                            onClick={() => setViewingVersionNum(entry.version_num)}
                            className={`w-full h-full rounded-lg overflow-hidden border-2 transition-colors ${
                              active ? 'border-theme-accent ring-2 ring-theme-accent/50' : 'border-theme-border hover:border-theme-border-hover'
                            }`}
                            title={entry.label}
                          >
                            {thumbUrl ? (
                              selectedItem.type === 'video' ? (
                                <video src={thumbUrl} className="w-full h-full object-cover" muted preload="metadata" playsInline />
                              ) : (
                                <img src={thumbUrl} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                              )
                            ) : (
                              <span className="flex w-full h-full items-center justify-center text-theme-fg-subtle text-xs">…</span>
                            )}
                            <span className="absolute bottom-0 left-0 right-0 py-0.5 bg-theme-bg-overlay/90 text-[10px] text-theme-fg text-center font-medium">
                              {entry.label}
                            </span>
                          </button>
                          {canDeleteVersion && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setPendingDeleteVersionNum(entry.version_num); }}
                              className="absolute top-0 right-0 z-10 w-5 h-5 rounded bg-theme-bg-overlay hover:bg-theme-danger text-theme-fg flex items-center justify-center text-xs font-bold"
                              title={t(locale, 'studio.deleteVersion')}
                              aria-label={t(locale, 'studio.deleteVersion')}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {versionHistory.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setViewingVersionNum(null)}
                        className={`shrink-0 px-2 py-1.5 rounded-lg border-2 text-xs font-medium ${
                          viewingVersionNum === null ? 'border-theme-accent bg-theme-accent/10 text-theme-accent' : 'border-theme-border hover:border-theme-border-hover text-theme-fg-subtle'
                        }`}
                        title={t(locale, 'studio.latestVersionTitle')}
                      >
                        {t(locale, 'studio.latestVersion')}
                      </button>
                    )}
                  </div>
                </div>
              )}

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
                    const thumbUrl = getSafeDisplayUrl(item.latest_url || item.source_url, mediaToken);
                    return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedItem(item)}
                      className={`w-16 h-16 rounded-lg overflow-hidden shrink-0 border-2 transition-colors relative ${
                        selectedItem?.id === item.id ? 'border-theme-border-strong ring-2 ring-theme-border-strong' : 'border-theme-border hover:border-theme-border-hover'
                      }`}
                    >
                      {thumbUrl ? (item.type === 'video' ? (
                        <video src={thumbUrl} className="w-full h-full object-cover" muted preload="metadata" playsInline />
                      ) : (
                        <img src={thumbUrl} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                      )) : (
                        <div className="w-full h-full bg-theme-bg-subtle flex items-center justify-center text-theme-fg-subtle text-xs">…</div>
                      )}
                      <span className="absolute top-0.5 right-0.5 px-1 rounded bg-theme-bg-overlay text-[10px] text-theme-fg font-medium">
                        {(item.version_num ?? 0) === 0 ? 'Original' : `v${(item.version_num ?? 0) + 1}`}
                      </span>
                    </button>
                  );})}
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Right toolbar: tools (clone, colorize, highlight/brush) — drawer on mobile */}
        {items.some((i) => i.type === 'image') && (
          <aside className={`fixed lg:relative inset-y-0 right-0 z-40 w-72 lg:w-40 shrink-0 flex flex-col border-l border-theme-border bg-theme-bg p-3 min-w-0 transition-transform duration-200 lg:translate-x-0 ${rightPanelOpen ? 'translate-x-0' : 'translate-x-full'}`}>
            <div className="flex items-center justify-between mb-2 lg:hidden">
              <p className="text-sm font-medium text-theme-fg">{t(locale, 'studio.tools')}</p>
              <button type="button" onClick={() => setRightPanelOpen(false)} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-theme-fg-muted hover:text-theme-fg" aria-label="Close">×</button>
            </div>
            <p className="text-xs font-medium text-theme-fg-muted mb-2 hidden lg:block">{t(locale, 'studio.tools')}</p>
            {selectedItem?.type !== 'image' ? (
              <p className="text-xs text-theme-fg-subtle">Select an image below to use tools.</p>
            ) : (
            <>
            <div className="flex flex-col gap-1.5 mb-3">
              <button
                type="button"
                onClick={() => setEditorTool(editorTool === 'clone' ? null : 'clone')}
                className={`px-2.5 py-2 rounded-lg border text-left flex items-center gap-2 min-w-0 ${editorTool === 'clone' ? 'border-theme-accent bg-theme-accent/10 text-theme-accent' : 'border-theme-border bg-theme-bg-hover text-theme-fg hover:bg-theme-bg-hover-strong'}`}
                title={t(locale, 'studio.tool.cloneStamp')}
              >
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span className="text-xs font-medium truncate">{t(locale, 'studio.tool.cloneStamp')}</span>
              </button>
              <button
                type="button"
                onClick={() => setEditorTool(editorTool === 'colorize' ? null : 'colorize')}
                className={`px-2.5 py-2 rounded-lg border text-left flex items-center gap-2 min-w-0 ${editorTool === 'colorize' ? 'border-theme-accent bg-theme-accent/10 text-theme-accent' : 'border-theme-border bg-theme-bg-hover text-theme-fg hover:bg-theme-bg-hover-strong'}`}
                title={t(locale, 'studio.tool.colorize')}
              >
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
                <span className="text-xs font-medium truncate">{t(locale, 'studio.tool.colorize')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (editMode === 'edit_brush' && referenceUrl) {
                    handleOpenBrushForInpaint();
                  } else {
                    setEditorTool(editorTool === 'highlight' ? null : 'highlight');
                  }
                }}
                className={`px-2.5 py-2 rounded-lg border text-left flex items-center gap-2 min-w-0 ${
                  editorTool === 'highlight' || (editMode === 'edit_brush' && referenceUrl)
                    ? 'border-theme-accent bg-theme-accent/10 text-theme-accent'
                    : 'border-theme-border bg-theme-bg-hover text-theme-fg hover:bg-theme-bg-hover-strong'
                }`}
                title={editMode === 'edit_brush' ? 'Paint zone to edit' : t(locale, 'studio.tool.highlight')}
              >
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                <span className="text-xs font-medium truncate">{editMode === 'edit_brush' ? 'Brush' : t(locale, 'studio.tool.highlight')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (editorTool === 'logo') {
                    setEditorTool(null);
                    setLogoOverlays([]);
                    setShowLogoDialog(false);
                    setTextBarTargetId(null);
                  } else {
                    setEditorTool('logo');
                  }
                }}
                className={`px-2.5 py-2 rounded-lg border text-left flex items-center gap-2 min-w-0 ${editorTool === 'logo' ? 'border-theme-accent bg-theme-accent/10 text-theme-accent' : 'border-theme-border bg-theme-bg-hover text-theme-fg hover:bg-theme-bg-hover-strong'}`}
                title={t(locale, 'studio.tool.logo')}
              >
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-xs font-medium truncate">{t(locale, 'studio.tool.logo')}</span>
              </button>
            </div>
            {editorTool === 'logo' && (
              <div className="mb-3 pt-2 border-t border-theme-border">
                <p className="text-xs font-medium text-theme-fg-muted mb-2">{t(locale, 'studio.elementsOnImage')}</p>
                <div className="flex flex-col gap-1.5 mb-2">
                  <button
                    type="button"
                    onClick={() => setShowLogoDialog(true)}
                    className="w-full px-2.5 py-2 rounded-lg border border-theme-border bg-theme-bg-hover text-theme-fg text-xs font-medium text-left"
                  >
                    + {t(locale, 'studio.element')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const newId = crypto.randomUUID();
                      const newOverlay: LogoOverlayItem = {
                        id: newId,
                        type: 'text',
                        text: 'Text',
                        fontSize: 16 / 400,
                        fontFamily: 'Arial',
                        color: '#ffffff',
                        pos: { x: 0.5, y: 0.5 },
                        size: { w: 0.4, h: 0.12 },
                        rotation: 0,
                      };
                      setLogoOverlays((prev) => [...prev, newOverlay]);
                      setTextBarTargetId(newId);
                    }}
                    className="w-full px-2.5 py-2 rounded-lg border border-theme-border bg-theme-bg-hover text-theme-fg text-xs font-medium text-left"
                  >
                    + {t(locale, 'studio.text')}
                  </button>
                </div>
                <div className="flex flex-col gap-1 max-h-40 overflow-y-auto scrollbar-subtle">
                  {logoOverlays.map((o) => (
                    <div key={o.id} className="flex items-center gap-2 rounded-lg border border-theme-border bg-theme-bg-hover p-1.5">
                      <div className="w-8 h-8 rounded overflow-hidden flex-shrink-0 bg-theme-bg-subtle flex items-center justify-center">
                        {o.type === 'image' ? (
                          <img src={getMediaDisplayUrl(o.url, mediaToken) ?? o.url} alt="" className="w-full h-full object-contain" loading="lazy" decoding="async" />
                        ) : (
                          <span className="text-[10px] text-theme-fg-muted font-bold">T</span>
                        )}
                      </div>
                      <span className="flex-1 min-w-0 text-xs text-theme-fg truncate" title={o.type === 'image' ? o.name : o.text}>{o.type === 'image' ? o.name : o.text}</span>
                      <button
                        type="button"
                        onClick={() => setLogoOverlays((prev) => prev.filter((e) => e.id !== o.id))}
                        className="p-1 rounded text-theme-fg-subtle hover:text-theme-danger hover:bg-theme-bg-subtle"
                        aria-label="Remove"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {editorTool && editorTool !== 'logo' && (
              <>
                <label className="text-xs font-medium text-theme-fg-muted mb-1 block">{t(locale, 'studio.brushSize')}</label>
                <input
                  type="range"
                  min={4}
                  max={80}
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="w-full h-2 rounded-lg appearance-none bg-theme-bg-hover accent-theme-accent mb-3"
                />
                {editorTool === 'colorize' && (
                  <div className="mb-3">
                    <ThemeColorPicker label="Color" value={colorizeColor} onChange={setColorizeColor} />
                  </div>
                )}
                {editorTool === 'highlight' && (
                  <>
                    <div className="mb-2">
                      <ThemeColorPicker label="Highlight" value={highlightColor} onChange={setHighlightColor} />
                    </div>
                    <label className="text-xs font-medium text-theme-fg-muted mb-1 block">Opacity</label>
                    <input
                      type="range"
                      min={0.1}
                      max={1}
                      step={0.1}
                      value={highlightOpacity}
                      onChange={(e) => setHighlightOpacity(Number(e.target.value))}
                      className="w-full h-2 rounded-lg appearance-none bg-theme-bg-hover accent-theme-accent mb-3"
                    />
                  </>
                )}
              </>
            )}
            </>
            )}
          </aside>
        )}
      </div>

      {showAddFromContent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-theme-bg-overlay">
          <div className="bg-theme-bg-elevated rounded-2xl border border-theme-border w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-theme-border flex justify-between items-center">
              <h3 className="font-semibold text-theme-fg">{t(locale, 'studio.addFromContent')}</h3>
              <button type="button" onClick={() => setShowAddFromContent(false)} className="text-theme-fg-subtle hover:text-theme-fg text-2xl">×</button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 grid grid-cols-3 sm:grid-cols-4 gap-2">
              {contentLoading ? (
                <p className="col-span-full text-theme-fg-subtle text-sm py-4">{t(locale, 'common.loading')}</p>
              ) : contentJobs.length === 0 ? (
                <p className="col-span-full text-theme-fg-subtle text-sm py-4">{t(locale, 'studio.noContent')}</p>
              ) : contentJobs.map((job) =>
                job.outputUrls.slice(0, 4).map((url, i) => {
                  const cellUrl = getSafeDisplayUrl(url, mediaToken);
                  return (
                    <button
                      key={`${job.id}-${i}`}
                      type="button"
                      onClick={() => handleAddItem(url, job.type as 'image' | 'video', job.id)}
                      className="aspect-square rounded-lg overflow-hidden border border-theme-border hover:border-theme-accent"
                    >
                      {cellUrl ? (job.type === 'video' ? (
                        <video src={cellUrl} className="w-full h-full object-cover" muted preload="metadata" playsInline />
                      ) : (
                        <img src={cellUrl} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                      )) : (
                        <div className="w-full h-full bg-theme-bg-subtle flex items-center justify-center text-theme-fg-subtle text-xs">…</div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {cropRotateOpen && selectedItem && referenceUrl && (
        <CropRotateModal
          imageUrl={referenceUrl}
          itemId={selectedItem.id}
          onClose={() => setCropRotateOpen(false)}
          onSuccess={async () => {
            await fetchProject();
            const { versions } = await listProjectVersions(selectedItem.id);
            setItemVersions(versions ?? []);
          }}
          onUpload={async (itemId, file) => {
            await uploadProjectVersion(itemId, file);
          }}
          locale={locale}
        />
      )}
      {adjustmentsOpen && selectedItem && referenceUrl && (
        <AdjustmentsModal
          imageUrl={referenceUrl}
          itemId={selectedItem.id}
          onClose={() => setAdjustmentsOpen(false)}
          onSuccess={async () => {
            await fetchProject();
            const { versions } = await listProjectVersions(selectedItem.id);
            setItemVersions(versions ?? []);
          }}
          onUpload={async (itemId, file) => {
            await uploadProjectVersion(itemId, file);
          }}
          locale={locale}
        />
      )}
      {filtersOpen && selectedItem && referenceUrl && (
        <FiltersModal
          imageUrl={referenceUrl}
          itemId={selectedItem.id}
          onClose={() => setFiltersOpen(false)}
          onSuccess={async () => {
            await fetchProject();
            const { versions } = await listProjectVersions(selectedItem.id);
            setItemVersions(versions ?? []);
          }}
          onUpload={async (itemId, file) => {
            await uploadProjectVersion(itemId, file);
          }}
          locale={locale}
        />
      )}
      {previewZoomOpen && selectedItem?.type === 'image' && displayUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-theme-bg-overlay-strong p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t(locale, 'studio.previewZoom')}
        >
          <button
            type="button"
            onClick={() => setPreviewZoomOpen(false)}
            className="absolute inset-0"
            aria-hidden
          />
          <div className="relative z-10 max-w-[95vw] max-h-[95vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <img
              src={displayUrl}
              alt=""
              className="max-w-full max-h-[95vh] w-auto h-auto object-contain rounded-lg shadow-2xl"
              style={{ maxWidth: 'min(95vw, 100%)', maxHeight: '95vh' }}
              draggable={false}
            />
          </div>
          <button
            type="button"
            onClick={() => setPreviewZoomOpen(false)}
            className="absolute top-4 right-4 z-20 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-theme-bg-overlay-strong border border-theme-border text-theme-fg hover:bg-theme-bg-hover"
            aria-label={t(locale, 'dialog.cancel')}
          >
            ×
          </button>
        </div>
      )}

      <ConfirmDialog open={!!pendingDeleteItem} title="Remove item" message="Remove this item from the project?" confirmLabel="Remove" cancelLabel={t(locale, 'dialog.cancel')} confirmClass="bg-theme-danger-muted text-theme-danger hover:bg-theme-danger-muted" onConfirm={handleRemoveItem} onCancel={() => setPendingDeleteItem(null)} />
      <ConfirmDialog open={pendingDeleteVersionNum !== null} title={t(locale, 'studio.deleteVersion')} message={t(locale, 'studio.deleteVersionConfirm')} confirmLabel={t(locale, 'studio.delete')} cancelLabel={t(locale, 'dialog.cancel')} confirmClass="bg-theme-danger-muted text-theme-danger hover:bg-theme-danger-muted" onConfirm={handleRemoveVersion} onCancel={() => setPendingDeleteVersionNum(null)} />
      <ConfirmDialog open={pendingDeleteProject} title="Delete project" message="Delete this project and all its items? This cannot be undone." confirmLabel="Delete" cancelLabel={t(locale, 'dialog.cancel')} confirmClass="bg-theme-danger-muted text-theme-danger hover:bg-theme-danger-muted" onConfirm={handleDeleteProject} onCancel={() => setPendingDeleteProject(false)} />
      {selectedItem?.type === 'image' && (
        <LogoDialog
          open={showLogoDialog}
          onClose={() => setShowLogoDialog(false)}
          onSelectLogo={(url, name) => {
            setLogoOverlays((prev) => [
              ...prev,
              { id: crypto.randomUUID(), type: 'image', url, name, pos: { x: 0.5, y: 0.5 }, size: { w: 0.2, h: 0.2 }, rotation: 0 },
            ]);
          }}
          mediaToken={mediaToken}
          locale={locale}
          savedLogos={savedLogos}
          onSaveLogo={(logo) => {
            setSavedLogos((prev) => {
              const next = [logo, ...prev.filter((l) => l.url !== logo.url)];
              saveLogosToStorage(next);
              return next;
            });
          }}
        />
      )}
    </div>
  );
}
