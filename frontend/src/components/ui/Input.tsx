import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        'w-full rounded-lg border border-theme-border bg-theme-bg-subtle px-3 py-2 text-sm text-theme-fg placeholder:text-theme-fg-subtle',
        'focus:outline-none focus:ring-2 focus:ring-theme-accent',
        className
      )}
      {...props}
    />
  );
}
