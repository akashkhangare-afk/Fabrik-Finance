import { cn } from "@/lib/cn";

/** Fabrik mark: field rows rising into an F — land, growth, and the ledger's lines. */
export function LogoMark({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#17573c" />
      <path d="M9 24V8.5h13.5" stroke="#e9f4ee" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M9 15.5h9.5" stroke="#e9f4ee" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M15 24c1.6-2.2 3.6-3.4 6-3.6M19.5 24c1.2-1.4 2.6-2.2 4-2.4" stroke="#86bc9e" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Wordmark({ className, collapsed }: { className?: string; collapsed?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      {!collapsed && (
        <div className="leading-none">
          <div className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Fabrik Finance</div>
          <div className="text-[11px] text-muted mt-1">AI Finance for Land &amp; Agriculture</div>
        </div>
      )}
    </div>
  );
}
