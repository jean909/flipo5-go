'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';
import {
  createTranslateJob,
  getJob,
  listTranslationProjects,
  createTranslationProject,
  getTranslationProject,
  addTranslationItem,
  deleteTranslationItem,
  type TranslationProject as TProject,
  type TranslationItem as TItem,
} from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';

const LANGUAGES = ['Auto-detect', 'English', 'German', 'Romanian', 'French', 'Spanish', 'Italian', 'Portuguese', 'Dutch'];

function truncate(s: string, max: number) {
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max) + '…';
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

export default function TranslationsPage() {
  const { locale } = useLocale();
  const [mode, setMode] = useState<'single' | 'project'>('single');

  // Single mode state
  const [inputMode, setInputMode] = useState<'url' | 'text'>('text');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [sourceLang, setSourceLang] = useState('Auto-detect');
  const [targetLang, setTargetLang] = useState('German');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState('');

  // Project mode state
  const [projectView, setProjectView] = useState<'list' | 'new' | 'detail'>('list');
  const [projects, setProjects] = useState<TProject[]>([]);
  const [project, setProject] = useState<TProject | null>(null);
  const [items, setItems] = useState<TItem[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectSourceLang, setNewProjectSourceLang] = useState('Auto-detect');
  const [newProjectTargetLang, setNewProjectTargetLang] = useState('German');
  const [addItemType, setAddItemType] = useState<'url' | 'text'>('text');
  const [addItemValue, setAddItemValue] = useState('');
  const [addingItem, setAddingItem] = useState(false);
  const [translatingItemId, setTranslatingItemId] = useState<string | null>(null);
  const [translatingAll, setTranslatingAll] = useState(false);

  const pollJob = useCallback((id: string, onDone?: () => void) => {
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      const job = await getJob(id).catch(() => null);
      if (!job) {
        if (!cancelled) {
          setError(t(locale, 'translate.error'));
          setLoading(false);
          setTranslatingItemId(null);
          setTranslatingAll(false);
          onDone?.();
        }
        return;
      }
      if (job.status === 'completed') {
        const raw = job.output;
        const out =
          typeof raw === 'string'
            ? raw
            : raw && typeof (raw as Record<string, unknown>).output === 'string'
              ? (raw as { output: string }).output
              : '';
        if (mode === 'single') setResult(out || '');
        setLoading(false);
        setTranslatingItemId(null);
        setTranslatingAll(false);
        onDone?.();
      } else if (job.status === 'failed') {
        setError(job.error ?? t(locale, 'translate.error'));
        setLoading(false);
        setTranslatingItemId(null);
        setTranslatingAll(false);
        onDone?.();
      } else {
        if (!cancelled) setTimeout(poll, 3000);
      }
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [locale, mode]);

  useEffect(() => {
    if (!jobId || !loading) return;
    return pollJob(jobId);
  }, [jobId, loading, pollJob]);

  const handleTranslate = async () => {
    const url = inputMode === 'url' ? sourceUrl.trim() : '';
    const text = inputMode === 'text' ? sourceText.trim() : '';
    if (!url && !text) return;
    setError('');
    setResult('');
    setLoading(true);
    try {
      const { job_id } = await createTranslateJob({
        source_url: url || undefined,
        source_text: text || undefined,
        source_lang: sourceLang === 'Auto-detect' ? undefined : sourceLang,
        target_lang: targetLang,
      });
      setJobId(job_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : t(locale, 'translate.error'));
      setLoading(false);
    }
  };

  const fetchProjects = useCallback(() => {
    setProjectsLoading(true);
    listTranslationProjects()
      .then((r) => setProjects(r.projects ?? []))
      .catch(() => setProjects([]))
      .finally(() => setProjectsLoading(false));
  }, []);

  const fetchProjectDetail = useCallback((id: string) => {
    getTranslationProject(id)
      .then((r) => {
        setProject(r.project);
        setItems(r.items ?? []);
      })
      .catch(() => {
        setProject(null);
        setItems([]);
      });
  }, []);

  useEffect(() => {
    if (mode === 'project' && projectView === 'list') fetchProjects();
  }, [mode, projectView, fetchProjects]);

  const handleCreateProject = async () => {
    const name = newProjectName.trim();
    if (!name) return;
    setError('');
    try {
      const { id } = await createTranslationProject({
        name,
        source_lang: newProjectSourceLang === 'Auto-detect' ? undefined : newProjectSourceLang,
        target_lang: newProjectTargetLang,
      });
      setNewProjectName('');
      setProjectView('detail');
      fetchProjectDetail(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : t(locale, 'translate.error'));
    }
  };

  const handleAddItem = async () => {
    if (!project || !addItemValue.trim()) return;
    setAddingItem(true);
    setError('');
    try {
      await addTranslationItem(project.id, {
        source_type: addItemType,
        source_value: addItemValue.trim(),
      });
      setAddItemValue('');
      fetchProjectDetail(project.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : t(locale, 'translate.error'));
    }
    setAddingItem(false);
  };

  const handleTranslateItem = async (item: TItem) => {
    if (!project || item.status === 'running') return;
    setError('');
    setTranslatingItemId(item.id);
    try {
      const { job_id } = await createTranslateJob({
        source_url: item.source_type === 'url' ? item.source_value : undefined,
        source_text: item.source_type === 'text' ? item.source_value : undefined,
        source_lang: project.source_lang === 'auto' ? undefined : project.source_lang,
        target_lang: project.target_lang,
        project_id: project.id,
        item_id: item.id,
      });
      setJobId(job_id);
      setLoading(true);
      const refresh = () => project && fetchProjectDetail(project.id);
      pollJob(job_id, refresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : t(locale, 'translate.error'));
      setTranslatingItemId(null);
    }
  };

  const handleTranslateAll = async () => {
    if (!project) return;
    const pending = items.filter((i) => i.status === 'pending');
    if (pending.length === 0) return;
    setTranslatingAll(true);
    setError('');
    try {
      for (const item of pending) {
        await createTranslateJob({
          source_url: item.source_type === 'url' ? item.source_value : undefined,
          source_text: item.source_type === 'text' ? item.source_value : undefined,
          source_lang: project.source_lang === 'auto' ? undefined : project.source_lang,
          target_lang: project.target_lang,
          project_id: project.id,
          item_id: item.id,
        });
      }
      const projectId = project.id;
      const refetch = () => getTranslationProject(projectId).then((r) => { setItems(r.items ?? []); return r.items?.some((i) => i.status === 'running'); });
      const interval = setInterval(async () => {
        const stillRunning = await refetch();
        if (!stillRunning) {
          clearInterval(interval);
          setTranslatingAll(false);
        }
      }, 3000);
      refetch();
      setTimeout(() => { clearInterval(interval); setTranslatingAll(false); }, 10 * 60 * 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : t(locale, 'translate.error'));
      setTranslatingAll(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!project || !confirm('Delete this item?')) return;
    try {
      await deleteTranslationItem(itemId);
      fetchProjectDetail(project.id);
    } catch {}
  };

  const hasInput = inputMode === 'url' ? !!sourceUrl.trim() : !!sourceText.trim();
  const canSubmit = !loading && hasInput;
  const pendingCount = items.filter((i) => i.status === 'pending').length;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-6 scrollbar-subtle">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-theme-fg mb-1">{t(locale, 'translate.title')}</h1>
            <p className="text-sm text-theme-fg-muted">{t(locale, 'translate.sub')}</p>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setMode('single')}
              className={`btn-tap px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'single' ? 'bg-theme-bg-hover text-theme-fg border border-theme-border-hover' : 'text-theme-fg-muted hover:text-theme-fg border border-transparent'}`}
            >
              {t(locale, 'translate.modeSingle')}
            </button>
            <button
              type="button"
              onClick={() => setMode('project')}
              className={`btn-tap px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'project' ? 'bg-theme-bg-hover text-theme-fg border border-theme-border-hover' : 'text-theme-fg-muted hover:text-theme-fg border border-transparent'}`}
            >
              {t(locale, 'translate.modeProject')}
            </button>
          </div>
        </div>

        {mode === 'single' && (
          <>
            <div className="rounded-2xl border border-theme-border bg-theme-bg-subtle p-5 mb-8 flex flex-col gap-4">
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setInputMode('url')}
                  className={`btn-tap inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${inputMode === 'url' ? 'bg-theme-bg-hover text-theme-fg border border-theme-border-hover' : 'text-theme-fg-muted hover:text-theme-fg border border-transparent'}`}
                >
                  {t(locale, 'translate.inputModeUrl')}
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('text')}
                  className={`btn-tap inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${inputMode === 'text' ? 'bg-theme-bg-hover text-theme-fg border border-theme-border-hover' : 'text-theme-fg-muted hover:text-theme-fg border border-transparent'}`}
                >
                  {t(locale, 'translate.inputModeText')}
                </button>
              </div>
              {inputMode === 'url' ? (
                <div>
                  <label className="block text-xs font-medium text-theme-fg-muted mb-1.5">{t(locale, 'translate.sourceUrl')}</label>
                  <input
                    type="url"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    placeholder={t(locale, 'translate.sourceUrlPlaceholder')}
                    className="w-full rounded-xl border border-theme-border bg-theme-bg text-theme-fg placeholder:text-theme-fg-subtle text-sm px-4 py-2.5 focus:border-theme-border-strong focus:outline-none"
                    disabled={loading}
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-theme-fg-muted mb-1.5">{t(locale, 'translate.sourceText')}</label>
                  <textarea
                    value={sourceText}
                    onChange={(e) => setSourceText(e.target.value)}
                    placeholder={t(locale, 'translate.sourceTextPlaceholder')}
                    rows={6}
                    className="w-full rounded-xl border border-theme-border bg-theme-bg text-theme-fg placeholder:text-theme-fg-subtle text-sm px-4 py-2.5 focus:border-theme-border-strong focus:outline-none resize-none"
                    disabled={loading}
                  />
                </div>
              )}
              <div className="flex flex-wrap gap-4">
                <div>
                  <label className="block text-xs font-medium text-theme-fg-muted mb-1.5">{t(locale, 'translate.sourceLang')}</label>
                  <select
                    value={sourceLang}
                    onChange={(e) => setSourceLang(e.target.value)}
                    className="select-theme rounded-xl border border-theme-border bg-theme-bg text-theme-fg text-sm px-3 py-2 min-w-[140px] focus:outline-none"
                    disabled={loading}
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l} value={l}>{l === 'Auto-detect' ? t(locale, 'translate.auto') : l}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-theme-fg-muted mb-1.5">{t(locale, 'translate.targetLang')}</label>
                  <select
                    value={targetLang}
                    onChange={(e) => setTargetLang(e.target.value)}
                    className="select-theme rounded-xl border border-theme-border bg-theme-bg text-theme-fg text-sm px-3 py-2 min-w-[140px] focus:outline-none"
                    disabled={loading}
                  >
                    {LANGUAGES.filter((l) => l !== 'Auto-detect').map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleTranslate}
                  disabled={!canSubmit}
                  className="btn-tap px-6 py-2.5 rounded-xl border border-theme-border-hover bg-theme-bg-hover-strong text-theme-fg font-medium text-sm disabled:opacity-50 disabled:pointer-events-none"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded-full border-2 border-theme-border border-t-theme-fg animate-spin" />
                      {t(locale, 'translate.generating')}
                    </span>
                  ) : (
                    t(locale, 'translate.generate')
                  )}
                </button>
                {result && <span className="text-xs text-theme-success">✓ {t(locale, 'translate.saved')}</span>}
                {result && (
                  <Link href="/dashboard/files" className="ml-auto text-sm text-theme-fg-muted hover:text-theme-fg transition-colors">
                    {t(locale, 'seo.viewFiles')} →
                  </Link>
                )}
              </div>
              {error && <p className="text-sm text-theme-danger">{error}</p>}
            </div>
            {loading && jobId && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-2xl border border-theme-border bg-theme-bg-subtle p-6 mb-6 flex items-center gap-4"
              >
                <span className="w-8 h-8 rounded-full border-2 border-theme-border border-t-theme-fg animate-spin shrink-0" />
                <div>
                  <p className="text-sm font-medium text-theme-fg">{t(locale, 'translate.generating')}</p>
                  <p className="text-xs text-theme-fg-muted mt-0.5">{targetLang}</p>
                </div>
              </motion.div>
            )}
            <AnimatePresence>
              {result && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="rounded-2xl border border-theme-border bg-theme-bg-subtle p-5"
                >
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <p className="text-xs font-semibold text-theme-fg-muted uppercase tracking-wider">Translation</p>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(result)}
                      className="btn-tap inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-theme-border bg-theme-bg-subtle text-theme-fg-muted hover:text-theme-fg hover:bg-theme-bg-hover text-[11px] font-medium"
                    >
                      ⎘ Copy
                    </button>
                  </div>
                  <div className="text-sm text-theme-fg leading-relaxed whitespace-pre-wrap">{result}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

        {mode === 'project' && (
          <>
            {projectView === 'list' && (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => setProjectView('new')}
                  className="btn-tap w-full rounded-2xl border border-dashed border-theme-border-hover bg-theme-bg-subtle p-6 text-theme-fg-muted hover:text-theme-fg hover:bg-theme-bg-hover hover:border-theme-border transition-colors flex items-center justify-center gap-2"
                >
                  <span className="text-2xl">+</span>
                  {t(locale, 'translate.newProject')}
                </button>
                {projectsLoading && <p className="text-sm text-theme-fg-subtle animate-pulse-subtle">{t(locale, 'common.loading')}</p>}
                {!projectsLoading && projects.length === 0 && (
                  <p className="text-sm text-theme-fg-muted py-6 text-center">{t(locale, 'translate.noProjects')}</p>
                )}
                {!projectsLoading && projects.map((p) => (
                  <motion.button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setProjectView('detail');
                      fetchProjectDetail(p.id);
                    }}
                    className="btn-tap w-full text-left rounded-2xl border border-theme-border bg-theme-bg-subtle p-4 hover:bg-theme-bg-hover transition-colors"
                  >
                    <p className="font-medium text-theme-fg">{p.name}</p>
                    <p className="text-xs text-theme-fg-muted mt-1">
                      {p.source_lang} → {p.target_lang} · {formatDate(p.updated_at)}
                    </p>
                  </motion.button>
                ))}
              </div>
            )}

            {projectView === 'new' && (
              <div className="rounded-2xl border border-theme-border bg-theme-bg-subtle p-5 space-y-4">
                <h2 className="text-base font-semibold text-theme-fg">{t(locale, 'translate.newProject')}</h2>
                <div>
                  <label className="block text-xs font-medium text-theme-fg-muted mb-1.5">{t(locale, 'translate.projectName')}</label>
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder={t(locale, 'translate.projectNamePlaceholder')}
                    className="w-full rounded-xl border border-theme-border bg-theme-bg text-theme-fg placeholder:text-theme-fg-subtle text-sm px-4 py-2.5 focus:border-theme-border-strong focus:outline-none"
                  />
                </div>
                <div className="flex flex-wrap gap-4">
                  <div>
                    <label className="block text-xs font-medium text-theme-fg-muted mb-1.5">{t(locale, 'translate.sourceLang')}</label>
                    <select
                      value={newProjectSourceLang}
                      onChange={(e) => setNewProjectSourceLang(e.target.value)}
                      className="select-theme rounded-xl border border-theme-border bg-theme-bg text-theme-fg text-sm px-3 py-2 min-w-[140px] focus:outline-none"
                    >
                      {LANGUAGES.map((l) => (
                        <option key={l} value={l}>{l === 'Auto-detect' ? t(locale, 'translate.auto') : l}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-theme-fg-muted mb-1.5">{t(locale, 'translate.targetLang')}</label>
                    <select
                      value={newProjectTargetLang}
                      onChange={(e) => setNewProjectTargetLang(e.target.value)}
                      className="select-theme rounded-xl border border-theme-border bg-theme-bg text-theme-fg text-sm px-3 py-2 min-w-[140px] focus:outline-none"
                    >
                      {LANGUAGES.filter((l) => l !== 'Auto-detect').map((l) => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setProjectView('list')} className="btn-tap px-4 py-2 rounded-xl border border-theme-border text-theme-fg-muted hover:text-theme-fg text-sm">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateProject}
                    disabled={!newProjectName.trim()}
                    className="btn-tap px-6 py-2 rounded-xl border border-theme-border-hover bg-theme-bg-hover-strong text-theme-fg font-medium text-sm disabled:opacity-50"
                  >
                    Create
                  </button>
                </div>
                {error && <p className="text-sm text-theme-danger">{error}</p>}
              </div>
            )}

            {projectView === 'detail' && project && (
              <div className="space-y-6">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setProjectView('list')}
                    className="text-sm text-theme-fg-muted hover:text-theme-fg transition-colors"
                  >
                    {t(locale, 'translate.backToProjects')}
                  </button>
                </div>
                <div className="rounded-2xl border border-theme-border bg-theme-bg-subtle p-4">
                  <h2 className="text-lg font-semibold text-theme-fg">{project.name}</h2>
                  <p className="text-xs text-theme-fg-muted mt-1">
                    {project.source_lang} → {project.target_lang}
                  </p>
                </div>

                <div className="rounded-xl border border-theme-border bg-theme-bg-subtle p-4 space-y-3">
                  <p className="text-xs font-medium text-theme-fg-muted">{t(locale, 'translate.addItem')}</p>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setAddItemType('url')}
                      className={`btn-tap px-3 py-1.5 rounded-lg text-xs font-medium ${addItemType === 'url' ? 'bg-theme-bg-hover text-theme-fg' : 'text-theme-fg-muted hover:text-theme-fg'}`}
                    >
                      {t(locale, 'translate.addItemUrl')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddItemType('text')}
                      className={`btn-tap px-3 py-1.5 rounded-lg text-xs font-medium ${addItemType === 'text' ? 'bg-theme-bg-hover text-theme-fg' : 'text-theme-fg-muted hover:text-theme-fg'}`}
                    >
                      {t(locale, 'translate.addItemText')}
                    </button>
                  </div>
                  {addItemType === 'url' ? (
                    <input
                      type="url"
                      value={addItemValue}
                      onChange={(e) => setAddItemValue(e.target.value)}
                      placeholder={t(locale, 'translate.sourceUrlPlaceholder')}
                      className="w-full rounded-lg border border-theme-border bg-theme-bg text-theme-fg text-sm px-3 py-2 focus:outline-none"
                    />
                  ) : (
                    <textarea
                      value={addItemValue}
                      onChange={(e) => setAddItemValue(e.target.value)}
                      placeholder={t(locale, 'translate.sourceTextPlaceholder')}
                      rows={2}
                      className="w-full rounded-lg border border-theme-border bg-theme-bg text-theme-fg text-sm px-3 py-2 focus:outline-none resize-none"
                    />
                  )}
                  <button
                    type="button"
                    onClick={handleAddItem}
                    disabled={addingItem || !addItemValue.trim()}
                    className="btn-tap px-4 py-2 rounded-lg border border-theme-border-hover bg-theme-bg-hover text-theme-fg text-sm font-medium disabled:opacity-50"
                  >
                    {addingItem ? '…' : t(locale, 'translate.addItem')}
                  </button>
                </div>

                {pendingCount > 0 && (
                  <button
                    type="button"
                    onClick={handleTranslateAll}
                    disabled={translatingAll}
                    className="btn-tap w-full py-2.5 rounded-xl border border-theme-border-hover bg-theme-bg-hover-strong text-theme-fg font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {translatingAll ? (
                      <span className="w-4 h-4 rounded-full border-2 border-theme-border border-t-theme-fg animate-spin" />
                    ) : null}
                    {t(locale, 'translate.translateAll')} ({pendingCount})
                  </button>
                )}

                <div className="space-y-3">
                  {items.length === 0 && <p className="text-sm text-theme-fg-muted py-4">No items yet. Add URLs or text above.</p>}
                  {items.map((item) => (
                    <motion.div
                      key={item.id}
                      layout
                      className="rounded-xl border border-theme-border bg-theme-bg-subtle p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-theme-fg-subtle mb-1">
                            {item.source_type === 'url' ? truncate(item.source_value, 60) : truncate(item.source_value, 120)}
                          </p>
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${
                              item.status === 'completed'
                                ? 'bg-theme-success/20 text-theme-success'
                                : item.status === 'failed'
                                  ? 'bg-theme-danger/20 text-theme-danger'
                                  : item.status === 'running'
                                    ? 'bg-theme-bg-hover text-theme-fg-muted'
                                    : 'bg-theme-bg-hover text-theme-fg-muted'
                            }`}
                          >
                            {item.status === 'pending' && t(locale, 'translate.statusPending')}
                            {item.status === 'running' && t(locale, 'translate.statusRunning')}
                            {item.status === 'completed' && t(locale, 'translate.statusCompleted')}
                            {item.status === 'failed' && t(locale, 'translate.statusFailed')}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {(item.status === 'pending' || item.status === 'failed') && (
                            <button
                              type="button"
                              onClick={() => handleTranslateItem(item)}
                              disabled={translatingItemId === item.id}
                              className="btn-tap px-3 py-1.5 rounded-lg border border-theme-border-hover bg-theme-bg-hover text-theme-fg text-xs font-medium disabled:opacity-50"
                            >
                              {translatingItemId === item.id ? '…' : t(locale, 'translate.translateItem')}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(item.id)}
                            className="p-1.5 rounded-lg text-theme-fg-subtle hover:text-theme-danger hover:bg-theme-bg-hover"
                            title={t(locale, 'files.delete')}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166M18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      {item.status === 'completed' && item.result_text && (
                        <div className="mt-3 pt-3 border-t border-theme-border-subtle">
                          <p className="text-xs font-medium text-theme-fg-muted mb-1">Translation</p>
                          <p className="text-sm text-theme-fg leading-relaxed whitespace-pre-wrap">{truncate(item.result_text, 300)}</p>
                        </div>
                      )}
                      {item.status === 'failed' && item.error_message && (
                        <p className="mt-2 text-xs text-theme-danger">{item.error_message}</p>
                      )}
                    </motion.div>
                  ))}
                </div>
                {error && <p className="text-sm text-theme-danger">{error}</p>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
