"use client";

import { cn } from "@/lib/cn";

export function Switch({ checked, onChange, disabled, label, id }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-brand-600" : "bg-line-strong",
      )}
    >
      <span className={cn("inline-block size-4 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,.2)] transition-transform", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
    </button>
  );
}
