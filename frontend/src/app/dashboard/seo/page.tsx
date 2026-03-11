'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';
import { createSEOJob, getJob } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';

// ── Types ──────────────────────────────────────────────────────────────────
type SEOResult = {
  meta_title?: string;
  meta_description?: string;
  keywords?: string[];
  focus_keyword?: string;
  slug?: string;
  article?: string;
  html?: string;
  readability_tips?: string[];
  internal_links?: { anchor: string; topic: string }[];
};
type Tab = 'article' | 'html' | 'serp' | 'meta_tags' | 'schema' | 'social' | 'tips';

// ── Helpers ────────────────────────────────────────────────────────────────
function parseResult(raw: string): SEOResult {
  try {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(cleaned);
  } catch {
    // Try to extract JSON from middle of text
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    return { article: raw };
  }
}

// Flesch-Kincaid Reading Ease + Grade Level
function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!word) return 0;
  if (word.length <= 3) return 1;
  word = word.replace(/e$/, '');
  const matches = word.match(/[aeiouy]+/g);
  return Math.max(1, matches ? matches.length : 1);
}
function readabilityScore(text: string) {
  const words = text.split(/\s+/).filter((w) => w.replace(/[^a-zA-Z]/g, '').length > 0);
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 4).length || 1;
  const syllables = words.reduce((n, w) => n + countSyllables(w), 0);
  const wc = words.length || 1;
  const fre = Math.round(206.835 - 1.015 * (wc / sentences) - 84.6 * (syllables / wc));
  const fkgl = Math.round((0.39 * (wc / sentences) + 11.8 * (syllables / wc) - 15.59) * 10) / 10;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  return { fre: clamp(fre, 0, 100), fkgl: Math.max(1, fkgl), words: wc, sentences };
}
function freLabel(fre: number) {
  if (fre >= 70) return { label: 'Easy', color: '#22c55e' };
  if (fre >= 50) return { label: 'Moderate', color: '#f59e0b' };
  return { label: 'Difficult', color: '#ef4444' };
}

// SEO Score (0-100)
function calcScore(r: SEOResult) {
  const title = r.meta_title ?? '';
  const desc = r.meta_description ?? '';
  const kws = r.keywords ?? [];
  const articleWords = (r.article ?? '').split(/\s+/).filter(Boolean).length;
  const hasH2 = (r.html ?? '').includes('<h2') || (r.article ?? '').includes('## ');
  const hasFAQ = (r.article ?? '').toLowerCase().includes('faq') || (r.html ?? '').toLowerCase().includes('faq');
  const checks = [
    { label: 'Meta title (50–60 chars)', ok: title.length >= 50 && title.length <= 60, hint: `${title.length} chars` },
    { label: 'Meta description (150–160 chars)', ok: desc.length >= 140 && desc.length <= 165, hint: `${desc.length} chars` },
    { label: 'Keywords (10+)', ok: kws.length >= 10, hint: `${kws.length}` },
    { label: 'Article length (1000+ words)', ok: articleWords >= 1000, hint: `~${articleWords} words` },
    { label: 'H2/H3 headings', ok: hasH2, hint: hasH2 ? '✓' : 'missing' },
    { label: 'FAQ section', ok: hasFAQ, hint: hasFAQ ? '✓' : 'missing' },
    { label: 'Slug defined', ok: !!(r.slug), hint: r.slug ?? 'missing' },
    { label: 'HTML generated', ok: !!(r.html), hint: r.html ? '✓' : 'missing' },
    { label: 'Readability tips', ok: (r.readability_tips?.length ?? 0) > 0, hint: `${r.readability_tips?.length ?? 0}` },
    { label: 'Internal linking suggestions', ok: (r.internal_links?.length ?? 0) > 0, hint: `${r.internal_links?.length ?? 0}` },
  ];
  return { score: Math.round(checks.filter((c) => c.ok).length / checks.length * 100), checks };
}

// Keyword density
function calcDensity(article: string, keywords: string[]) {
  const words = article.toLowerCase().split(/\s+/).filter(Boolean);
  const total = words.length || 1;
  return keywords.map((kw) => {
    const count = words.filter((w) => w.includes(kw.toLowerCase())).length;
    return { kw, count, pct: ((count / total) * 100).toFixed(1) };
  }).sort((a, b) => b.count - a.count);
}

