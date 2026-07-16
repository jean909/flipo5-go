/** Placeholder while framer-motion sections chunk loads — reduces CLS. */
export function HomeBelowFoldSkeleton() {
  return (
    <div className="animate-pulse-subtle" aria-hidden>
      <div className="py-24 sm:py-32 lg:py-40 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 min-h-[280px]">
          <div className="rounded-3xl bg-white/5 min-h-[240px]" />
          <div className="space-y-4 pt-8">
            <div className="h-3 w-24 bg-white/10 rounded" />
            <div className="h-10 w-full max-w-md bg-white/10 rounded" />
            <div className="h-10 w-3/4 max-w-sm bg-white/10 rounded" />
          </div>
        </div>
      </div>
      <div className="py-16 sm:py-24 px-4 max-w-6xl mx-auto space-y-6">
        <div className="h-8 w-48 bg-white/10 rounded" />
        <div className="h-24 w-full max-w-2xl bg-white/5 rounded" />
      </div>
    </div>
  );
}
