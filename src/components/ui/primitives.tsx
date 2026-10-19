import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { money, moneyCompact } from "@/lib/format";

// ─── Buttons ────────────────────────────────────────────────────────────────

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle" | "ai";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-700 text-white shadow-[var(--shadow-inset),0_2px_6px_-1px_rgba(28,34,48,.28)] hover:bg-brand-800 hover:shadow-[var(--shadow-inset),0_6px_14px_-4px_rgba(28,34,48,.35)] disabled:bg-brand-300 disabled:shadow-none",
  secondary: "bg-surface text-ink border border-line-strong hover:border-brand-300 hover:bg-surface-2 disabled:text-subtle",
  ghost: "text-ink-2 hover:bg-sunken hover:text-ink disabled:text-subtle",
  subtle: "bg-sunken text-ink-2 hover:bg-line hover:text-ink disabled:text-subtle",
  danger: "bg-crit-600 text-white shadow-[var(--shadow-inset),0_2px_6px_-1px_rgba(155,34,34,.3)] hover:bg-crit-700 disabled:opacity-50",
  ai: "bg-ai-600 text-white shadow-[var(--shadow-inset),0_2px_6px_-1px_rgba(52,92,153,.3)] hover:bg-ai-700 disabled:opacity-50",
};
const SIZES: Record<Size, string> = {
  sm: "h-8 px-3.5 text-[13px] gap-1.5 rounded-full",
  md: "h-10 px-4 text-sm gap-2 rounded-full",
  lg: "h-12 px-6 text-[15px] gap-2 rounded-full",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", extra?: string) {
  return cn(
    "inline-flex items-center justify-center font-medium whitespace-nowrap select-none transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out active:translate-y-px active:scale-[.985] disabled:cursor-not-allowed disabled:active:translate-y-0 disabled:active:scale-100 [&_svg]:shrink-0",
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

export function Button({ variant = "secondary", size = "md", className, ...props }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type="button" className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({ variant = "secondary", size = "md", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

// ─── Surfaces ──────────────────────────────────────────────────────────────

export function Card({ className, children, ...props }: ComponentProps<"section">) {
  return (
    <section className={cn("bg-surface border border-white rounded-[var(--radius-card)] shadow-[var(--shadow-card)]", className)} {...props}>
      {children}
    </section>
  );
}

export function CardHeader({ title, subtitle, action, icon, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-5 pt-5 pb-3", className)}>
      <div className="min-w-0 flex items-start gap-3">
        {icon && <div className="size-9 rounded-xl bg-sunken text-ink-2 flex items-center justify-center shrink-0 [&_svg]:size-[18px]">{icon}</div>}
        <div className="min-w-0">
          <h2 className="text-[17px] font-medium text-ink leading-7 tracking-[-0.015em]">{title}</h2>
          {subtitle && <p className="text-[13px] text-muted mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow, badge }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode; badge?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-7">
      <div className="min-w-0">
        {eyebrow && <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted mb-2 [&_a]:hover:text-ink [&_a]:transition-colors">{eyebrow}</div>}
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-[28px] sm:text-[34px] leading-tight font-normal tracking-[-0.03em] text-ink">{title}</h1>
          {badge}
        </div>
        {description && <p className="text-[14px] text-muted mt-2 max-w-2xl leading-relaxed">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </header>
  );
}

// ─── Tabs ──────────────────────────────────────────────────────────────────

/** Underlined page-level tabs that navigate (each tab is a URL). Scrolls with faded edges on narrow screens. */
export function PageTabs({ tabs, label, className }: { tabs: { href: string; label: ReactNode; active: boolean; count?: number }[]; label?: string; className?: string }) {
  return (
    <div className={cn("relative mb-6 border-b border-line-strong/70", className)}>
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar scroll-fade-x -mb-px" role="tablist" aria-label={label}>
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            role="tab"
            aria-selected={t.active}
            className={cn(
              "group relative h-11 px-3 inline-flex items-center gap-2 text-[13.5px] font-medium whitespace-nowrap rounded-t-lg transition-colors",
              t.active ? "text-ink" : "text-muted hover:text-ink",
            )}
          >
            {t.label}
            {t.count != null && t.count > 0 && <span className={cn("min-w-5 h-5 px-1.5 rounded-full text-[11px] font-semibold tabular flex items-center justify-center transition-colors", t.active ? "bg-accent-600 text-white" : "bg-surface text-ink-2 ring-1 ring-inset ring-line group-hover:ring-line-strong")}>{t.count}</span>}
            <span className={cn("absolute inset-x-3 bottom-0 h-[2px] rounded-full transition-all duration-200", t.active ? "bg-brand-700 opacity-100" : "bg-line-strong opacity-0 group-hover:opacity-100")} aria-hidden />
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Segmented filter pills (status, type). Use with buttons or links inside a `pillListClass` container. */
export const pillListClass = "inline-flex max-w-full items-center gap-1 rounded-full bg-surface p-1 ring-1 ring-inset ring-line overflow-x-auto no-scrollbar";
export function pillClass(on: boolean) {
  return cn(
    "h-8 px-3.5 rounded-full text-[13px] font-medium whitespace-nowrap inline-flex items-center gap-1.5 transition-[background-color,color,box-shadow] duration-150",
    on ? "bg-brand-700 text-white shadow-[0_2px_6px_-1px_rgba(28,34,48,.3)]" : "text-muted hover:text-ink hover:bg-sunken",
  );
}
export function pillCountClass(on: boolean) {
  return cn("text-[11.5px] tabular font-semibold", on ? "text-white/70" : "text-subtle");
}

// ─── Badges & status ───────────────────────────────────────────────────────

export type Tone = "neutral" | "brand" | "ok" | "warn" | "risk" | "crit" | "info" | "ai";
const TONES: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-2 ring-line",
  brand: "bg-brand-700 text-white ring-brand-700",
  ok: "bg-ok-50 text-ok-600 ring-ok-100",
  warn: "bg-warn-50 text-warn-700 ring-warn-100",
  risk: "bg-risk-50 text-risk-600 ring-risk-100",
  crit: "bg-crit-50 text-crit-600 ring-crit-100",
  info: "bg-info-50 text-info-600 ring-info-100",
  ai: "bg-ai-50 text-ai-600 ring-ai-100",
};
const DOTS: Record<Tone, string> = { neutral: "bg-subtle", brand: "bg-white/80", ok: "bg-ok-600", warn: "bg-warn-500", risk: "bg-risk-600", crit: "bg-crit-600", info: "bg-info-600", ai: "bg-ai-500" };

export function Badge({ tone = "neutral", children, dot, className, title }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1.5 h-[22px] px-2.5 rounded-full text-[12px] font-medium ring-1 ring-inset whitespace-nowrap", TONES[tone], className)}>
      {dot && <span className={cn("size-1.5 rounded-full", DOTS[tone])} aria-hidden />}
      {children}
    </span>
  );
}

const STATUS: Record<string, [Tone, string]> = {
  processed: ["ok", "Processed"],
  approved: ["info", "Approved"],
  needs_review: ["warn", "Needs review"],
  waiting_for_client: ["info", "Waiting for client"],
  excluded: ["neutral", "Excluded"],
  received: ["neutral", "Received"],
  processing: ["info", "Processing"],
  rejected: ["crit", "Rejected"],
  paid: ["ok", "Paid"],
  open: ["neutral", "Open"],
  in_progress: ["info", "In progress"],
  in_review: ["warn", "In review"],
  closed: ["ok", "Closed"],
  ready_for_review: ["warn", "Ready for review"],
  not_started: ["neutral", "Not started"],
  extracted: ["ai", "Extracted"],
  matched: ["ok", "Matched"],
  uploaded: ["neutral", "Stored"],
  failed: ["crit", "Failed"],
  connected: ["ok", "Connected"],
  error: ["crit", "Needs attention"],
  disconnected: ["neutral", "Disconnected"],
  success: ["ok", "Success"],
  partial: ["warn", "Partial"],
  running: ["info", "Running"],
  current: ["ok", "Current"],
  overdue_1_30: ["warn", "1–30 days late"],
  overdue_31_60: ["risk", "31–60 days late"],
  overdue_60_plus: ["crit", "60+ days late"],
  requested: ["neutral", "Requested"],
  cpa_reviewed: ["info", "CPA reviewed"],
  client_approved: ["info", "Client approved"],
  filed: ["ok", "Filed (by CPA)"],
  upcoming: ["neutral", "Upcoming"],
  waiting_on_client: ["info", "Waiting on client"],
  done: ["ok", "Done"],
  at_risk: ["crit", "At risk"],
  needs_attention: ["warn", "Needs attention"],
};

export function StatusPill({ status, label }: { status: string; label?: string }) {
  const [tone, text] = STATUS[status] ?? ["neutral", status.replace(/_/g, " ")];
  return (
    <Badge tone={tone} dot>
      {label ?? text}
    </Badge>
  );
}

/** Marks AI-generated content so it's never confused with verified data. */
export function AiBadge({ label = "AI suggestion", className }: { label?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 h-[22px] px-2.5 rounded-full text-[12px] font-medium bg-ai-50 text-ai-600 ring-1 ring-inset ring-ai-100", className)}>
      <Sparkles className="size-3" aria-hidden />
      {label}
    </span>
  );
}

export function ConfidenceBadge({ value, thresholds = { autoApprove: 0.98, review: 0.85 } }: { value: number; thresholds?: { autoApprove: number; review: number } }) {
  const tone: Tone = value >= thresholds.autoApprove ? "ok" : value >= thresholds.review ? "warn" : "risk";
  return (
    <Badge tone={tone} className="tabular" title={value >= thresholds.autoApprove ? "Eligible for automatic processing" : value >= thresholds.review ? "Bookkeeper review" : "Review or client clarification"}>
      {Math.round(value * 100)}%
    </Badge>
  );
}

/** Requirement classification (A = PRD-confirmed, B = proposed Fondo-inspired, C = future/restricted). */
export function ClassBadge({ cls, compact }: { cls: "A" | "B" | "C"; compact?: boolean }) {
  const map = { A: ["brand", "PRD"], B: ["ai", "Proposed"], C: ["neutral", "Future"] } as const;
  const [tone, label] = map[cls];
  return (
    <Badge tone={tone} title={cls === "A" ? "PRD-confirmed requirement" : cls === "B" ? "Proposed Fondo-inspired addition — not in the Expo MVP PRD" : "Future or restricted capability"}>
      {compact ? cls : `${cls} · ${label}`}
    </Badge>
  );
}

// ─── Numbers ───────────────────────────────────────────────────────────────

export function Money({ cents, decimals, compact, sign, className }: { cents: number; decimals?: boolean; compact?: boolean; sign?: boolean; className?: string }) {
  return <span className={cn("tabular", cents < 0 && "text-ink", className)}>{compact ? moneyCompact(cents) : money(cents, { decimals, sign })}</span>;
}

export function KpiCard({ label, value, href, hint, className, children }: { label: string; value: ReactNode; href?: string; hint?: ReactNode; className?: string; children?: ReactNode }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="text-[13px] text-muted leading-5">{label}</div>
        {href && (
          <span className="-mt-1 -mr-1 size-7 rounded-full bg-sunken text-muted flex items-center justify-center shrink-0 transition-colors duration-200 group-hover:bg-brand-700 group-hover:text-white" aria-hidden>
            <ArrowUpRight className="size-3.5" />
          </span>
        )}
      </div>
      <div className="mt-2 text-[30px] leading-9 font-normal tracking-[-0.03em] text-ink tabular">{value}</div>
      {hint != null && hint !== "" && <div className="mt-1 text-[12px] text-muted leading-5">{hint}</div>}
      {children}
    </>
  );
  const cls = cn(
    "group block bg-surface border border-white rounded-[var(--radius-card)] shadow-[var(--shadow-card)] px-5 py-4",
    href && "transition-[box-shadow,transform] duration-200 hover:shadow-[var(--shadow-raised)] hover:-translate-y-0.5",
    className,
  );
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

// ─── Progress ──────────────────────────────────────────────────────────────

export function ProgressBar({ value, tone = "brand", className, label }: { value: number; tone?: "brand" | "warn" | "ok" | "ai"; className?: string; label?: string }) {
  const color = { brand: "bg-brand-700", warn: "bg-warn-500", ok: "bg-ok-600", ai: "bg-ai-500" }[tone];
  const track = { brand: "bg-sunken", warn: "bg-warn-50", ok: "bg-ok-50", ai: "bg-ai-50" }[tone];
  return (
    <div className={cn("h-2 w-full rounded-full overflow-hidden", track, className)} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", color)} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  );
}

/** Progress as a row of thin ticks (filled up to the value) — a quieter, more graphic progress bar. */
export function TickBar({ value, ticks = 36, tone = "brand", className, label }: { value: number; ticks?: number; tone?: "brand" | "accent" | "ok"; className?: string; label?: string }) {
  const filled = Math.round(Math.min(1, Math.max(0, value)) * ticks);
  const on = { brand: "bg-brand-700", accent: "bg-accent-600", ok: "bg-ok-600" }[tone];
  return (
    <div className={cn("flex items-end justify-between gap-[3px] h-10", className)} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      {Array.from({ length: ticks }, (_, i) => (
        <span key={i} className={cn("w-[2px] rounded-full transition-colors duration-500", i < filled ? cn(on, "h-full") : "bg-line-strong h-3/4")} />
      ))}
    </div>
  );
}

export function ProgressRing({ value, size = 56, stroke = 6, label }: { value: number; size?: number; stroke?: number; label?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`${Math.round(value * 100)}% complete`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-sunken)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-brand-700)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value)} className="transition-[stroke-dashoffset] duration-700" />
      </svg>
      <span className="absolute text-[13px] font-semibold tabular">{label ?? `${Math.round(value * 100)}%`}</span>
    </div>
  );
}

// ─── States ────────────────────────────────────────────────────────────────

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center px-6 py-14", className)}>
      {icon && (
        <div className="relative mb-4">
          <div className="absolute inset-0 -m-2.5 rounded-3xl bg-sunken/80" aria-hidden />
          <div className="relative size-12 rounded-2xl bg-surface border border-line shadow-[var(--shadow-raised)] text-ink-2 flex items-center justify-center [&_svg]:size-5">{icon}</div>
        </div>
      )}
      <div className="text-[16px] font-medium text-ink tracking-[-0.01em]">{title}</div>
      {description && <p className="text-[13px] text-muted mt-1 max-w-sm leading-relaxed">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-lg", className)} aria-hidden />;
}

export function Notice({ tone = "info", title, children, icon, action, className }: { tone?: Tone; title?: ReactNode; children?: ReactNode; icon?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-2xl px-4 py-3 ring-1 ring-inset text-[13px] leading-relaxed", tone === "brand" ? "bg-brand-50 text-brand-700 ring-brand-100" : TONES[tone], className)} role={tone === "crit" ? "alert" : "status"}>
      {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
      <div className="min-w-0 flex-1">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={cn(title && "mt-0.5", "opacity-90")}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ─── Forms ─────────────────────────────────────────────────────────────────

export const inputClass = "h-10 rounded-[var(--radius-control)] border border-line-strong bg-surface px-4 text-sm text-ink shadow-[var(--shadow-xs)] placeholder:text-subtle hover:border-brand-300 focus:border-brand-500 focus:shadow-[var(--shadow-focus)] focus:outline-none focus-visible:outline-none disabled:bg-sunken disabled:text-subtle disabled:shadow-none transition-[border-color,box-shadow] duration-150";

export function Field({ label, hint, error, children, htmlFor, className }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-2">
        {label}
      </label>
      {children}
      {error ? <p className="text-[12px] text-crit-600" role="alert">{error}</p> : hint ? <p className="text-[12px] text-muted">{hint}</p> : null}
    </div>
  );
}

/** Width defaults to full unless the caller sets one (keeps class lists conflict-free without tailwind-merge). */
const widthOr = (className?: string) => (className && /(^|s)(w-|min-w-|max-w-|flex-1)/.test(className) ? "" : "w-full");

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputClass, widthOr(className), className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn(inputClass, widthOr(className), "pr-9 appearance-none select-chevron", className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(inputClass, "w-full h-auto min-h-20 py-2.5 rounded-2xl leading-relaxed", className)} {...props} />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex items-center h-5 min-w-5 px-1.5 rounded-md border border-line-strong bg-surface-2 text-[11px] font-medium text-muted font-sans">{children}</kbd>;
}

export function Avatar({ name, hue = 150, size = 28 }: { name: string; hue?: number; size?: number }) {
  const initials = name
    .replace(/,.*$/, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  return (
    <span className="inline-flex items-center justify-center rounded-full font-semibold shrink-0 select-none" style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${hue} 40% 92%)`, color: `hsl(${hue} 45% 28%)` }} aria-hidden>
      {initials}
    </span>
  );
}

export function DescList({ items, className }: { items: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[minmax(0,40%)_1fr] gap-x-4 gap-y-2.5 text-[13px]", className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="text-ink min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
