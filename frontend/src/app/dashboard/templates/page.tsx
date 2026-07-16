'use client';

import { useState } from 'react';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';
import { runTemplate } from '@/lib/api';

export default function TemplatesPage() {
  const { locale } = useLocale();
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState<string | null>(null);
  const [amazonName, setAmazonName] = useState('');
  const [amazonDesc, setAmazonDesc] = useState('');
  const [brand, setBrand] = useState('');
  const [theme, setTheme] = useState('engagement');

  const run = async (template: 'amazon_listing' | 'social_week') => {
    setLoading(template);
    try {
      const input: Record<string, string> =
        template === 'amazon_listing'
          ? { product_name: amazonName, description: amazonDesc }
          : { brand, theme };
      const r = await runTemplate(template, input);
      setMessage(`${r.jobs.length} jobs queued`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-semibold text-theme-fg">Batch templates</h1>
      <p className="text-theme-fg-muted text-sm">Run multi-step packs (SEO + images, content plan + visuals).</p>
      {message && <p className="text-sm text-theme-accent">{message}</p>}

      <section className="rounded-xl border border-theme-border p-5 space-y-4 bg-theme-bg-subtle">
        <h2 className="font-medium text-theme-fg">Amazon listing pack</h2>
        <p className="text-sm text-theme-fg-muted">1 SEO listing + 4 product images (1:1)</p>
        <input
          className="w-full rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm"
          placeholder="Product name"
          value={amazonName}
          onChange={(e) => setAmazonName(e.target.value)}
        />
        <textarea
          className="w-full rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm min-h-[80px]"
          placeholder="Short description / features (optional)"
          value={amazonDesc}
          onChange={(e) => setAmazonDesc(e.target.value)}
        />
        <button
          type="button"
          disabled={!amazonName.trim() || loading === 'amazon_listing'}
          onClick={() => run('amazon_listing')}
          className="rounded-lg bg-theme-accent px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {loading === 'amazon_listing' ? 'Starting…' : 'Run Amazon pack'}
        </button>
      </section>

      <section className="rounded-xl border border-theme-border p-5 space-y-4 bg-theme-bg-subtle">
        <h2 className="font-medium text-theme-fg">Social media week</h2>
        <p className="text-sm text-theme-fg-muted">7-day outline + 7 post images</p>
        <input
          className="w-full rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm"
          placeholder="Brand name"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
        />
        <input
          className="w-full rounded-lg border border-theme-border bg-theme-bg px-3 py-2 text-sm"
          placeholder="Theme (e.g. product launch)"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
        />
        <button
          type="button"
          disabled={!brand.trim() || loading === 'social_week'}
          onClick={() => run('social_week')}
          className="rounded-lg bg-theme-accent px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {loading === 'social_week' ? 'Starting…' : 'Run social week'}
        </button>
      </section>
    </div>
  );
}