// Schema.org
function buildSchema(r: SEOResult, domain: string) {
  const base = domain ? `https://${domain.replace(/^https?:\/\//, '')}` : 'https://example.com';
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: r.meta_title ?? '',
    description: r.meta_description ?? '',
    keywords: (r.keywords ?? []).join(', '),
    url: `${base}/${r.slug ?? 'article'}`,
    author: { '@type': 'Organization', name: 'Your Company' },
    publisher: { '@type': 'Organization', name: 'Your Company', logo: { '@type': 'ImageObject', url: `${base}/logo.png` } },
    datePublished: new Date().toISOString().split('T')[0],
    inLanguage: 'en',
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${base}/${r.slug ?? 'article'}` },
    ...(r.keywords?.length ? { about: r.keywords.slice(0, 3).map((k) => ({ '@type': 'Thing', name: k })) } : {}),
    ...(r.article?.toLowerCase().includes('faq') ? {
      '@type': ['Article', 'FAQPage'],
    } : {}),
  }, null, 2);
}

// Meta HTML tags
function buildMetaTags(r: SEOResult, domain: string) {
  const base = domain ? `https://${domain.replace(/^https?:\/\//, '')}` : 'https://example.com';
  const url = `${base}/${r.slug ?? 'article'}`;
  return `<!-- Primary Meta Tags -->
<title>${r.meta_title ?? ''}</title>
<meta name="title" content="${r.meta_title ?? ''}">
<meta name="description" content="${r.meta_description ?? ''}">
<meta name="keywords" content="${(r.keywords ?? []).join(', ')}">
<link rel="canonical" href="${url}">

<!-- Open Graph / Facebook -->
<meta property="og:type" content="article">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${r.meta_title ?? ''}">
<meta property="og:description" content="${r.meta_description ?? ''}">

<!-- Twitter -->
<meta property="twitter:card" content="summary_large_image">
<meta property="twitter:url" content="${url}">
<meta property="twitter:title" content="${r.meta_title ?? ''}">
<meta property="twitter:description" content="${r.meta_description ?? ''}">

<!-- Schema.org JSON-LD -->
<script type="application/ld+json">
${buildSchema(r, domain)}
</script>`;
}

// Social snippets
function buildSocial(r: SEOResult, domain: string) {
  const base = domain ? `https://${domain.replace(/^https?:\/\//, '')}` : 'https://example.com';
  const url = `${base}/${r.slug ?? 'article'}`;
  const sentences = (r.article ?? '').replace(/[#*_]/g, '').split(/(?<=[.!?])\s+/).filter((s) => s.length > 40).slice(0, 3);
  const hook = sentences[0] ?? r.meta_description ?? '';
  const kws = (r.keywords ?? []).slice(0, 4).map((k) => '#' + k.replace(/\s+/g, '')).join(' ');
  const linkedin = `${r.meta_title ?? ''}

${hook}

${sentences[1] ?? ''}

${kws}

👉 ${url}`;
  const twitter = `${hook.slice(0, 190)}… ${kws} 🔗 ${url}`;
  return { linkedin, twitter };
}

// ── UI Components ──────────────────────────────────────────────────────────
function CharBar({ value, min, max }: { value: number; min: number; max: number }) {
  const ok = value >= min && value <= max;
  const warn = value > 0 && (value < min * 0.8 || value > max * 1.1);
  const color = ok ? '#22c55e' : warn ? '#ef4444' : '#f59e0b';
  const pct = Math.min(100, (value / max) * 100);
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px]" style={{ color }}>
      {value}/{max}
      <span className="inline-block w-12 h-1 rounded-full bg-white/10 overflow-hidden">
        <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: color, transition: 'width 0.4s ease' }} />
      </span>
    </span>
  );
}

function CopyBtn({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1400); } catch {} };
  return (
    <button type="button" onClick={copy}
      className="btn-tap inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-theme-border bg-theme-bg-subtle text-theme-fg-muted hover:text-theme-fg hover:bg-theme-bg-hover text-[11px] font-medium transition-colors">
      {done ? '✓ Copied' : `⎘ ${label ?? 'Copy'}`}
    </button>
  );
}

