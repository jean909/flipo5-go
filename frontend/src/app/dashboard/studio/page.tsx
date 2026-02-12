'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useLocale } from '@/app/components/LocaleContext';
import { listProjects, createProject, updateProject, deleteProject, type Project } from '@/lib/api';
import { t } from '@/lib/i18n';
import { ConfirmDialog } from '@/components/ConfirmDialog';

export default function StudioPage() {
  const { locale } = useLocale();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [nameError, setNameError] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; project: Project } | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null);
  const [editName, setEditName] = useState('');
  const contextRef = useRef<HTMLDivElement>(null);

  const refresh = () => listProjects().then((r) => setProjects(r.projects ?? [])).catch(() => setProjects([]));

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const close = () => setContextMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  async function handleCreate() {
    setNameError('');
    const name = newName.trim() || 'Untitled';
    // Check duplicate on client
    if (projects.some((p) => p.name === name)) {
      setNameError(t(locale, 'studio.nameExists'));
      return;
    }
    setCreating(true);
    try {
      const { id } = await createProject(name);
      setShowCreate(false);
      setNewName('');
      window.location.href = `/dashboard/studio/${id}`;
    } catch (e: unknown) {
      if ((e as Error)?.message === 'name_exists') {
        setNameError(t(locale, 'studio.nameExists'));
      }
      setCreating(false);
    } finally {
      setCreating(false);
    }
  }

  async function handleRename() {
    if (!editingProject) return;
    const name = editName.trim();
    if (!name) return;
    if (projects.some((p) => p.id !== editingProject.id && p.name === name)) {
      setNameError(t(locale, 'studio.nameExists'));
      return;
    }
    try {
      await updateProject(editingProject.id, name);
      setProjects((prev) => prev.map((p) => (p.id === editingProject.id ? { ...p, name } : p)));
      setEditingProject(null);
      setEditName('');
      setNameError('');
    } catch (e: unknown) {
      if ((e as Error)?.message === 'name_exists') {
        setNameError(t(locale, 'studio.nameExists'));
      }
    }
  }

  async function handleDelete(project: Project) {
    try {
      await deleteProject(project.id);
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
      setContextMenu(null);
      setPendingDelete(null);
    } catch {}
  }

  function openContextMenu(e: React.MouseEvent, project: Project) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, project });
  }

  // Projects sorted by updated_at desc (backend already returns this)
  const sortedProjects = [...projects].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-6 scrollbar-subtle" ref={contextRef}>
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-theme-fg">{t(locale, 'studio.title')}</h1>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-xl bg-theme-accent-muted text-theme-accent hover:bg-theme-accent-hover text-sm font-medium transition-colors"
          >
            {t(locale, 'studio.createProject')}
          </button>
        </div>

        {loading && <p className="text-theme-fg-subtle">{t(locale, 'common.loading')}</p>}

        {!loading && projects.length === 0 && (
          <p className="text-theme-fg-subtle">{t(locale, 'studio.empty')}</p>
        )}

        {!loading && projects.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-medium text-theme-fg-muted mb-3">{t(locale, 'studio.continueProjects')}</h2>
            <ul className="space-y-2">
              {sortedProjects.map((p) => (
                <li key={p.id}>
                  {editingProject?.id === p.id ? (
                    <div className="flex gap-2 items-center p-3 rounded-xl bg-theme-bg-subtle border border-theme-border">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                        className="flex-1 px-3 py-2 rounded-lg border border-theme-border bg-theme-bg text-theme-fg"
                        autoFocus
                      />
                      <button type="button" onClick={handleRename} className="px-3 py-2 rounded-lg bg-theme-accent-muted text-theme-accent text-sm">
                        Save
                      </button>
                      <button type="button" onClick={() => { setEditingProject(null); setEditName(''); setNameError(''); }} className="px-3 py-2 rounded-lg text-theme-fg-subtle text-sm">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <Link
                      href={`/dashboard/studio/${p.id}`}
                      onContextMenu={(e) => openContextMenu(e, p)}
                      className="block p-4 rounded-xl border border-theme-border bg-theme-bg-subtle hover:bg-theme-bg-hover hover:border-theme-border-hover transition-colors"
                    >
                      <p className="font-medium text-theme-fg truncate">{p.name || t(locale, 'studio.untitled')}</p>
                      <p className="text-xs text-theme-fg-subtle mt-1">
                        {new Date(p.updated_at).toLocaleDateString(locale, {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {contextMenu && (
          <div
            className="fixed z-50 py-1 rounded-lg bg-theme-bg-elevated border border-theme-border shadow-xl min-w-[140px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              type="button"
              onClick={() => {
                setEditingProject(contextMenu.project);
                setEditName(contextMenu.project.name || '');
                setContextMenu(null);
              }}
              className="w-full px-4 py-2 text-left text-sm text-theme-fg hover:bg-theme-bg-hover"
            >
              {t(locale, 'studio.rename')}
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingDelete(contextMenu.project);
                setContextMenu(null);
              }}
              className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-500/10"
            >
              {t(locale, 'studio.delete')}
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        title={t(locale, 'studio.delete')}
        message="Delete this project and all its items? This cannot be undone."
        confirmLabel={t(locale, 'studio.delete')}
        cancelLabel={t(locale, 'dialog.cancel')}
        confirmClass="bg-red-500/20 text-red-400 hover:bg-red-500/30"
        onConfirm={() => pendingDelete && handleDelete(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
      <ConfirmDialog
        open={showCreate}
        title={t(locale, 'studio.createProject')}
        message=""
        confirmLabel={t(locale, 'studio.createProject')}
        cancelLabel={t(locale, 'dialog.cancel')}
        confirmClass="bg-theme-accent-muted text-theme-accent hover:bg-theme-accent-hover"
        onConfirm={handleCreate}
        onCancel={() => { setShowCreate(false); setNewName(''); setNameError(''); }}
        customContent={
          <div className="mt-4 mb-6">
            <label className="block text-sm font-medium text-theme-fg-muted mb-2">{t(locale, 'studio.projectName')}</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => { setNewName(e.target.value); setNameError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreate(); } }}
              placeholder={t(locale, 'studio.untitled')}
              className="w-full px-4 py-2.5 rounded-xl border border-theme-border bg-theme-bg-subtle text-theme-fg placeholder:text-theme-fg-subtle focus:border-theme-border-strong focus:outline-none focus:ring-1 focus:ring-theme-border-hover"
              disabled={creating}
            />
            {nameError && <p className="mt-2 text-sm text-red-400">{nameError}</p>}
          </div>
        }
      />
    </div>
  );
}
