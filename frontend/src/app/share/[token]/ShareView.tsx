'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { fetchPublicShare, getShareDisplayUrl, type PublicSharePayload } from '@/lib/api';

const ShareMarkdownBody = dynamic(
  () => import('./ShareMarkdownBody').then((m) => ({ default: m.ShareMarkdownBody })),
  { ssr: false, loading: () => <div className="min-h-[120px] rounded-xl border border-theme-border bg-theme-bg-subtle animate-pulse" aria-hidden /> }
);

function isVideoRef(ref: string): boolean {
  return /\.(mp4|webm|mov)(\?|$)/i.test(ref) || ref.includes('video');
}

export default function ShareView({ token }: { token: string }) {
  const [data, setData] = useState<PublicSharePayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPublicShare(token)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setErr('invalid');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (err) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6 text-center text-theme-fg-muted">
        <p>This link is invalid or has expired.</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6 text-theme-fg-muted animate-pulse">
        Loading…
      </div>
    );
  }

  const title = data.name?.trim() || 'Shared result';

  return (
    <div className="min-h-screen bg-theme-bg text-theme-fg p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="border-b border-theme-border pb-4">
          <p className="text-xs text-theme-fg-muted uppercase tracking-wide mb-1">Flipo5 · read-only</p>
          <h1 className="text-xl font-semibold">{title}</h1>
          {data.prompt ? <p className="text-sm text-theme-fg-muted mt-2 line-clamp-4">{data.prompt}</p> : null}
          {data.expires_at ? (
            <p className="text-xs text-theme-fg-subtle mt-2">Link valid until {new Date(data.expires_at).toLocaleString()}</p>
          ) : null}
        </header>

        {data.text ? <ShareMarkdownBody text={data.text} /> : null}

        {data.media_refs?.length ? (
          <div className="space-y-4">
            {data.media_refs.map((ref, i) => {
              const src = getShareDisplayUrl(ref, token);
              const vid = isVideoRef(ref);
              return (
                <div key={i} className="rounded-xl border border-theme-border overflow-hidden bg-theme-bg-elevated">
                  {vid ? (
                    <video src={src} className="w-full max-h-[80vh]" controls playsInline preload="metadata" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt="" className="w-full max-h-[80vh] object-contain mx-auto" />
                  )}
                </div>
              );
            })}
          </div>
        ) : null}

        {!data.text && !data.media_refs?.length ? (
          <p className="text-theme-fg-muted">No preview available for this item.</p>
        ) : null}
      </div>
    </div>
  );
}
