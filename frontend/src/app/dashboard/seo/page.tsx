'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';
import { createSEOJob, getJob } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';

type SEOResult = {
  meta_title?: string;
  meta_description?: string;
  keywords?: string[];
  slug?: string;
  article?: string;
  html?: string;
};

function parseResult(raw: string): SEOResult {
  try {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return { article: raw };
  }
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1400); } catch {}
  };
  return (
    <button type="button" onClick={copy}
      className="btn-tap inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-theme-border bg-theme-bg-subtle text-theme-fg-muted hover:text-theme-fg hover:bg-theme-bg-hover text-xs font-medium transition-colors">
      {done ? '✓ Copied' : label}
    </button>
  );
}

const LANGUAGES = ['English', 'German', 'Romanian', 'French', 'Spanish', 'Italian', 'Portuguese'];

export default function SEOPage() {
  const { locale } = useLocale();

  const [sourceText, setSourceText] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [language, setLanguage] = useState('English');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<SEOResult | null>(null);
  const [activeTab, setActiveTab] = useState<'article' | 'html' | 'meta'>('article');

  const pollJob = useCallback((id: string) => {
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      const job = await getJob(id).catch(() => null);
      if (!job) { if (!cancelled) setError(t(locale, 'seo.error')); setLoading(false); return; }
      if (job.status === 'completed') {
        const out = (job.output as { output?: string } | null)?.output ?? '';
        setResult(parseResult(out));
        setLoading(false);
      } else if (job.status === 'failed') {
        setError(job.error ?? t(locale, 'seo.error'));
        setLoading(false);
      } else {
        if (!cancelled) setTimeout(poll, 3000);
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [locale]);

  useEffect(() => {
    if (!jobId || !loading) return;
    return pollJob(jobId);
  }, [jobId, loading, pollJob]);

  const handleGenerate = async () => {
    const text = sourceText.trim();
    const url = sourceUrl.trim();
    if (!text && !url) return;
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const { job_id } = await createSEOJob({
        source_text: text || undefined,
        source_url: url || undefined,
        title: titleInput.trim() || undefined,
        language,
      });
      setJobId(job_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : t(locale, 'seo.error'));
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-6 scrollbar-subtle">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-theme-fg mb-1">{t(locale, 'seo.title')}</h1>
          <p className="text-sm text-theme-fg-muted">{t(locale, 'seo.sub')}</p>
        </div>

        {/* Input form */}
        <div className="flex flex-col gap-4 mb-8">
          <div>
            <label className="block text-xs font-medium text-theme-fg-muted mb-1.5">{t(locale, 'seo.inputLabel')}</label>
            <textarea
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder={t(locale, 'seo.inputPlaceholder')}
              rows={6}
              className="w-full rounded-xl border border-theme-border bg-theme-bg-subtle text-theme-fg placeholder:text-theme-fg-subtle text-sm px-4 py-3 focus:border-theme-border-strong focus:outline-none focus:ring-1 focus:ring-theme-border-hover resize-none"
              disabled={loading}
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-theme-fg-muted mb-1.5">{t(locale, 'seo.titleLabel')}</label>
              <input
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                placeholder={t(locale, 'seo.titlePlaceholder')}
                className="w-full rounded-xl border border-theme-border bg-theme-bg-subtle text-theme-fg placeholder:text-theme-fg-subtle text-sm px-4 py-2.5 focus:border-theme-border-strong focus:outline-none focus:ring-1 focus:ring-theme-border-hover"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-theme-fg-muted mb-1.5">{t(locale, 'seo.language')}</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="select-theme rounded-xl border border-theme-border bg-theme-bg-subtle text-theme-fg text-sm px-4 py-2.5 focus:border-theme-border-strong focus:outline-none"
                disabled={loading}
              >
                {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading || (!sourceText.trim() && !sourceUrl.trim())}
              className="btn-tap px-6 py-2.5 rounded-xl border border-theme-border-hover bg-theme-bg-hover-strong text-theme-fg font-medium text-sm disabled:opacity-50 disabled:pointer-events-none hover:bg-theme-bg-hover"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-theme-border border-t-theme-fg animate-spin" />
                  {t(locale, 'seo.generating')}
                </span>
              ) : t(locale, 'seo.generate')}
            </button>
            {result && (
              <Link href="/dashboard/files" className="text-sm text-theme-fg-muted hover:text-theme-fg transition-colors">
                {t(locale, 'seo.viewFiles')} →
              </Link>
            )}
          </div>
          {error && <p className="text-sm text-theme-danger">{error}</p>}
        </div>

        {/* Results */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col gap-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-theme-fg">{t(locale, 'seo.resultTitle')}</h2>
                <span className="inline-flex items-center gap-1.5 text-xs text-theme-success px-2 py-1 rounded-md bg-theme-bg-subtle border border-theme-border">
                  ✓ {t(locale, 'seo.savedToFiles')}
                </span>
              </div>

              {/* Meta */}
              {(result.meta_title || result.meta_description || result.keywords?.length || result.slug) && (
                <div className="rounded-xl border border-theme-border bg-theme-bg-subtle p-4 flex flex-col gap-3">
                  {result.meta_title && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-theme-fg-muted uppercase tracking-wider">{t(locale, 'seo.metaTitle')}</span>
                        <CopyButton text={result.meta_title} label={t(locale, 'feedback.copy')} />
                      </div>
                      <p className="text-sm text-theme-fg">{result.meta_title}</p>
                    </div>
                  )}
                  {result.meta_description && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-theme-fg-muted uppercase tracking-wider">{t(locale, 'seo.metaDesc')}</span>
                        <CopyButton text={result.meta_description} label={t(locale, 'feedback.copy')} />
                      </div>
                      <p className="text-sm text-theme-fg">{result.meta_description}</p>
                    </div>
                  )}
                  {result.slug && (
                    <div>
                      <span className="text-xs font-medium text-theme-fg-muted uppercase tracking-wider block mb-1">{t(locale, 'seo.slug')}</span>
                      <code className="text-sm text-theme-fg-muted font-mono">{result.slug}</code>
                    </div>
                  )}
                  {result.keywords && result.keywords.length > 0 && (
                    <div>
                      <span className="text-xs font-medium text-theme-fg-muted uppercase tracking-wider block mb-2">{t(locale, 'seo.keywords')}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {result.keywords.map((kw) => (
                          <span key={kw} className="px-2.5 py-1 rounded-full bg-theme-bg-hover border border-theme-border text-xs text-theme-fg">{kw}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tabs */}
              {(result.article || result.html) && (
                <div>
                  <div className="flex gap-1 mb-3">
                    {(['article', 'html'] as const).filter(tab => result[tab]).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveTab(tab)}
                        className={`btn-tap px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab ? 'bg-theme-bg-hover text-theme-fg border border-theme-border-hover' : 'text-theme-fg-muted hover:text-theme-fg'}`}
                      >
                        {t(locale, `seo.${tab}`)}
                      </button>
                    ))}
                    <div className="ml-auto">
                      {activeTab === 'article' && result.article && <CopyButton text={result.article} label={t(locale, 'seo.copyArticle')} />}
                      {activeTab === 'html' && result.html && <CopyButton text={result.html} label={t(locale, 'seo.copyHtml')} />}
                    </div>
                  </div>
                  <div className="rounded-xl border border-theme-border bg-theme-bg-subtle p-5 overflow-x-auto max-h-[520px] overflow-y-auto scrollbar-subtle">
                    {activeTab === 'article' && result.article && (
                      <div className="prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown>{result.article}</ReactMarkdown>
                      </div>
                    )}
                    {activeTab === 'html' && result.html && (
                      <pre className="text-xs text-theme-fg-muted whitespace-pre-wrap font-mono leading-relaxed">{result.html}</pre>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
