import { Skeleton } from "@/components/ui/primitives";

// Shown the moment a link is clicked while the next page renders on the server.
export default function Loading() {
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-8 w-56 mb-8" />
      <Skeleton className="h-64" />
    </div>
  );
}
