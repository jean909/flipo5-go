'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';
import type { Thread } from '@/lib/api';
import type { Locale } from '@/lib/i18n';

const GENERIC_TITLES = new Set(['user', 'ai', 'greeting', 'hello', 'hi', 'chat', 'conversation', 'untitled']);

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function displayTitle(thread: Thread, untitled: string): string {
  const title = thread.title?.trim();
  if (!title || title.length <= 3) return untitled;
  if (GENERIC_TITLES.has(title.toLowerCase())) return untitled;
  return title;
}

type Props = {
  thread: Thread;
  locale: Locale;
  isActive?: boolean;
  compact?: boolean;
  card?: boolean;
  openMenuThreadId: string | null;
  onContextMenuOpen: (id: string | null) => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onDelete?: () => void;
  onDeleteRequest?: (thread: Thread) => void;
  showArchive?: boolean;
  showUnarchive?: boolean;
  showDelete?: boolean;
};

export function ThreadItem({
  thread,
  locale,
  isActive,
  compact,
  card,
  openMenuThreadId,
  onContextMenuOpen,
  onArchive,
  onUnarchive,
  onDelete,
  onDeleteRequest,
  showArchive = true,
  showUnarchive = false,
  showDelete = true,
}: Props) {
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const menuOpen = openMenuThreadId === thread.id;

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setMenuPos({ x: e.clientX, y: e.clientY });
      onContextMenuOpen(thread.id);
    },
    [thread.id, onContextMenuOpen]
  );

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => onContextMenuOpen(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [menuOpen, onContextMenuOpen]);

  const content = (
    <>
      <span className={`block truncate ${compact ? 'text-sm font-medium' : 'text-white font-medium'}`}>
        {displayTitle(thread, t(locale, 'sessions.untitled'))}
      </span>
      <span className={`block truncate mt-0.5 ${compact ? 'text-xs text-neutral-500' : 'text-sm text-neutral-400'}`}>
        {formatDate(thread.updated_at)}
      </span>
    </>
  );

  const linkCls = card
    ? 'block rounded-xl border border-white/20 bg-white/5 p-4 hover:bg-white/10 hover:border-white/30 transition-all'
    : isActive
      ? 'block px-2 py-2 rounded transition-colors bg-neutral-700 text-white'
      : compact
        ? 'block px-2 py-2 rounded transition-colors text-neutral-400 hover:bg-neutral-800 hover:text-white'
        : 'block px-2 py-2 rounded transition-colors text-white hover:bg-white/10';

  return (
    <div className="relative" onContextMenu={handleContextMenu}>
      <Link href={`/dashboard?thread=${thread.id}`} className={linkCls}>
        {content}
      </Link>
      {menuOpen && (
        <div
          className="fixed z-50 min-w-[140px] rounded-lg border border-white/20 bg-neutral-900 py-1 shadow-xl"
          style={{ left: menuPos.x, top: menuPos.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {showArchive && onArchive && (
            <button
              type="button"
              onClick={() => {
                onContextMenuOpen(null);
                onArchive();
              }}
              className="w-full px-3 py-2 text-left text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white"
            >
              {t(locale, 'thread.archive')}
            </button>
          )}
          {showUnarchive && onUnarchive && (
            <button
              type="button"
              onClick={() => {
                onContextMenuOpen(null);
                onUnarchive();
              }}
              className="w-full px-3 py-2 text-left text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white"
            >
              {t(locale, 'thread.unarchive')}
            </button>
          )}
          {showDelete && (onDelete || onDeleteRequest) && (
            <button
              type="button"
              onClick={() => {
                onContextMenuOpen(null);
                onDeleteRequest ? onDeleteRequest(thread) : onDelete?.();
              }}
              className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-neutral-800 hover:text-red-300"
            >
              {t(locale, 'thread.delete')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
