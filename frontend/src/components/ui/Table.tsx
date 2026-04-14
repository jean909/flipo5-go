import type { HTMLAttributes, TableHTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type DivProps = HTMLAttributes<HTMLDivElement>;
type TableProps = TableHTMLAttributes<HTMLTableElement>;
type ThProps = ThHTMLAttributes<HTMLTableCellElement>;
type TdProps = TdHTMLAttributes<HTMLTableCellElement>;

export function TableShell({ className, ...props }: DivProps) {
  return <div className={cn('overflow-x-auto', className)} {...props} />;
}

export function Table({ className, ...props }: TableProps) {
  return <table className={cn('w-full text-left text-sm', className)} {...props} />;
}

export function TableHeadRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('border-b border-theme-border bg-theme-bg-hover', className)} {...props} />;
}

export function TableBodyRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('border-b border-theme-border-subtle hover:bg-theme-bg-hover/50', className)} {...props} />;
}

export function Th({ className, ...props }: ThProps) {
  return <th className={cn('px-4 py-3 font-medium text-theme-fg', className)} {...props} />;
}

export function Td({ className, ...props }: TdProps) {
  return <td className={cn('px-4 py-3', className)} {...props} />;
}
