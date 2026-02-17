'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { getJob, getToken, getJobStreamUrl } from '@/lib/api';
import type { Job } from '@/lib/api';
import type { Locale } from '@/lib/i18n';
import { t } from '@/lib/i18n';
import { getOutputUrls } from '@/lib/jobOutput';
import { ImageGallery } from './ImageGallery';
import { ImageViewModal } from './ImageViewModal';
import { ResultActionsBar } from '@/components/ResultActionsBar';
import { jobErrorDisplay } from '@/lib/i18n';

// Markdown components: render AI output (including tables) without requiring prompt instructions
const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => <p className="text-[15px] text-theme-fg/90 leading-relaxed mb-2 last:mb-0 break-words">{children}</p>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="list-disc pl-5 my-2 space-y-0.5 break-words">{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol className="list-decimal pl-5 my-2 space-y-0.5 break-words">{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li className="text-[15px] text-theme-fg/90 break-words">{children}</li>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold text-theme-fg">{children}</strong>,
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => <a href={href} className="text-theme-accent hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>,
  h1: ({ children }: { children?: React.ReactNode }) => <h1 className="text-xl font-bold text-theme-fg mt-4 mb-2 first:mt-0">{children}</h1>,
  h2: ({ children }: { children?: React.ReactNode }) => <h2 className="text-lg font-semibold text-theme-fg mt-3 mb-2">{children}</h2>,
  h3: ({ children }: { children?: React.ReactNode }) => <h3 className="text-base font-semibold text-theme-fg mt-2 mb-1">{children}</h3>,
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto my-3 rounded-lg border border-theme-border">
      <table className="min-w-full border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => <thead className="bg-theme-bg-hover">{children}</thead>,
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="border border-theme-border px-3 py-2 text-left text-[14px] font-semibold text-theme-fg whitespace-nowrap">{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="border border-theme-border px-3 py-2 text-[14px] text-theme-fg/90 break-words">{children}</td>
  ),
  tr: ({ children }: { children?: React.ReactNode }) => <tr className="even:bg-theme-bg-subtle">{children}</tr>,
  tbody: ({ children }: { children?: React.ReactNode }) => <tbody>{children}</tbody>,
};

function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin shrink-0 ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

export function JobCard({
  jobId,
  locale,
  dark,
  onNotFound,
  onUseAsReference,
  onRegenerate,
  onStartThread,
  regenerateUsed = false,
  variant = 'card',
}: {
  jobId: string;
  locale: Locale;
  dark?: boolean;
  onNotFound?: () => void;
  onUseAsReference?: (url: string) => void;
  onRegenerate?: () => void;
  onStartThread?: (mediaUrls: string[]) => void;
  regenerateUsed?: boolean;
  variant?: 'card' | 'chat';
}) {
  const [job, setJob] = useState<Job | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [viewingVideoUrl, setViewingVideoUrl] = useState<string | null>(null);
  const [streamOutput, setStreamOutput] = useState('');
  const [streamStatus, setStreamStatus] = useState<string | null>(null);
  const [displayLen, setDisplayLen] = useState(0); // typing animation
  const esRef = useRef<EventSource | null>(null);
  const streamBufferRef = useRef('');
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setNotFound(false);
    setStreamOutput('');
    setStreamStatus(null);
    setRetryCount(0);
    streamBufferRef.current = '';
    function poll() {
      getJob(jobId)
        .then((j) => {
          if (cancelled) return;
          if (j === null) {
            setNotFound(true);
            onNotFound?.();
            return;
          }
          setJob(j);
          if (j.status === 'pending' || j.status === 'running') {
            setTimeout(poll, 4000); // 4s to reduce API load when multiple JobCards poll
          }
        });
    }
    poll();
    return () => { cancelled = true; };
  }, [jobId, onNotFound, retryKey]);

  // Retry fetch when completed image/video job has no URLs (mirror may still be updating)
  useEffect(() => {
    if (!job || (job.type !== 'image' && job.type !== 'video') || job.status !== 'completed' || retryCount >= 3) return;
    const urls = getOutputUrls(job.output);
    if (urls.length > 0) return;
    let cancelled = false;
    const t = setTimeout(() => {
      getJob(jobId).then((j) => {
        if (!cancelled && j) setJob(j);
        if (!cancelled) setRetryCount((c) => c + 1);
      });
    }, 800);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [job?.id, job?.output, job?.status, job?.type, jobId, retryCount]);

  // Buffer flush: SSE → state every 50ms (ChatGPT-style, fewer re-renders). Only when streaming.
  const isStreaming = variant === 'chat' && job && (job.status === 'pending' || job.status === 'running');
  useEffect(() => {
    if (!isStreaming) return;
    const id = setInterval(() => {
      setStreamOutput((prev) => {
        const buf = streamBufferRef.current;
        return prev !== buf ? buf : prev;
      });
    }, 50);
    return () => clearInterval(id);
  }, [isStreaming]);

  // Typing animation: displayLen catches up (smooth, fluid character reveal)
  useEffect(() => {
    if (streamOutput.length === 0) {
      setDisplayLen(0);
      return;
    }
    const id = setInterval(() => {
      setDisplayLen((prev) => {
        const target = streamOutput.length;
        if (prev >= target) return prev;
        const step = Math.min(5, Math.ceil((target - prev) / 4));
        return Math.min(prev + step, target);
      });
    }, 40);
    return () => clearInterval(id);
  }, [streamOutput]);

  // Auto-scroll streaming bubble into view (keep latest content visible)
  useEffect(() => {
    if (streamOutput.length > 0 && streamStatus !== 'completed' && streamStatus !== 'failed' && bubbleRef.current) {
      bubbleRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [displayLen, streamOutput.length, streamStatus]);

  // SSE stream for chat variant when job is pending/running
  useEffect(() => {
    if (variant !== 'chat' || !jobId || !job) return;
    if (job.status !== 'pending' && job.status !== 'running') return;
    const cancelledRef = { current: false };
    getToken().then((token) => {
      if (cancelledRef.current || !token) return;
      const url = getJobStreamUrl(jobId, token);
      if (!url) return;
      const es = new EventSource(url);
      esRef.current = es;
      es.onmessage = (e) => {
        if (cancelledRef.current) return;
        try {
          const d = JSON.parse(e.data) as { output?: string; status?: string };
          if (d.output !== undefined) streamBufferRef.current = d.output;
          if (d.status) setStreamStatus(d.status);
          if (d.status === 'completed' || d.status === 'failed') {
            if (cancelledRef.current) return;
            if (d.output !== undefined) setStreamOutput(d.output);
            es.close();
            esRef.current = null;
            setJob((prev) =>
              prev
                ? {
                    ...prev,
                    status: d.status!,
                    output: d.status === 'completed' ? { output: d.output ?? '' } : prev.output,
                    error: d.status === 'failed' ? (prev.error ?? t(locale, 'common.failed')) : prev.error,
                  }
                : null
            );
          }
        } catch (_) {}
      };
      es.onerror = () => {
        es.close();
        esRef.current = null;
      };
    });
    return () => {
      cancelledRef.current = true;
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [jobId, variant, job?.status]);

  const isChat = variant === 'chat';
  const textCls = dark ? 'text-theme-fg-muted' : 'text-theme-fg-muted';
  const errCls = dark ? 'text-theme-danger' : 'text-theme-danger';

  if (notFound) {
    return (
      <div className="flex flex-col gap-2">
        <p className={`text-sm mt-2 ${textCls}`}>{t(locale, 'jobs.notFound')}</p>
        <button
          type="button"
          onClick={() => setRetryKey((k) => k + 1)}
          className="text-sm text-theme-accent hover:underline self-start"
        >
          {t(locale, 'common.retry') || 'Retry'}
        </button>
      </div>
    );
  }

  // Image job: pending/running = ChatGPT-style gradient loader card
  if (job && job.type === 'image' && (job.status === 'pending' || job.status === 'running')) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[340px] rounded-2xl rounded-tl-md overflow-hidden">
          <div className="aspect-[4/3] bg-gradient-to-br from-amber-900/40 via-purple-900/30 to-pink-900/40 flex flex-col items-center justify-center gap-3 p-6">
            <div className="w-10 h-10 rounded-full border-2 border-theme-border-hover border-t-theme-fg animate-spin" />
            <p className="text-sm text-theme-fg/80">{t(locale, 'image.creating')}</p>
          </div>
        </div>
      </div>
    );
  }

  // Video job: pending/running = same gradient loader card
  if (job && job.type === 'video' && (job.status === 'pending' || job.status === 'running')) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[340px] rounded-2xl rounded-tl-md overflow-hidden">
          <div className="aspect-[4/3] bg-gradient-to-br from-amber-900/40 via-purple-900/30 to-pink-900/40 flex flex-col items-center justify-center gap-3 p-6">
            <div className="w-10 h-10 rounded-full border-2 border-theme-border-hover border-t-theme-fg animate-spin" />
            <p className="text-sm text-theme-fg/80">{t(locale, 'video.creating')}</p>
          </div>
        </div>
      </div>
    );
  }

  // Chat variant: loading = cerc în locul răspunsului (stânga)
  if (isChat && !job) {
    return (
      <div className="flex justify-start" aria-label={t(locale, 'common.loading')}>
        <div className="rounded-2xl rounded-tl-md bg-theme-bg-subtle px-4 py-3 min-w-[48px] flex items-center justify-center">
          <Spinner className="h-5 w-5 text-theme-fg/50" />
        </div>
      </div>
    );
  }

  // Chat variant: pending/running = streaming text + spinner until done
  if (isChat && job && (job.status === 'pending' || job.status === 'running')) {
    const hasAttachments = !!(
      job.input &&
      typeof job.input === 'object' &&
      Array.isArray((job.input as { attachment_urls?: unknown }).attachment_urls) &&
      (job.input as { attachment_urls: unknown[] }).attachment_urls.length > 0
    );
    const attachmentUrls = (job.input as { attachment_urls?: string[] } | null)?.attachment_urls ?? [];
    const validAttachments = attachmentUrls.filter((u): u is string => typeof u === 'string' && u.startsWith('http'));
    const showStream = streamOutput.length > 0 || streamStatus === 'completed' || streamStatus === 'failed';
    const typedText = streamOutput.slice(0, displayLen);
    const showCursor = streamStatus !== 'completed' && streamStatus !== 'failed';
    return (
      <div className="flex justify-start" aria-label={t(locale, 'jobs.waitingForResponse')} ref={bubbleRef}>
        <div className="max-w-[85%] min-w-0 rounded-2xl rounded-tl-md bg-theme-bg-subtle px-4 py-3 flex flex-col gap-2 overflow-visible">
          <div className="flex items-center gap-2 min-w-0">
            {showStream ? (
              <div className="flex-1 min-w-0 prose prose-invert prose-sm max-w-none overflow-visible break-words [&_*]:break-words">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={markdownComponents}>
                  {typedText || '\u00a0'}
                </ReactMarkdown>
                {showCursor && <span className="inline-block w-2 h-4 ml-0.5 bg-theme-fg/70 animate-pulse" aria-hidden />}
              </div>
            ) : (
              <span className="text-[15px] text-theme-fg/60">
                {hasAttachments ? t(locale, 'chat.analyzingAttachment') : '\u00a0'}
              </span>
            )}
            {!showStream && streamStatus !== 'completed' && streamStatus !== 'failed' && (
              <Spinner className="h-5 w-5 shrink-0 text-theme-fg/50" />
            )}
          </div>
          {validAttachments.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {validAttachments.map((url) => (
                <img key={url} src={url} alt="" className="w-10 h-10 object-cover rounded border border-theme-border shrink-0" />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!job) return <p className={`text-sm mt-2 flex items-center gap-2 ${textCls}`}><Spinner /> {t(locale, 'jobs.loading')}</p>;

  const isPending = job.status === 'pending' || job.status === 'running';
  const statusLabel =
    job.status === 'pending'
      ? t(locale, 'jobs.status.pending')
      : job.status === 'running'
        ? t(locale, 'jobs.status.running')
        : job.status === 'completed'
          ? t(locale, 'jobs.status.completed')
          : job.status === 'cancelled'
            ? t(locale, 'jobs.status.cancelled')
            : t(locale, 'jobs.status.failed');

  const cardCls = dark
    ? 'mt-3 p-3 border border-theme-border-subtle rounded-lg bg-theme-bg-subtle'
    : 'mt-3 p-3 border border-theme-border rounded bg-theme-bg-subtle';
  const linkCls = dark ? 'text-theme-fg hover:underline' : 'text-theme-fg underline';
  const preCls = dark ? 'text-theme-fg-muted' : 'text-theme-fg-muted';

  const out = job.output as { output?: string | string[] } | string[] | null;
  let outputStr = '';
  let outputArr: string[] = [];
  if (Array.isArray(out)) {
    outputStr = out.filter((x): x is string => typeof x === 'string').join('');
    outputArr = out.filter((x): x is string => typeof x === 'string' && x.startsWith('http'));
  } else if (out && typeof out === 'object') {
    outputStr = typeof out.output === 'string' ? out.output : '';
    outputArr = Array.isArray(out.output) ? out.output.filter((x): x is string => typeof x === 'string' && x.startsWith('http')) : [];
    if (!outputStr && outputArr.length > 0) outputStr = outputArr.filter((x): x is string => typeof x === 'string').join('');
  }
  const imageUrls = outputArr.length > 0 ? outputArr : getOutputUrls(job.output);

  // Image job: completed = gallery (1 large + thumbnails to swap)
  if (job && job.type === 'image' && job.status === 'completed') {
    const urls = imageUrls;
    if (urls.length > 0) {
      return (
        <div className="flex flex-col items-start">
          <ImageGallery urls={urls} variant="chat" locale={locale} onUseAsReference={onUseAsReference} />
          <ResultActionsBar
            jobId={jobId}
            jobType="image"
            initialRating={job.rating === 'like' || job.rating === 'dislike' ? job.rating : undefined}
            mediaUrls={urls}
            threadId={job.thread_id ?? null}
            locale={locale}
            onStartThread={onStartThread}
          />
        </div>
      );
    }
    // Avoid flash of "no response" while output/urls may still be loading - show loader, "no response" only after retries
    if (retryCount < 3) {
      return (
        <div className="flex justify-start">
          <div className="max-w-[340px] rounded-2xl rounded-tl-md overflow-hidden">
            <div className="aspect-[4/3] bg-gradient-to-br from-amber-900/40 via-purple-900/30 to-pink-900/40 flex flex-col items-center justify-center gap-3 p-6">
              <div className="w-10 h-10 rounded-full border-2 border-theme-border-hover border-t-theme-fg animate-spin" />
              <p className="text-sm text-theme-fg/80">{t(locale, 'image.creating')}</p>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="flex justify-start">
        <p className={`rounded-2xl rounded-tl-md bg-theme-bg-subtle px-4 py-2.5 text-sm ${textCls} italic`}>{t(locale, 'chat.noResponse')}</p>
      </div>
    );
  }

  // Image job: failed
  if (job && job.type === 'image' && job.status === 'failed') {
    return (
      <div className="flex justify-start">
        <p className={`rounded-2xl rounded-tl-md bg-theme-danger-muted px-4 py-2 text-sm ${errCls}`}>{jobErrorDisplay(job.error, locale)}</p>
      </div>
    );
  }

  // Video job: completed = video player (or gradient loader while URLs loading)
  if (job && job.type === 'video' && job.status === 'completed') {
    const videoUrl = imageUrls[0];
    if (!videoUrl && retryCount < 3) {
      return (
        <div className="flex justify-start">
          <div className="max-w-[340px] rounded-2xl rounded-tl-md overflow-hidden">
            <div className="aspect-[4/3] bg-gradient-to-br from-amber-900/40 via-purple-900/30 to-pink-900/40 flex flex-col items-center justify-center gap-3 p-6">
              <div className="w-10 h-10 rounded-full border-2 border-theme-border-hover border-t-theme-fg animate-spin" />
              <p className="text-sm text-theme-fg/80">{t(locale, 'video.creating')}</p>
            </div>
          </div>
        </div>
      );
    }
    if (videoUrl) {
      return (
        <>
          <div className="flex flex-col items-start">
            <div className="flex justify-start">
              <button
                type="button"
                onClick={() => setViewingVideoUrl(videoUrl)}
                className="max-w-[340px] rounded-2xl rounded-tl-md overflow-hidden text-left block cursor-pointer relative group"
              >
                <video
                  src={videoUrl}
                  className="w-full aspect-video object-cover pointer-events-none"
                  muted
                  preload="metadata"
                  playsInline
                />
                <div className="absolute inset-0 flex items-center justify-center bg-theme-bg-overlay group-hover:bg-theme-bg-overlay-strong transition-colors pointer-events-none">
                  <span className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                    <PlayIcon className="w-7 h-7 text-black ml-1" />
                  </span>
                </div>
              </button>
            </div>
            <ResultActionsBar
              jobId={jobId}
              jobType="video"
              initialRating={job.rating === 'like' || job.rating === 'dislike' ? job.rating : undefined}
              mediaUrls={[videoUrl]}
              threadId={job.thread_id ?? null}
              locale={locale}
              onStartThread={onStartThread}
            />
          </div>
          {viewingVideoUrl && (
            <ImageViewModal url={viewingVideoUrl} onClose={() => setViewingVideoUrl(null)} locale={locale} />
          )}
        </>
      );
    }
    return (
      <div className="flex justify-start">
        <p className={`rounded-2xl rounded-tl-md bg-theme-bg-subtle px-4 py-2.5 text-sm ${textCls} italic`}>{t(locale, 'chat.noResponse')}</p>
      </div>
    );
  }

  // Video job: failed
  if (job && job.type === 'video' && job.status === 'failed') {
    return (
      <div className="flex justify-start">
        <p className={`rounded-2xl rounded-tl-md bg-theme-danger-muted px-4 py-2 text-sm ${errCls}`}>{jobErrorDisplay(job.error, locale)}</p>
      </div>
    );
  }

  // Chat variant: completed = balon stânga (markdown, liste, linkuri)
  if (isChat && job.status === 'completed') {
    const hasText = outputStr.length > 0;
    const hasImages = outputArr.filter((url): url is string => typeof url === 'string' && url.length > 0 && url.startsWith('http')).length > 0;
    const attachmentUrls = (job.input as { attachment_urls?: string[] } | null)?.attachment_urls ?? [];
    const validAttachments = attachmentUrls.filter((u): u is string => typeof u === 'string' && u.startsWith('http'));
    if (!hasText && !hasImages) {
      return (
        <div className="flex justify-start flex-col items-start">
          <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-theme-bg-subtle px-4 py-2.5">
            <p className="text-[15px] text-theme-fg/50 italic">{t(locale, 'chat.noResponse')}</p>
            {validAttachments.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {validAttachments.map((url) => (
                  <img key={url} src={url} alt="" className="w-12 h-12 object-cover rounded border border-theme-border shrink-0" />
                ))}
              </div>
            )}
          </div>
          <ResultActionsBar
            jobId={jobId}
            jobType="chat"
            initialRating={job.rating === 'like' || job.rating === 'dislike' ? job.rating : undefined}
            mediaUrls={validAttachments}
            threadId={job.thread_id ?? null}
            locale={locale}
            onStartThread={onStartThread}
          />
        </div>
      );
    }
    const chatMediaUrls = outputArr.filter((url): url is string => typeof url === 'string' && url.length > 0 && url.startsWith('http'));
    return (
      <div className="flex justify-start flex-col items-start">
        <div className="max-w-[85%] min-w-0 rounded-2xl rounded-tl-md bg-theme-bg-subtle px-4 py-2.5 overflow-visible break-words">
          {outputStr && (
            <div className="prose prose-invert prose-sm max-w-none overflow-visible break-words [&_*]:break-words">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={markdownComponents}>
                {outputStr}
              </ReactMarkdown>
            </div>
          )}
          {chatMediaUrls.map((url) => (
            <img key={url} src={url} alt="" className="mt-2 max-w-full h-auto rounded-lg" />
          ))}
          {validAttachments.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {validAttachments.map((url) => (
                <img key={url} src={url} alt="" className="w-10 h-10 object-cover rounded border border-theme-border shrink-0" />
              ))}
            </div>
          )}
        </div>
        <ResultActionsBar
          jobId={jobId}
          jobType="chat"
          initialRating={job.rating === 'like' || job.rating === 'dislike' ? job.rating : undefined}
          text={outputStr}
          mediaUrls={chatMediaUrls}
          threadId={job.thread_id ?? null}
          showRegenerate={outputStr.length > 0}
          regenerateUsed={regenerateUsed}
          onRegenerate={onRegenerate}
          onStartThread={onStartThread}
          locale={locale}
        />
      </div>
    );
  }

  // Chat variant: failed = balon stânga, mesaj scurt
  if (isChat && job.status === 'failed') {
    return (
      <div className="flex justify-start">
        <p className={`rounded-2xl rounded-tl-md bg-theme-danger-muted px-4 py-2 text-sm ${errCls}`}>{jobErrorDisplay(job.error, locale)}</p>
      </div>
    );
  }

  // Card variant (default)
  const cardOutputUrls = outputArr.filter((url): url is string => typeof url === 'string' && url.length > 0 && url.startsWith('http'));
  return (
    <div className={cardCls}>
      <div className="flex items-center justify-between text-sm">
        <span className={`${textCls} flex items-center gap-2`}>{isPending && <Spinner />}{statusLabel}</span>
        <Link href={`/dashboard/jobs/${jobId}`} className={linkCls}>
          {t(locale, 'jobs.view')}
        </Link>
      </div>
      {isPending && <p className={`mt-2 text-xs ${textCls}`}>{t(locale, 'jobs.waitingForResponse')}</p>}
      {job.status === 'completed' && job.output && (
        <>
          {outputStr && <p className={`mt-2 text-sm whitespace-pre-wrap ${dark ? 'text-theme-fg' : 'text-black'}`}>{outputStr}</p>}
          {cardOutputUrls.map((url) => (
            <img key={url} src={url} alt="" className="mt-2 max-w-full h-auto rounded border border-theme-border-subtle" />
          ))}
          {!outputStr && outputArr.length === 0 && out && typeof out === 'object' && 'output' in out && (
            <pre className={`mt-2 text-xs overflow-auto ${preCls}`}>{JSON.stringify(job.output)}</pre>
          )}
          <ResultActionsBar
            jobId={jobId}
            jobType={job.type as 'chat' | 'image' | 'video'}
            initialRating={job.rating === 'like' || job.rating === 'dislike' ? job.rating : undefined}
            text={outputStr}
            mediaUrls={cardOutputUrls}
            threadId={job.thread_id ?? null}
            showRegenerate={job.type === 'chat' && outputStr.length > 0}
            regenerateUsed={regenerateUsed}
            onRegenerate={onRegenerate}
            onStartThread={onStartThread}
            locale={locale}
          />
        </>
      )}
      {job.status === 'failed' && job.error && (
        <p className={`mt-2 text-sm ${errCls}`}>{jobErrorDisplay(job.error, locale)}</p>
      )}
    </div>
  );
}
function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
