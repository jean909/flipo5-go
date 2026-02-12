'use client';

import { useState, useRef, useEffect } from 'react';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}

interface SelectProps<T extends string = string> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  className?: string;
  size?: 'sm' | 'md';
}

export function Select<T extends string = string>({
  value,
  options,
  onChange,
  placeholder,
  className = '',
  size = 'md',
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    setOpenUp(spaceBelow < 180 && spaceAbove > spaceBelow);
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const px = size === 'sm' ? 'px-3' : 'px-4';
  const py = size === 'sm' ? 'py-1.5' : 'py-2.5';

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full ${px} ${py} rounded-lg border border-theme-border bg-theme-bg-subtle text-left text-theme-fg text-sm flex items-center justify-between gap-2 hover:bg-theme-bg-hover hover:border-theme-border-hover focus:outline-none focus:ring-1 focus:ring-theme-border-strong focus:border-theme-border-strong transition-colors ${open ? 'border-theme-border-strong bg-theme-bg-hover' : ''}`}
      >
        <span className={selected ? 'text-theme-fg' : 'text-theme-fg-subtle'}>{selected?.label ?? placeholder ?? '—'}</span>
        <svg className={`w-4 h-4 shrink-0 text-theme-fg-muted transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div
          className={`absolute left-0 right-0 z-50 max-h-36 overflow-y-auto rounded-lg border border-theme-border bg-theme-bg-elevated shadow-xl scrollbar-subtle ${
            openUp ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value as T);
                setOpen(false);
              }}
              className={`w-full ${px} ${py} text-left text-sm transition-colors ${
                opt.value === value
                  ? 'bg-theme-bg-hover-strong text-theme-fg'
                  : 'text-theme-fg-muted hover:bg-theme-bg-hover hover:text-theme-fg'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
