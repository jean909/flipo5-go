'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  confirmClass?: string;
  onConfirm: () => void;
  onCancel: () => void;
  customContent?: React.ReactNode;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  confirmClass = 'bg-theme-danger-muted text-theme-danger hover:bg-theme-danger-muted',
  onConfirm,
  onCancel,
  customContent,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onConfirm, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-theme-bg-overlay"
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="w-full max-w-md rounded-2xl border border-theme-border bg-theme-bg-elevated p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-lg font-bold text-theme-fg mb-2">{title}</h3>
        {message && <p className="text-sm text-theme-fg-muted mb-6">{message}</p>}
        {customContent}
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-theme-fg-muted hover:text-theme-fg hover:bg-theme-bg-hover transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
