/** Minimal nav placeholder while Header chunk (framer-motion) loads. */
export function HomeHeaderSkeleton() {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 sm:px-6 py-4 min-h-[56px] [padding-top:max(1rem,env(safe-area-inset-top))]"
      aria-hidden
    >
      <div className="h-5 w-20 rounded bg-white/10 animate-pulse-subtle" />
      <div className="h-9 w-24 rounded-full bg-white/10 animate-pulse-subtle" />
    </header>
  );
}