const LANGUAGES = ['English', 'German', 'Romanian', 'French', 'Spanish', 'Italian', 'Portuguese'];

// ── Page ───────────────────────────────────────────────────────────────────
export default function SEOPage() {
  const { locale } = useLocale();

  // Input
  const [inputMode, setInputMode] = useState<'url' | 'text'>('url');
  const [outputFormat, setOutputFormat] = useState<'markdown' | 'html' | 'both'>('both');
  const [sourceText, setSourceText] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [language, setLanguage] = useState('English');
  const [domain, setDomain] = useState('');

  // State
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [error, setError] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<SEOResult | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('article');

  // Persist domain in localStorage
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('seo_domain') : null;
    if (saved) setDomain(saved);
  }, []);
  const saveDomain = (v: string) => {
    setDomain(v);
    if (typeof window !== 'undefined') localStorage.setItem('seo_domain', v);
  };

  // Poll job
  const pollJob = useCallback((id: string) => {
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      const job = await getJob(id).catch(() => null);
      if (!job) { if (!cancelled) { setError(t(locale, 'seo.error')); setLoading(false); } return; }
      if (job.status === 'completed') {
        const out = (job.output as { output?: string } | null)?.output ?? '';
        const parsed = parseResult(out);
        setResult(parsed);
        // Auto-select the relevant tab based on output format
        if (outputFormat === 'html' && parsed.html) setActiveTab('html');
        else if (outputFormat === 'markdown' && parsed.article) setActiveTab('article');
        else setActiveTab('article');
        setLoadingMsg('');
        setLoading(false);
      } else if (job.status === 'failed') {
        setError(job.error ?? t(locale, 'seo.error'));
        setLoading(false);
      } else {
        if (job.status === 'running') setLoadingMsg('AI is analyzing your content…');
        if (!cancelled) setTimeout(poll, 3000);
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [locale]);

  useEffect(() => { if (!jobId || !loading) return; return pollJob(jobId); }, [jobId, loading, pollJob]);

  const handleGenerate = async () => {
    const text = inputMode === 'text' ? sourceText.trim() : '';
    const url = inputMode === 'url' ? sourceUrl.trim() : '';
    if (!text && !url) return;
    setError(''); setResult(null); setLoading(true); setActiveTab('article');
    setLoadingMsg(url ? 'Fetching page content…' : 'Preparing content…');
    try {
      const { job_id } = await createSEOJob({ source_text: text || undefined, source_url: url || undefined, title: titleInput.trim() || undefined, language, output_format: outputFormat });
      setJobId(job_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : t(locale, 'seo.error'));
      setLoading(false);
    }
  };

  // Computed
  const { score, checks } = useMemo(() => result ? calcScore(result) : { score: 0, checks: [] }, [result]);
  const scoreColor = score >= 85 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
  const readability = useMemo(() => result?.article ? readabilityScore(result.article) : null, [result]);
  const freInfo = readability ? freLabel(readability.fre) : null;
  const schema = useMemo(() => result ? buildSchema(result, domain) : '', [result, domain]);
  const metaTags = useMemo(() => result ? buildMetaTags(result, domain) : '', [result, domain]);
  const social = useMemo(() => result ? buildSocial(result, domain) : null, [result, domain]);
  const density = useMemo(() => result?.article && result.keywords?.length ? calcDensity(result.article, result.keywords) : [], [result]);

  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: 'article', label: 'Article', show: !!(result?.article) },
    { key: 'html', label: 'HTML', show: !!(result?.html) },
    { key: 'serp', label: 'SERP Preview', show: !!result },
    { key: 'meta_tags', label: 'Meta Tags', show: !!result },
    { key: 'schema', label: 'Schema', show: !!result },
    { key: 'social', label: 'Social', show: !!result },
    { key: 'tips', label: 'Tips', show: !!(result?.readability_tips?.length || result?.internal_links?.length) },
  ].filter((tb) => tb.show);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-6 scrollbar-subtle">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-theme-fg mb-1">{t(locale, 'seo.title')}</h1>
          <p className="text-sm text-theme-fg-muted">{t(locale, 'seo.sub')}</p>
        </div>

        {/* Input card */}
        <div className="rounded-2xl border border-theme-border bg-theme-bg-subtle p-5 mb-8 flex flex-col gap-4">
          {/* Input + Output selectors */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            {/* Input mode */}
            <div className="flex gap-1">
            <button type="button" onClick={() => setInputMode('url')}
              className={`btn-tap inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${inputMode === 'url' ? 'bg-theme-bg-hover text-theme-fg border border-theme-border-hover' : 'text-theme-fg-muted hover:text-theme-fg border border-transparent'}`}>
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
              </svg>
              URL
            </button>
            <button type="button" onClick={() => setInputMode('text')}
              className={`btn-tap inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${inputMode === 'text' ? 'bg-theme-bg-hover text-theme-fg border border-theme-border-hover' : 'text-theme-fg-muted hover:text-theme-fg border border-transparent'}`}>
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              Text
            </button>
            </div>

            {/* Output format */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-theme-fg-subtle">Output:</span>
              <div className="flex gap-0.5">
                {([
                  { key: 'markdown', label: 'Markdown' },
                  { key: 'html', label: 'HTML' },
                  { key: 'both', label: 'Both' },
                ] as const).map(({ key, label }) => (
                  <button key={key} type="button" onClick={() => setOutputFormat(key)}
                    className={`btn-tap px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${outputFormat === key ? 'bg-theme-bg-hover text-theme-fg border border-theme-border-hover' : 'text-theme-fg-muted hover:text-theme-fg border border-transparent'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {inputMode === 'url' ? (
            <div>
              <label className="block text-xs font-medium text-theme-fg-muted mb-1.5">Page URL to analyze</label>
              <input type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://your-site.com/page-to-analyze"
                className="w-full rounded-xl border border-theme-border bg-theme-bg text-theme-fg placeholder:text-theme-fg-subtle text-sm px-4 py-2.5 focus:border-theme-border-strong focus:outline-none focus:ring-1 focus:ring-theme-border-hover"
                disabled={loading} />
              <p className="text-[11px] text-theme-fg-subtle mt-1.5">The backend will fetch and analyze the actual page content.</p>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-theme-fg-muted mb-1.5">Content to optimize</label>
              <textarea value={sourceText} onChange={(e) => setSourceText(e.target.value)}
                placeholder="Paste article text, product description, or any content…"
                rows={5}
                className="w-full rounded-xl border border-theme-border bg-theme-bg text-theme-fg placeholder:text-theme-fg-subtle text-sm px-4 py-3 focus:border-theme-border-strong focus:outline-none focus:ring-1 focus:ring-theme-border-hover resize-none"
                disabled={loading} />
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-theme-fg-muted mb-1.5">Your domain (for SERP & meta tags)</label>
              <input type="text" value={domain} onChange={(e) => saveDomain(e.target.value)}
                placeholder="yourdomain.com"
                className="w-full rounded-xl border border-theme-border bg-theme-bg text-theme-fg placeholder:text-theme-fg-subtle text-sm px-4 py-2.5 focus:border-theme-border-strong focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-theme-fg-muted mb-1.5">Language</label>
              <select value={language} onChange={(e) => setLanguage(e.target.value)}
                className="select-theme rounded-xl border border-theme-border bg-theme-bg text-theme-fg text-sm px-4 py-2.5 focus:outline-none"
                disabled={loading}>
                {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>

          <input type="text" value={titleInput} onChange={(e) => setTitleInput(e.target.value)}
            placeholder="Target title / topic (optional — leave empty to auto-generate)"
            className="w-full rounded-xl border border-theme-border bg-theme-bg text-theme-fg placeholder:text-theme-fg-subtle text-sm px-4 py-2.5 focus:border-theme-border-strong focus:outline-none"
            disabled={loading} />

          <div className="flex items-center gap-3 pt-1">
            <button type="button" onClick={handleGenerate}
              disabled={loading || (inputMode === 'url' ? !sourceUrl.trim() : !sourceText.trim())}
              className="btn-tap px-6 py-2.5 rounded-xl border border-theme-border-hover bg-theme-bg-hover-strong text-theme-fg font-medium text-sm disabled:opacity-50 disabled:pointer-events-none">
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-theme-border border-t-theme-fg animate-spin" />
                  {loadingMsg || t(locale, 'seo.generating')}
                </span>
              ) : t(locale, 'seo.generate')}
            </button>
            {result && <Link href="/dashboard/files" className="text-sm text-theme-fg-muted hover:text-theme-fg transition-colors">{t(locale, 'seo.viewFiles')} →</Link>}
            {result && <span className="ml-auto text-xs text-theme-success">✓ {t(locale, 'seo.savedToFiles')}</span>}
          </div>
          {error && <p className="text-sm text-theme-danger">{error}</p>}
        </div>

        {/* Results */}
        <AnimatePresence>
          {result && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="flex flex-col gap-6">

              {/* Score + Readability row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* SEO Score */}
                <div className="flex items-center gap-4 p-4 rounded-2xl border border-theme-border bg-theme-bg-subtle">
                  <div className="relative w-14 h-14 shrink-0">
                    <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                      <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
                      <circle cx="28" cy="28" r="22" fill="none" stroke={scoreColor} strokeWidth="7"
                        strokeDasharray={`${2 * Math.PI * 22}`}
                        strokeDashoffset={`${2 * Math.PI * 22 * (1 - score / 100)}`}
                        strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-sm font-bold" style={{ color: scoreColor }}>{score}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-theme-fg mb-1.5">SEO Score</p>
                    <div className="flex flex-col gap-0.5">
                      {checks.map((c) => (
                        <span key={c.label} className={`text-[10px] flex items-center gap-1 ${c.ok ? 'text-theme-success' : 'text-theme-fg-subtle'}`}>
                          {c.ok ? '✓' : '○'} {c.label} <span className="opacity-50">({c.hint})</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Readability */}
                {readability && freInfo && (
                  <div className="flex flex-col gap-3 p-4 rounded-2xl border border-theme-border bg-theme-bg-subtle">
                    <p className="text-sm font-semibold text-theme-fg">Readability</p>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl font-bold" style={{ color: freInfo.color }}>{readability.fre}</span>
                      <div>
                        <p className="text-xs font-medium" style={{ color: freInfo.color }}>{freInfo.label}</p>
                        <p className="text-[10px] text-theme-fg-subtle">Flesch Reading Ease</p>
                      </div>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${readability.fre}%`, background: freInfo.color }} />
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      {[
                        { label: 'Words', value: readability.words },
                        { label: 'Sentences', value: readability.sentences },
                        { label: 'Grade', value: `${readability.fkgl}` },
                      ].map((s) => (
                        <div key={s.label} className="rounded-lg bg-theme-bg border border-theme-border p-2">
                          <p className="text-base font-semibold text-theme-fg">{s.value}</p>
                          <p className="text-[10px] text-theme-fg-subtle">{s.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Meta strip */}
              {(result.meta_title || result.meta_description || result.keywords?.length) && (
                <div className="rounded-2xl border border-theme-border bg-theme-bg-subtle p-4 flex flex-col gap-3">
                  {result.focus_keyword && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-theme-fg-subtle">Focus keyword</span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium text-theme-accent bg-theme-bg border border-theme-border">{result.focus_keyword}</span>
                    </div>
                  )}
                  {result.meta_title && (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-semibold uppercase tracking-widest text-theme-fg-subtle">Meta title</span>
                          <CharBar value={result.meta_title.length} min={50} max={65} />
                        </div>
                        <p className="text-sm text-theme-fg">{result.meta_title}</p>
                      </div>
                      <CopyBtn text={result.meta_title} />
                    </div>
                  )}
                  {result.meta_description && (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-semibold uppercase tracking-widest text-theme-fg-subtle">Meta description</span>
                          <CharBar value={result.meta_description.length} min={150} max={165} />
                        </div>
                        <p className="text-sm text-theme-fg">{result.meta_description}</p>
                      </div>
                      <CopyBtn text={result.meta_description} />
                    </div>
                  )}
                  {result.slug && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-theme-fg-subtle">Slug</span>
                      <code className="text-xs text-theme-fg-muted font-mono bg-theme-bg px-2 py-0.5 rounded border border-theme-border">/{result.slug}</code>
                      <CopyBtn text={result.slug} />
                    </div>
                  )}
                  {result.keywords?.length ? (
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-theme-fg-subtle block mb-2">Keywords — density in article</span>
                      <div className="flex flex-wrap gap-1.5">
                        {density.map((d) => (
                          <span key={d.kw} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-theme-bg border border-theme-border text-xs text-theme-fg">
                            {d.kw}
                            <span className={`text-[10px] font-mono ${parseFloat(d.pct) >= 0.5 && parseFloat(d.pct) <= 2.5 ? 'text-theme-success' : 'text-theme-fg-subtle opacity-60'}`}>{d.pct}%</span>
                          </span>
                        ))}
                      </div>
                      <p className="text-[10px] text-theme-fg-subtle mt-1.5">Ideal keyword density: 0.5–2.5%</p>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Tabs */}
              <div>
                <div className="flex items-center gap-1 mb-3 overflow-x-auto scrollbar-none pb-1 border-b border-theme-border-subtle">
                  {tabs.map((tab) => (
                    <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)}
                      className={`btn-tap shrink-0 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${activeTab === tab.key ? 'bg-theme-bg-hover text-theme-fg' : 'text-theme-fg-muted hover:text-theme-fg'}`}>
                      {tab.label}
                    </button>
                  ))}
                  <div className="ml-auto shrink-0 flex items-center gap-1.5 pl-2">
                    {activeTab === 'article' && result.article && <><span className="text-xs text-theme-fg-subtle">{readability?.words} words</span><CopyBtn text={result.article} label="Article" /></>}
                    {activeTab === 'html' && result.html && <CopyBtn text={result.html} label="HTML" />}
                    {activeTab === 'meta_tags' && <CopyBtn text={metaTags} label="All tags" />}
                    {activeTab === 'schema' && <CopyBtn text={schema} label="Schema" />}
                    {activeTab === 'social' && social && <CopyBtn text={`LINKEDIN:\n${social.linkedin}\n\nX:\n${social.twitter}`} label="All" />}
                  </div>
                </div>

                <div className="rounded-2xl border border-theme-border bg-theme-bg-subtle overflow-hidden">

                  {/* Article */}
                  {activeTab === 'article' && result.article && (
                    <div className="p-5 max-h-[560px] overflow-y-auto scrollbar-subtle prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown>{result.article}</ReactMarkdown>
                    </div>
                  )}

                  {/* HTML */}
                  {activeTab === 'html' && result.html && (
                    <pre className="p-5 text-xs text-theme-fg-muted font-mono whitespace-pre-wrap leading-relaxed max-h-[560px] overflow-y-auto scrollbar-subtle">{result.html}</pre>
                  )}

                  {/* SERP Preview */}
                  {activeTab === 'serp' && (
                    <div className="p-6 flex flex-col gap-5">
                      <p className="text-xs text-theme-fg-subtle">
                        Google Search preview — domain: {domain ? <strong className="text-theme-fg font-mono">{domain}</strong> : <span className="text-theme-danger">set your domain in the form above</span>}
                      </p>
                      {/* Desktop + Mobile side by side */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Desktop */}
                        <div>
                          <p className="text-[10px] font-semibold text-theme-fg-subtle uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3" /></svg>
                            Desktop
                          </p>
                          <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                            <p className="text-[11px] text-theme-fg-subtle font-mono mb-1 truncate">{domain || 'yourdomain.com'} › {result.slug ?? 'article'}</p>
                            <p className="text-[17px] font-medium leading-snug mb-1 truncate" style={{ color: '#8ab4f8' }}>{result.meta_title ?? 'Page Title'}</p>
                            <p className="text-sm text-theme-fg-muted leading-relaxed line-clamp-2">{result.meta_description ?? ''}</p>
                          </div>
                        </div>
                        {/* Mobile */}
                        <div>
                          <p className="text-[10px] font-semibold text-theme-fg-subtle uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" /></svg>
                            Mobile
                          </p>
                          <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                            <div className="flex items-center gap-1.5 mb-1">
                              <div className="w-4 h-4 rounded-full bg-white/10 shrink-0" />
                              <p className="text-[10px] text-theme-fg-subtle font-mono truncate">{domain || 'yourdomain.com'}</p>
                            </div>
                            <p className="text-[15px] font-medium leading-snug mb-1" style={{ color: '#8ab4f8' }}>{result.meta_title ?? 'Page Title'}</p>
                            <p className="text-xs text-theme-fg-muted leading-relaxed line-clamp-3">{result.meta_description ?? ''}</p>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-xl bg-theme-bg border border-theme-border">
                          <p className="text-[10px] text-theme-fg-subtle mb-1">Title length — optimal 50–65</p>
                          <CharBar value={result.meta_title?.length ?? 0} min={50} max={65} />
                        </div>
                        <div className="p-3 rounded-xl bg-theme-bg border border-theme-border">
                          <p className="text-[10px] text-theme-fg-subtle mb-1">Description length — optimal 150–165</p>
                          <CharBar value={result.meta_description?.length ?? 0} min={150} max={165} />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Meta Tags — ready to copy-paste in <head> */}
                  {activeTab === 'meta_tags' && (
                    <div className="p-5 max-h-[560px] overflow-y-auto scrollbar-subtle">
                      <p className="text-xs text-theme-fg-subtle mb-3">Copy-paste this entire block into your HTML <code className="font-mono bg-white/5 px-1 rounded">&lt;head&gt;</code>:</p>
                      <pre className="text-xs text-theme-fg-muted font-mono whitespace-pre-wrap leading-relaxed">{metaTags}</pre>
                    </div>
                  )}

                  {/* Schema */}
                  {activeTab === 'schema' && (
                    <div className="p-5 max-h-[560px] overflow-y-auto scrollbar-subtle">
                      <p className="text-xs text-theme-fg-subtle mb-3">Article schema (already included in Meta Tags tab). Place in <code className="font-mono bg-white/5 px-1 rounded">&lt;head&gt;</code> as <code className="font-mono bg-white/5 px-1 rounded">application/ld+json</code>:</p>
                      <pre className="text-xs text-theme-fg-muted font-mono whitespace-pre-wrap leading-relaxed">{schema}</pre>
                    </div>
                  )}

                  {/* Social */}
                  {activeTab === 'social' && social && (
                    <div className="p-5 flex flex-col gap-5">
                      {[{ platform: 'LinkedIn', text: social.linkedin }, { platform: 'X / Twitter', text: social.twitter }].map(({ platform, text }) => (
                        <div key={platform}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-theme-fg-muted uppercase tracking-wider">{platform}</span>
                            <div className="flex items-center gap-2">
                              <span className={`text-[11px] ${platform === 'X / Twitter' && text.length > 280 ? 'text-theme-danger' : 'text-theme-fg-subtle'}`}>{text.length}{platform === 'X / Twitter' ? '/280' : ''} chars</span>
                              <CopyBtn text={text} />
                            </div>
                          </div>
                          <div className="rounded-xl border border-theme-border bg-theme-bg p-4">
                            <pre className="text-sm text-theme-fg whitespace-pre-wrap font-sans leading-relaxed">{text}</pre>
                          </div>
                          {platform === 'X / Twitter' && text.length > 280 && <p className="text-[11px] text-theme-danger mt-1">Too long — shorten before posting.</p>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Tips */}
                  {activeTab === 'tips' && (
                    <div className="p-5 flex flex-col gap-5">
                      {result.readability_tips?.length ? (
                        <div>
                          <p className="text-xs font-semibold text-theme-fg-muted uppercase tracking-wider mb-3">Readability improvements</p>
                          <ul className="flex flex-col gap-2">
                            {result.readability_tips.map((tip, i) => (
                              <li key={i} className="flex items-start gap-2.5 text-sm text-theme-fg">
                                <span className="shrink-0 w-5 h-5 rounded-full bg-theme-bg-hover border border-theme-border flex items-center justify-center text-[10px] font-bold text-theme-fg-muted mt-0.5">{i + 1}</span>
                                {tip}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {result.internal_links?.length ? (
                        <div>
                          <p className="text-xs font-semibold text-theme-fg-muted uppercase tracking-wider mb-3">Internal linking suggestions</p>
                          <div className="flex flex-col gap-2">
                            {result.internal_links.map((link, i) => (
                              <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-theme-bg border border-theme-border">
                                <span className="text-xs text-theme-fg-subtle shrink-0">Anchor:</span>
                                <code className="text-xs text-theme-fg font-mono">{link.anchor}</code>
                                <span className="text-xs text-theme-fg-subtle shrink-0">→ Topic:</span>
                                <span className="text-xs text-theme-fg truncate">{link.topic}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}

                </div>
              </div>

            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
