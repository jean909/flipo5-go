'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';
import { createOutlineJob, getJob } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';

type Subsection = { heading: string; points: string[] };
type Section = { heading: string; summary: string; talking_points: string[]; subsections?: Subsection[] };
type Outline = {
  title?: string;
  hook?: string;
  estimated_words?: number;
  target_keywords?: string[];
  sections?: Section[];
  conclusion_cta?: string;
  meta_title?: string;
  meta_description?: string;
  slug?: string;
};

function parseOutline(raw: string): Outline {
  try {
    const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(clean);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    return {};
  }
}

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1400); } catch {} };
  return (
    <button type="button" onClick={copy}
      className="btn-tap inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-theme-border bg-theme-bg-subtle text-theme-fg-muted hover:text-theme-fg hover:bg-theme-bg-hover text-[11px] font-medium">
      {done ? '✓ Copied' : '⎘ Copy'}
    </button>
  );
}

// Build a clean markdown version of the outline for copying
function outlineToMarkdown(o: Outline): string {
  const lines: string[] = [];
  if (o.title) { lines.push(`# ${o.title}`, ''); }
  if (o.hook) { lines.push(`> ${o.hook}`, ''); }
  if (o.target_keywords?.length) { lines.push(`**Keywords:** ${o.target_keywords.join(', ')}`, ''); }
  if (o.estimated_words) { lines.push(`**Estimated words:** ~${o.estimated_words}`, ''); }
  o.sections?.forEach((s) => {
    lines.push(`## ${s.heading}`);
    if (s.summary) lines.push(`*${s.summary}*`);
    s.talking_points?.forEach((p) => lines.push(`- ${p}`));
    s.subsections?.forEach((sub) => {
      lines.push(`### ${sub.heading}`);
      sub.points?.forEach((p) => lines.push(`  - ${p}`));
    });
    lines.push('');
  });
  if (o.conclusion_cta) { lines.push(`## Conclusion`, o.conclusion_cta, ''); }
  if (o.meta_title) lines.push(`**Meta title:** ${o.meta_title}`);
  if (o.meta_description) lines.push(`**Meta description:** ${o.meta_description}`);
  if (o.slug) lines.push(`**Slug:** /${o.slug}`);
  return lines.join('\n');
}

const WORD_COUNTS = ['800', '1000', '1500', '2000', '2500', '3000'];
const LANGUAGES = ['English', 'German', 'Romanian', 'French', 'Spanish'];

