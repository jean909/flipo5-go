'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
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
  onRename?: (thread: Thread, title: string) => Promise<void> | void;
  showArchive?: boolean;
  showUnarchive?: boolean;
  showDelete?: boolean;
  showRename?: boolean;
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
  onRename,
  showArchive = true,
  showUnarchive = false,
  showDelete = true,
  showRename = true,
}: Props) {
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
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

  useEffect(() => {
    if (renaming) inputRef.current?.focus();
  }, [renaming]);

  const startRename = () => {
    onContextMenuOpen(null);
    setRenameValue(displayTitle(thread, t(locale, 'sessions.untitled')));
    setRenaming(true);
  };

  const commitRename = async () => {
    const next = renameValue.trim();
    if (!next || !onRename) {
      setRenaming(false);
      return;
    }
    if (next === (thread.title?.trim() || '')) {
      setRenaming(false);
      return;
    }
    setRenameSaving(true);
    try {
      await onRename(thread, next);
      setRenaming(false);
    } finally {
      setRenameSaving(false);
    }
  };

  const content = (
    <>
      <span className={`block truncate ${compact ? 'text-sm font-medium' : 'text-theme-fg font-medium'}`}>
        {displayTitle(thread, t(locale, 'sessions.untitled'))}
      </span>
      <span className={`block truncate mt-0.5 ${compact ? 'text-xs text-theme-fg-subtle' : 'text-sm text-theme-fg-muted'}`}>
        {formatDate(thread.updated_at)}
      </span>
    </>
  );

  const linkCls = card
    ? 'block min-h-[44px] rounded-xl border border-theme-border bg-theme-bg-subtle p-4 hover:bg-theme-bg-hover hover:border-theme-border-hover transition-all'
    : isActive
      ? 'block px-2 py-2 rounded transition-colors bg-theme-bg-elevated text-theme-fg'
      : compact
        ? 'block px-2 py-2 rounded transition-colors text-theme-fg-muted hover:bg-theme-bg-elevated hover:text-theme-fg'
        : 'block px-2 py-2 rounded transition-colors text-theme-fg hover:bg-theme-bg-hover';

  if (renaming) {
    return (
      <div className={card ? 'rounded-xl border border-theme-border bg-theme-bg-subtle p-3' : 'px-2 py-1.5'}>
        <input
          ref={inputRef}
          value={renameValue}
          disabled={renameSaving}
          maxLength={80}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void commitRename();
            }
            if (e.key === 'Escape') setRenaming(false);
          }}
          onBlur={() => { void commitRename(); }}
          className="w-full rounded-lg border border-theme-border bg-theme-bg-elevated px-2 py-1.5 text-sm text-theme-fg outline-none focus:border-theme-accent"
          aria-label={t(locale, 'thread.rename')}
        />
      </div>
    );
  }

  return (
    <div className="relative" onContextMenu={handleContextMenu}>
      <Link href={`/dashboard?thread=${thread.id}`} className={linkCls}>
        {content}
      </Link>
      {menuOpen && (
        <div
          className="fixed z-50 min-w-[140px] rounded-lg border border-theme-border bg-theme-bg-elevated py-1 shadow-xl"
          style={{ left: menuPos.x, top: menuPos.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {showRename && onRename && (
            <button
              type="button"
              onClick={startRename}
              className="w-full px-3 py-2 text-left text-sm text-theme-fg-muted hover:bg-theme-bg-hover hover:text-theme-fg"
            >
              {t(locale, 'thread.rename')}
            </button>
          )}
          {showArchive && onArchive && (
            <button
              type="button"
              onClick={() => {
                onContextMenuOpen(null);
                onArchive();
              }}
              className="w-full px-3 py-2 text-left text-sm text-theme-fg-muted hover:bg-theme-bg-hover hover:text-theme-fg"
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
              className="w-full px-3 py-2 text-left text-sm text-theme-fg-muted hover:bg-theme-bg-hover hover:text-theme-fg"
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
              className="w-full px-3 py-2 text-left text-sm text-theme-danger hover:bg-theme-bg-hover hover:text-theme-danger"
            >
              {t(locale, 'thread.delete')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
