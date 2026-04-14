import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: 'neutral' | 'accent' | 'success' | 'danger';
};

const variantClasses: Record<NonNullable<BadgeProps['variant']>, string> = {
  neutral: 'bg-theme-bg-hover text-theme-fg',
  accent: 'bg-theme-accent-muted text-theme-accent',
  success: 'bg-theme-success-muted text-theme-success',
  danger: 'bg-theme-danger-muted text-theme-danger',
};

export function Badge({ className, variant = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm',
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}