export default function OutlinePage() {
  const { locale } = useLocale();
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState('');
  const [language, setLanguage] = useState('English');
  const [wordCount, setWordCount] = useState('1500');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [outline, setOutline] = useState<Outline | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const pollJob = useCallback((id: string) => {
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      const job = await getJob(id).catch(() => null);
      if (!job) { if (!cancelled) { setError(t(locale, 'outline.error')); setLoading(false); } return; }
      if (job.status === 'completed') {
        const out = (job.output as { output?: string } | null)?.output ?? '';
        const parsed = parseOutline(out);
        setOutline(parsed);
        setExpanded(new Set(parsed.sections?.map((_, i) => i) ?? []));
        setLoading(false);
      } else if (job.status === 'failed') {
        setError(job.error ?? t(locale, 'outline.error'));
        setLoading(false);
      } else {
        if (!cancelled) setTimeout(poll, 3000);
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [locale]);

  useEffect(() => { if (!jobId || !loading) return; return pollJob(jobId); }, [jobId, loading, pollJob]);

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setError(''); setOutline(null); setLoading(true);
    try {
      const { job_id } = await createOutlineJob({ topic: topic.trim(), audience: audience.trim() || undefined, language, word_count: wordCount });
      setJobId(job_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : t(locale, 'outline.error'));
      setLoading(false);
    }
  };

  const toggleSection = (i: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-6 scrollbar-subtle">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-theme-fg mb-1">{t(locale, 'outline.title')}</h1>
          <p className="text-sm text-theme-fg-muted">{t(locale, 'outline.sub')}</p>
        </div>

        {/* Input */}
        <div className="rounded-2xl border border-theme-border bg-theme-bg-subtle p-5 mb-8 flex flex-col gap-3">
          <div>
            <label className="block text-xs font-medium text-theme-fg-muted mb-1.5">{t(locale, 'outline.topic')} *</label>
            <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
              placeholder={t(locale, 'outline.topicPlaceholder')}
              className="w-full rounded-xl border border-theme-border bg-theme-bg text-theme-fg placeholder:text-theme-fg-subtle text-sm px-4 py-2.5 focus:border-theme-border-strong focus:outline-none focus:ring-1 focus:ring-theme-border-hover"
              disabled={loading} />
          </div>
          <div>
            <label className="block text-xs font-medium text-theme-fg-muted mb-1.5">{t(locale, 'outline.audience')}</label>
            <input type="text" value={audience} onChange={(e) => setAudience(e.target.value)}
              placeholder={t(locale, 'outline.audiencePlaceholder')}
              className="w-full rounded-xl border border-theme-border bg-theme-bg text-theme-fg placeholder:text-theme-fg-subtle text-sm px-4 py-2.5 focus:border-theme-border-strong focus:outline-none"
              disabled={loading} />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-theme-fg-muted mb-1.5">{t(locale, 'outline.wordCount')}</label>
              <div className="flex flex-wrap gap-1">
                {WORD_COUNTS.map((wc) => (
                  <button key={wc} type="button" onClick={() => setWordCount(wc)}
                    className={`btn-tap px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${wordCount === wc ? 'bg-theme-bg-hover text-theme-fg border border-theme-border-hover' : 'text-theme-fg-muted border border-transparent hover:text-theme-fg'}`}>
                    {wc}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-theme-fg-muted mb-1.5">Language</label>
              <select value={language} onChange={(e) => setLanguage(e.target.value)}
                className="select-theme rounded-xl border border-theme-border bg-theme-bg text-theme-fg text-sm px-3 py-2 focus:outline-none"
                disabled={loading}>
                {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button type="button" onClick={handleGenerate} disabled={loading || !topic.trim()}
              className="btn-tap px-6 py-2.5 rounded-xl border border-theme-border-hover bg-theme-bg-hover-strong text-theme-fg font-medium text-sm disabled:opacity-50 disabled:pointer-events-none">
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-theme-border border-t-theme-fg animate-spin" />
                  {t(locale, 'outline.generating')}
                </span>
              ) : t(locale, 'outline.generate')}
            </button>
            {outline && <span className="text-xs text-theme-success">✓ {t(locale, 'outline.saved')}</span>}
            {outline && <Link href="/dashboard/files" className="ml-auto text-sm text-theme-fg-muted hover:text-theme-fg transition-colors">{t(locale, 'seo.viewFiles')} →</Link>}
          </div>
          {error && <p className="text-sm text-theme-danger">{error}</p>}
        </div>

        {/* Results */}
        <AnimatePresence>
          {outline && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="flex flex-col gap-5">

              {/* Title + stats */}
              <div className="rounded-2xl border border-theme-border bg-theme-bg-subtle p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h2 className="text-lg font-semibold text-theme-fg">{outline.title}</h2>
                    {outline.hook && <p className="text-sm text-theme-fg-muted mt-1 italic">"{outline.hook}"</p>}
                  </div>
                  <CopyBtn text={outlineToMarkdown(outline)} />
                </div>
                <div className="flex flex-wrap gap-4 text-xs text-theme-fg-subtle">
                  {outline.estimated_words && <span>~{outline.estimated_words} words</span>}
                  {outline.sections?.length && <span>{outline.sections.length} sections</span>}
                  {outline.slug && <span>/{outline.slug}</span>}
                </div>
                {outline.target_keywords?.length ? (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {outline.target_keywords.map((kw) => (
                      <span key={kw} className="px-2.5 py-0.5 rounded-full bg-theme-bg border border-theme-border text-xs text-theme-fg">{kw}</span>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* Sections */}
              {outline.sections?.map((section, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15, delay: i * 0.04 }}
                  className="rounded-2xl border border-theme-border bg-theme-bg-subtle overflow-hidden">
                  <button type="button" onClick={() => toggleSection(i)}
                    className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-theme-bg-hover transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-theme-bg border border-theme-border flex items-center justify-center text-[11px] font-semibold text-theme-fg-muted">{i + 1}</span>
                      <span className="text-sm font-semibold text-theme-fg truncate">H2: {section.heading}</span>
                    </div>
                    <span className={`shrink-0 text-theme-fg-subtle transition-transform ${expanded.has(i) ? 'rotate-180' : ''}`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                    </span>
                  </button>
                  <AnimatePresence>
                    {expanded.has(i) && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                        <div className="px-5 pb-4 flex flex-col gap-3 border-t border-theme-border-subtle">
                          {section.summary && (
                            <p className="text-xs text-theme-fg-muted pt-3 italic">{section.summary}</p>
                          )}
                          {section.talking_points?.length ? (
                            <ul className="flex flex-col gap-1.5">
                              {section.talking_points.map((pt, j) => (
                                <li key={j} className="flex items-start gap-2 text-sm text-theme-fg">
                                  <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-theme-fg-subtle mt-2" />
                                  {pt}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          {section.subsections?.map((sub, k) => (
                            <div key={k} className="pl-4 border-l border-theme-border-subtle">
                              <p className="text-xs font-semibold text-theme-fg-muted mb-1">H3: {sub.heading}</p>
                              <ul className="flex flex-col gap-1">
                                {sub.points?.map((pt, l) => (
                                  <li key={l} className="flex items-start gap-2 text-xs text-theme-fg-muted">
                                    <span className="shrink-0 w-1 h-1 rounded-full bg-theme-fg-subtle mt-1.5" />
                                    {pt}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}

              {/* Conclusion + Meta */}
              {outline.conclusion_cta && (
                <div className="rounded-2xl border border-theme-border bg-theme-bg-subtle p-5">
                  <p className="text-xs font-semibold text-theme-fg-muted uppercase tracking-wider mb-2">Conclusion & CTA</p>
                  <p className="text-sm text-theme-fg">{outline.conclusion_cta}</p>
                </div>
              )}
              {(outline.meta_title || outline.meta_description) && (
                <div className="rounded-2xl border border-theme-border bg-theme-bg-subtle p-4 flex flex-col gap-2">
                  <p className="text-xs font-semibold text-theme-fg-muted uppercase tracking-wider">Quick Meta</p>
                  {outline.meta_title && <p className="text-sm text-theme-fg"><span className="text-theme-fg-subtle">Title:</span> {outline.meta_title}</p>}
                  {outline.meta_description && <p className="text-sm text-theme-fg"><span className="text-theme-fg-subtle">Desc:</span> {outline.meta_description}</p>}
                </div>
              )}

            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
