'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';

type Props = {
  open: boolean;
  title: string;
  message: string;
  profileLabel: string;
  onClose: () => void;
};

export function ArchivedDialog({ open, title, message, profileLabel, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-theme-bg-overlay"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative w-full max-w-md rounded-2xl border border-theme-border bg-theme-bg-elevated p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-theme-fg-subtle hover:text-theme-fg hover:bg-theme-bg-hover transition-colors"
          aria-label="Close"
        >
          <XIcon className="w-5 h-5" />
        </button>
        <h3 className="font-display text-lg font-bold text-theme-fg mb-2 pr-8">{title}</h3>
        <p className="text-sm text-theme-fg-muted mb-6">{message}</p>
        <Link
          href="/dashboard/profile?fromArchive=1"
          onClick={onClose}
          className="block w-full text-center min-h-[44px] flex items-center justify-center py-3 rounded-xl text-sm font-medium bg-theme-bg-hover text-theme-fg hover:bg-theme-bg-hover-strong transition-colors"
        >
          {profileLabel}
        </Link>
      </motion.div>
    </div>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
