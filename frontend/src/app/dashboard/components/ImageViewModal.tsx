'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/app/components/ToastContext';
import { t } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { downloadMediaUrl, fetchBlobForJobRef, createProject, addProjectItem } from '@/lib/api';
import { VideoPlayer } from './VideoPlayer';

function isVideoUrl(u: string) {
  return /\.(mp4|webm|mov)(\?|$)/i.test(u);
}

interface ImageViewModalProps {
  url: string;
  urls?: string[];
  /** When URLs need a proxy to display, pass raw URLs here for download. Same order as urls. */
  downloadUrls?: string[];
  onDelete?: (url: string) => void | Promise<void>;
  onClose: () => void;
  locale?: Locale;
}

export function ImageViewModal({ url, urls, downloadUrls, onDelete, onClose, locale = 'en' }: ImageViewModalProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const list = urls && urls.length > 1 ? urls : [url];
  const [idx, setIdx] = useState(() => Math.max(0, list.indexOf(url)));
  const safeIdx = Math.max(0, Math.min(idx, list.length - 1));
  const currentUrl = list[safeIdx];
  const downloadUrl = (downloadUrls && downloadUrls[safeIdx]) ?? currentUrl;
  const isVideo = isVideoUrl(currentUrl);
  const hasPrev = safeIdx > 0;
  const hasNext = safeIdx < list.length - 1;
  const [editLoading, setEditLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [nativeShareBusy, setNativeShareBusy] = useState(false);
  const shareWrapRef = useRef<HTMLDivElement>(null);

  const shareLink = useMemo(() => {
    const d = downloadUrl.trim();
    const c = currentUrl.trim();
    if (d.startsWith('https://') || d.startsWith('http://')) return d;
    if (c.startsWith('https://') || c.startsWith('http://')) return c;
    return c || d;
  }, [downloadUrl, currentUrl]);

  useEffect(() => {
    if (!urls?.length) return;
    const next = urls.indexOf(url);
    setIdx(next >= 0 ? next : 0);
  }, [url, urls]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (shareMenuOpen) {
          setShareMenuOpen(false);
          return;
        }
        onClose();
      }
      if (e.key === 'ArrowLeft' && hasPrev) setIdx((i) => i - 1);
      if (e.key === 'ArrowRight' && hasNext) setIdx((i) => i + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, hasPrev, hasNext, shareMenuOpen]);

  useEffect(() => {
    if (!shareMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const node = e.target as Node;
      if (shareWrapRef.current && !shareWrapRef.current.contains(node)) setShareMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [shareMenuOpen]);

  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const getExt = (blob: Blob, u: string) => {
    if (blob.type.includes('video')) return blob.type.includes('webm') ? 'webm' : 'mp4';
    if (blob.type.includes('png')) return 'png';
    if (blob.type.includes('webp')) return 'webp';
    if (blob.type.includes('gif')) return 'gif';
    if (/\.(mp4|webm|mov)(\?|$)/i.test(u)) return u.toLowerCase().includes('webm') ? 'webm' : 'mp4';
    if (/\.(png|webp|gif)(\?|$)/i.test(u)) return u.match(/\.(png|webp|gif)/i)?.[1]?.toLowerCase() ?? 'jpg';
    return 'jpg';
  };

  const handleSave = useCallback(async () => {
    if (saveLoading) return;
    setSaveLoading(true);
    try {
      let blob: Blob;
      if (downloadUrl.startsWith('http://') || downloadUrl.startsWith('https://')) {
        try {
          blob = await downloadMediaUrl(downloadUrl);
        } catch {
          const res = await fetch(downloadUrl);
          if (!res.ok) throw new Error('Fetch failed');
          blob = await res.blob();
        }
      } else {
        blob = await fetchBlobForJobRef(downloadUrl);
      }
      const ext = getExt(blob, downloadUrl);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `flipo5-${Date.now()}.${ext}`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
      }, 100);
      showToast('toast.downloaded');
    } catch (_) {
      showToast('common.failed');
    } finally {
      setSaveLoading(false);
    }
  }, [downloadUrl, showToast, saveLoading]);

  const buildBlobForShare = useCallback(async (): Promise<Blob> => {
    if (currentUrl.startsWith('http://') || currentUrl.startsWith('https://')) {
      const res = await fetch(currentUrl);
      if (!res.ok) throw new Error('fetch');
      return res.blob();
    }
    return fetchBlobForJobRef(downloadUrl);
  }, [currentUrl, downloadUrl]);

  const handleNativeShare = useCallback(async () => {
    if (nativeShareBusy) return;
    setNativeShareBusy(true);
    try {
      const blob = await buildBlobForShare();
      const ext = getExt(blob, downloadUrl);
      const file = new File([blob], `flipo5.${ext}`, { type: blob.type || 'application/octet-stream' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Flipo5' });
        setShareMenuOpen(false);
        return;
      }
      if (typeof navigator.share === 'function' && (shareLink.startsWith('https://') || shareLink.startsWith('http://'))) {
        await navigator.share({ title: 'Flipo5', url: shareLink });
        setShareMenuOpen(false);
        return;
      }
      await navigator.clipboard.writeText(shareLink);
      showToast('toast.copied');
      setShareMenuOpen(false);
    } catch (_) {
      showToast('common.failed');
    } finally {
      setNativeShareBusy(false);
    }
  }, [buildBlobForShare, downloadUrl, nativeShareBusy, shareLink, showToast]);

  const handleCopyShareLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      showToast('toast.copied');
      setShareMenuOpen(false);
    } catch (_) {
      showToast('common.failed');
    }
  }, [shareLink, showToast]);

  const openSocial = useCallback((href: string) => {
    window.open(href, '_blank', 'noopener,noreferrer');
    setShareMenuOpen(false);
  }, []);

  const handleEditInStudio = useCallback(async () => {
    if (editLoading) return;
    setEditLoading(true);
    try {
      const uniqueName = `Edit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const { id } = await createProject(uniqueName);
      await addProjectItem(id, isVideo ? 'video' : 'image', downloadUrl);
      onClose();
      router.push(`/dashboard/studio/${id}`);
    } catch (_) {
      setEditLoading(false);
    }
  }, [downloadUrl, isVideo, onClose, router, editLoading]);

  const handleDelete = useCallback(async () => {
    if (!onDelete || deleteLoading) return;
    setDeleteLoading(true);
    try {
      await onDelete(downloadUrl);
    } finally {
      setDeleteLoading(false);
    }
  }, [onDelete, downloadUrl, deleteLoading]);

  const waHref = `https://wa.me/?text=${encodeURIComponent(shareLink)}`;
  const tgHref = `https://t.me/share/url?url=${encodeURIComponent(shareLink)}&text=${encodeURIComponent('Flipo5')}`;
  const xHref = `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareLink)}`;
  const mailHref = `mailto:?subject=${encodeURIComponent('Flipo5')}&body=${encodeURIComponent(shareLink)}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t(locale, 'image.viewer')}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 bg-theme-bg-overlay backdrop-blur-md"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative z-10 flex flex-col w-full max-w-4xl max-h-[90vh] min-h-0">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3 shrink-0">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] rounded-full bg-theme-bg-hover hover:bg-theme-bg-hover-strong flex items-center justify-center text-theme-fg transition-colors"
            aria-label="Close"
          >
            <XIcon className="w-5 h-5" />
          </button>
          <div className="flex flex-wrap items-center gap-2">
            {onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteLoading}
                className="min-h-[44px] min-w-[44px] rounded-full bg-theme-danger-muted text-theme-danger hover:bg-theme-danger-muted/80 transition-colors flex items-center justify-center disabled:opacity-60 touch-manipulation"
                aria-label="Delete"
                title="Delete"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={handleEditInStudio}
              disabled={editLoading}
              className="min-h-[44px] min-w-[44px] rounded-full bg-theme-accent-muted text-theme-accent hover:bg-theme-accent-hover transition-colors flex items-center justify-center disabled:opacity-60 touch-manipulation"
              aria-label={t(locale, 'image.editInStudio')}
              title={t(locale, 'image.editInStudio')}
            >
              {editLoading ? <SpinnerIcon className="w-4 h-4" /> : <EditIcon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saveLoading}
              className="min-h-[44px] min-w-[44px] rounded-full bg-theme-bg-hover-strong hover:bg-theme-bg-hover-stronger text-theme-fg transition-colors flex items-center justify-center touch-manipulation disabled:opacity-60"
              aria-label={t(locale, 'image.save')}
              title={t(locale, 'image.save')}
            >
              {saveLoading ? <SpinnerIcon className="w-4 h-4" /> : <DownloadIcon className="w-4 h-4" />}
            </button>
            <div className="relative" ref={shareWrapRef}>
              <button
                type="button"
                onClick={() => setShareMenuOpen((o) => !o)}
                className={`min-h-[44px] min-w-[44px] rounded-full transition-colors flex items-center justify-center touch-manipulation ${
                  shareMenuOpen ? 'bg-theme-accent-muted text-theme-accent' : 'bg-theme-bg-hover-strong hover:bg-theme-bg-hover-stronger text-theme-fg'
                }`}
                aria-label={t(locale, 'image.share')}
                title={t(locale, 'image.share')}
                aria-expanded={shareMenuOpen}
                aria-haspopup="menu"
              >
                <ShareIcon className="w-4 h-4" />
              </button>
              {shareMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-[calc(100%+6px)] z-[60] flex flex-col items-stretch rounded-xl border border-theme-border bg-theme-bg-elevated py-1 shadow-lg min-w-[48px]"
                >
                  <button
                    type="button"
                    role="menuitem"
                    disabled={nativeShareBusy}
                    onClick={() => void handleNativeShare()}
                    className="flex h-11 w-11 items-center justify-center text-theme-fg hover:bg-theme-bg-hover disabled:opacity-50 mx-auto"
                    title={t(locale, 'image.shareMenuDevice')}
                    aria-label={t(locale, 'image.shareMenuDevice')}
                  >
                    {nativeShareBusy ? <SpinnerIcon className="w-4 h-4" /> : <DeviceShareIcon className="w-5 h-5" />}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleCopyShareLink()}
                    className="flex h-11 w-11 items-center justify-center text-theme-fg hover:bg-theme-bg-hover mx-auto"
                    title={t(locale, 'image.shareMenuCopy')}
                    aria-label={t(locale, 'image.shareMenuCopy')}
                  >
                    <LinkIcon className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openSocial(waHref)}
                    className="flex h-11 w-11 items-center justify-center text-theme-fg hover:bg-theme-bg-hover mx-auto"
                    title={t(locale, 'image.shareMenuWhatsApp')}
                    aria-label={t(locale, 'image.shareMenuWhatsApp')}
                  >
                    <WhatsAppIcon className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openSocial(tgHref)}
                    className="flex h-11 w-11 items-center justify-center text-theme-fg hover:bg-theme-bg-hover mx-auto"
                    title={t(locale, 'image.shareMenuTelegram')}
                    aria-label={t(locale, 'image.shareMenuTelegram')}
                  >
                    <TelegramIcon className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openSocial(xHref)}
                    className="flex h-11 w-11 items-center justify-center text-theme-fg hover:bg-theme-bg-hover mx-auto"
                    title={t(locale, 'image.shareMenuX')}
                    aria-label={t(locale, 'image.shareMenuX')}
                  >
                    <XSocialIcon className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openSocial(mailHref)}
                    className="flex h-11 w-11 items-center justify-center text-theme-fg hover:bg-theme-bg-hover mx-auto"
                    title={t(locale, 'image.shareMenuEmail')}
                    aria-label={t(locale, 'image.shareMenuEmail')}
                  >
                    <MailIcon className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="rounded-xl overflow-hidden bg-theme-bg-overlay flex-1 min-h-0 flex items-center justify-center relative">
          {hasPrev && (
            <button
              type="button"
              onClick={() => setIdx((i) => i - 1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] rounded-full bg-theme-bg-hover-strong hover:bg-theme-bg-hover-stronger flex items-center justify-center text-theme-fg z-10"
              aria-label="Previous"
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </button>
          )}
          {isVideo ? (
            <VideoPlayer src={currentUrl} className="max-w-full max-h-[calc(90vh-80px)]" autoPlay />
          ) : (
            <img src={currentUrl} alt="" className="max-w-full max-h-[calc(90vh-80px)] object-contain" decoding="async" />
          )}
          {hasNext && (
            <button
              type="button"
              onClick={() => setIdx((i) => i + 1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] rounded-full bg-theme-bg-hover-strong hover:bg-theme-bg-hover-stronger flex items-center justify-center text-theme-fg z-10"
              aria-label="Next"
            >
              <ChevronRightIcon className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className ?? ''}`} fill="none" viewBox="0 0 24 24" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}
function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}
function ShareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
    </svg>
  );
}

function LinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m4.95-4.95 1.757-1.757a4.5 4.5 0 016.364 6.364l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757" />
    </svg>
  );
}

function DeviceShareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
      />
    </svg>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

function XSocialIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  );
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673A2.25 2.25 0 0 1 15.916 21.75H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0V4.875c0-1.035-.84-1.875-1.875-1.875h-3.75c-1.035 0-1.875.84-1.875 1.875v.518" />
    </svg>
  );
}
