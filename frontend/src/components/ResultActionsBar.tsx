'use client';

import { useState, useEffect } from 'react';
import { t } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { downloadMediaUrl, setJobFeedback } from '@/lib/api';

const btnCls =
  'flex items-center justify-center w-9 h-9 rounded-lg text-theme-fg-muted hover:text-theme-fg hover:bg-theme-bg-hover active:scale-95 transition-[color,background,transform] duration-150 disabled:opacity-50 disabled:pointer-events-none';
const iconCls = 'w-5 h-5 shrink-0';

export interface ResultActionsBarProps {
  jobId: string;
  jobType: 'chat' | 'image' | 'video';
  /** Rating din DB (la încărcare job) */
  initialRating?: 'like' | 'dislike' | null;
  /** Plain text for copy (and regenerate when chat) */
  text?: string;
  /** Media URLs for download and "start thread with this" */
  mediaUrls?: string[];
  threadId?: string | null;
  /** Show regenerate only for chat with text, and only once */
  showRegenerate?: boolean;
  regenerateUsed?: boolean;
  onRegenerate?: () => void;
  onStartThread?: (mediaUrls: string[]) => void;
  locale: Locale;
}

export function ResultActionsBar({
  jobId,
  jobType,
  initialRating,
  text = '',
  mediaUrls = [],
  threadId,
  showRegenerate = false,
  regenerateUsed = false,
  onRegenerate,
  onStartThread,
  locale,
}: ResultActionsBarProps) {
  const [rating, setRating] = useState<'like' | 'dislike' | null>(initialRating ?? null);
  const [copyDone, setCopyDone] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [feedbackJustUsed, setFeedbackJustUsed] = useState<'like' | 'dislike' | null>(null);

  useEffect(() => {
    if (initialRating !== undefined) setRating(initialRating);
  }, [initialRating]);

  // Un singur feedback per răspuns: like SAU dislike; stocat în backend (DB)
  const handleLike = () => {
    const next = rating === 'like' ? null : 'like';
    setRating(next);
    setFeedbackJustUsed('like');
    const t = setTimeout(() => setFeedbackJustUsed(null), 400);
    setJobFeedback(jobId, next).catch(() => {});
    return () => clearTimeout(t);
  };
  const handleDislike = () => {
    const next = rating === 'dislike' ? null : 'dislike';
    setRating(next);
    setFeedbackJustUsed('dislike');
    const t = setTimeout(() => setFeedbackJustUsed(null), 400);
    setJobFeedback(jobId, next).catch(() => {});
    return () => clearTimeout(t);
  };
  const handleCopy = async () => {
    const toCopy = text || (mediaUrls[0] ?? '');
    if (!toCopy) return;
    try {
      await navigator.clipboard.writeText(toCopy);
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 1200);
    } catch {}
  };
  const handleDownload = async () => {
    const url = mediaUrls[0];
    if (!url || downloading) return;
    setDownloading(true);
    try {
      const blob = await downloadMediaUrl(url);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = jobType === 'video' ? 'flipo5-video.mp4' : 'flipo5-image.png';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, '_blank');
    } finally {
      setDownloading(false);
    }
  };
  const handleThread = () => {
    if (mediaUrls.length > 0 && onStartThread) onStartThread(mediaUrls);
    else if (onStartThread) onStartThread([]);
  };

  const hasMedia = mediaUrls.length > 0;
  const canRegenerate = showRegenerate && !regenerateUsed && text.length > 0 && onRegenerate;

  return (
    <div className="flex items-center gap-1 mt-2 text-theme-fg-muted" role="toolbar" aria-label={t(locale, 'feedback.actions')}>
      {canRegenerate && (
        <button type="button" onClick={onRegenerate} className={btnCls} title={t(locale, 'feedback.regenerate')} aria-label={t(locale, 'feedback.regenerate')}>
          <RegenerateIcon className={iconCls} />
        </button>
      )}
      {hasMedia && (
        <button type="button" onClick={handleDownload} disabled={downloading} className={btnCls} title={t(locale, 'feedback.download')} aria-label={t(locale, 'feedback.download')}>
          <DownloadIcon className={iconCls} />
        </button>
      )}
      <button type="button" onClick={handleThread} className={btnCls} title={t(locale, 'feedback.thread')} aria-label={t(locale, 'feedback.thread')}>
        <ThreadIcon className={iconCls} />
      </button>
      <button
        type="button"
        onClick={handleCopy}
        className={`${btnCls} ${copyDone ? '!text-green-500' : ''}`}
        title={copyDone ? t(locale, 'feedback.copied') : t(locale, 'feedback.copy')}
        aria-label={t(locale, 'feedback.copy')}
      >
        {copyDone ? <CheckIcon className={`${iconCls} animate-scale-in`} /> : <CopyIcon className={iconCls} />}
      </button>
      <button
        type="button"
        onClick={handleLike}
        className={`${btnCls} ${rating === 'like' ? 'text-theme-accent' : ''} ${feedbackJustUsed === 'like' ? 'animate-feedback-used' : ''}`}
        title={t(locale, 'feedback.like')}
        aria-label={t(locale, 'feedback.like')}
      >
        <LikeIcon className={iconCls} />
      </button>
      <button
        type="button"
        onClick={handleDislike}
        className={`${btnCls} ${rating === 'dislike' ? 'text-theme-danger' : ''} ${feedbackJustUsed === 'dislike' ? 'animate-feedback-used' : ''}`}
        title={t(locale, 'feedback.dislike')}
        aria-label={t(locale, 'feedback.dislike')}
      >
        <DislikeIcon className={iconCls} />
      </button>
    </div>
  );
}

const iconStroke = 2;
function RegenerateIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={iconStroke}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  );
}
function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={iconStroke}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  );
}
function ThreadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={iconStroke}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a.75.75 0 0 1 .865-.501 48.52 48.52 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
    </svg>
  );
}
function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={iconStroke}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.369.022.739.112 1.087.32 1.563.501 2.458 2.06 2.458 3.69v6.018A2.25 2.25 0 0 1 13.5 15.75h-3a2.25 2.25 0 0 1-2.25-2.25V6.257c0-1.63.895-3.189 2.458-3.69A2.25 2.25 0 0 0 10.5 2.25H7.5a2.25 2.25 0 0 0-2.166 1.638M15.666 3.888v6.018a2.25 2.25 0 0 1-2.25 2.25H7.5a2.25 2.25 0 0 1-2.25-2.25V3.888m9.416 0h.008Z" />
    </svg>
  );
}
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}
function LikeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={iconStroke}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.04 9.04 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V2.75a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23h-.777Z" />
    </svg>
  );
}
function DislikeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={iconStroke} strokeLinecap="round" strokeLinejoin="round">
      <path d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}
