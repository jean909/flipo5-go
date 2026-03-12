'use client';

/** Lightweight loading skeleton for lazy-loaded dashboard pages. Keeps layout stable and avoids CLS. */
export function DashboardPageSkeleton() {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="h-7 w-48 rounded-lg bg-theme-fg/10" />
        <div className="h-4 w-full max-w-md rounded bg-theme-fg/5" />
        <div className="h-4 w-2/3 rounded bg-theme-fg/5" />
        <div className="pt-4 flex gap-2">
          <div className="h-10 w-24 rounded-xl bg-theme-fg/10" />
          <div className="h-10 w-32 rounded-xl bg-theme-fg/10" />
        </div>
        <div className="h-32 rounded-xl bg-theme-fg/5 mt-6" />
      </div>
    </div>
  );
}
