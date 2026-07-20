export default function SkeletonCard({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="animate-rise-in rounded-2xl border border-border-subtle bg-surface p-4"
      style={{ animationDelay: `${delay}ms`, boxShadow: "var(--shadow-sm)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="animate-shimmer h-4 w-2/5 rounded-md" />
        <div className="animate-shimmer h-4 w-16 rounded-full" />
      </div>
      <div className="mt-3 space-y-1.5">
        <div className="animate-shimmer h-3 w-full rounded" />
        <div className="animate-shimmer h-3 w-4/5 rounded" />
      </div>
      <div className="animate-shimmer mt-3 h-12 w-full rounded-lg" />
    </div>
  );
}
