import { Skeleton } from "@/components/ui/primitives";

// Shown the moment a link is clicked while the next page renders on the server.
// Shaped like a typical page (title, figures, content) so the layout doesn't jump when it arrives.
export default function Loading() {
  return (
    <div aria-busy="true" className="animate-in">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-9 w-60 mb-8" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-7 w-28 mt-3" />
          </div>
        ))}
      </div>
      <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] space-y-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-11/12" />
        <Skeleton className="h-3.5 w-4/5" />
        <Skeleton className="h-40 w-full mt-2" />
      </div>
    </div>
  );
}
