'use client';

import { useRef, useState } from 'react';
import { uploadAttachments } from '@/lib/api';
import { getMediaDisplayUrl } from '@/lib/api';
import { t } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { ELEMENTS_LIBRARY } from './elementsLibrary';

export interface SavedLogo { id: string; url: string; name: string }

interface LogoDialogProps {
  open: boolean;
  onClose: () => void;
  onSelectLogo: (url: string, name: string) => void;
  mediaToken: string | null;
  locale: Locale;
  savedLogos: SavedLogo[];
  onSaveLogo: (logo: SavedLogo) => void;
}

export function LogoDialog({
  open,
  onClose,
  onSelectLogo,
  mediaToken,
  locale,
  savedLogos,
  onSaveLogo,
}: LogoDialogProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const urls = await uploadAttachments([file]);
      const url = urls[0];
      if (url) {
        const newLogo: SavedLogo = { id: crypto.randomUUID(), url, name: file.name };
        onSaveLogo(newLogo);
        onSelectLogo(url, file.name);
        onClose();
      }
    } catch (err) {
      setError((err as Error)?.message ?? 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handlePick = (url: string, name: string) => {
    onSelectLogo(url, name);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div
        className="bg-theme-bg border border-theme-border rounded-xl shadow-xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-theme-border shrink-0">
          <h2 className="text-lg font-semibold text-theme-fg">{t(locale, 'studio.elementsDialogTitle')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-theme-bg-hover text-theme-fg"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-4 space-y-4">
          {error && (
            <p className="text-sm text-theme-danger">{error}</p>
          )}

          {/* Library: built-in icons */}
          <section>
            <p className="text-xs font-medium text-theme-fg-muted mb-2">{t(locale, 'studio.library')}</p>
            <div className="flex flex-wrap gap-2">
              {ELEMENTS_LIBRARY.map((el) => (
                <button
                  key={el.id}
                  type="button"
                  onClick={() => handlePick(el.url, el.name)}
                  className="w-14 h-14 rounded-lg border border-theme-border overflow-hidden bg-theme-bg-subtle hover:border-theme-accent flex-shrink-0 p-2"
                  title={el.name}
                >
                  <img src={el.url} alt={el.name} className="w-full h-full object-contain" />
                </button>
              ))}
            </div>
          </section>

          {/* Uploaded: user uploads */}
          <section>
            <p className="text-xs font-medium text-theme-fg-muted mb-2">{t(locale, 'studio.uploaded')}</p>
            <input
              id="elements-upload-input"
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleUpload}
            />
            <label
              htmlFor="elements-upload-input"
              className={`mb-2 inline-block px-3 py-2 rounded-lg border border-theme-border bg-theme-bg-hover text-theme-fg text-sm font-medium cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : 'hover:bg-theme-bg-hover-strong'}`}
            >
              {uploading ? 'Uploading…' : t(locale, 'studio.uploadLogo')}
            </label>
            <div className="flex flex-wrap gap-2">
              {savedLogos.map((logo) => (
                <button
                  key={logo.id}
                  type="button"
                  onClick={() => handlePick(logo.url, logo.name)}
                  className="w-14 h-14 rounded-lg border border-theme-border overflow-hidden bg-theme-bg-hover hover:border-theme-accent flex-shrink-0"
                >
                  <img src={getMediaDisplayUrl(logo.url, mediaToken) || logo.url} alt={logo.name} className="w-full h-full object-contain" />
                </button>
              ))}
              {savedLogos.length === 0 && (
                <p className="text-sm text-theme-fg-subtle">{t(locale, 'studio.myLogos')}</p>
              )}
            </div>
          </section>

          <p className="text-xs text-theme-fg-subtle">{t(locale, 'studio.logoDragResize')}</p>
        </div>
      </div>
    </div>
  );
}
