import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-theme-accent text-black hover:opacity-90',
  secondary: 'border border-theme-border bg-theme-bg-hover text-theme-fg hover:bg-theme-bg-hover-strong',
  ghost: 'text-theme-fg-muted hover:text-theme-fg hover:bg-theme-bg-hover',
  danger: 'bg-theme-danger-muted text-theme-danger hover:bg-theme-danger-muted/80',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-4 py-2 text-sm rounded-xl',
};

type ButtonClassNameOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
};

export function buttonClassName({
  variant = 'secondary',
  size = 'md',
  className,
}: ButtonClassNameOptions = {}) {
  return cn(
    'min-h-[40px] font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none touch-manipulation',
    variantClasses[variant],
    sizeClasses[size],
    className
  );
}

export function Button({
  className,
  variant = 'secondary',
  size = 'md',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClassName({ variant, size, className })}
      {...props}
    />
  );
}
