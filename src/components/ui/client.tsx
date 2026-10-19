"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./primitives";

// ─── Toasts ─────────────────────────────────────────────────────────────────

interface Toast {
  id: number;
  tone: "success" | "error" | "info";
  title: string;
  body?: string;
}

const ToastCtx = createContext<(t: Omit<Toast, "id">) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((xs) => [...xs.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), t.tone === "error" ? 7000 : 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 sm:left-auto sm:right-24 sm:translate-x-0 z-[90] flex flex-col gap-2 w-[min(92vw,380px)]" aria-live="polite">
        {toasts.map((t) => {
          const Icon = t.tone === "success" ? CheckCircle2 : t.tone === "error" ? CircleAlert : Info;
          return (
            <div key={t.id} className="animate-toast flex items-start gap-3 rounded-2xl bg-ink/95 backdrop-blur text-white pl-3.5 pr-3 py-3 shadow-[var(--shadow-pop)] ring-1 ring-white/10" role={t.tone === "error" ? "alert" : "status"}>
              <span className={cn("mt-px size-6 rounded-full flex items-center justify-center shrink-0", t.tone === "success" ? "bg-[#7fd3a4]/15" : t.tone === "error" ? "bg-[#f3a3a3]/15" : "bg-[#a9c7f1]/15")}>
                <Icon className={cn("size-4", t.tone === "success" ? "text-[#7fd3a4]" : t.tone === "error" ? "text-[#f3a3a3]" : "text-[#a9c7f1]")} />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="text-[13.5px] font-medium leading-5">{t.title}</div>
                {t.body && <div className="text-[12.5px] text-white/70 mt-0.5">{t.body}</div>}
              </div>
              <button className="size-6 rounded-md text-white/50 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors" onClick={() => setToasts((xs) => xs.filter((x) => x.id !== t.id))} aria-label="Dismiss">
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}

// ─── Overlay primitives ─────────────────────────────────────────────────────

const noopSubscribe = () => () => {};

/**
 * False on the server and during hydration, true afterwards. Overlays portal into document.body,
 * which the server can't render, so one that starts open (e.g. /collect?invoice=…) waits for this
 * instead of making the first client render differ from the server HTML.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", h);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
}

function useFocusTrap(open: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !ref.current) return;
    const el = ref.current;
    const prev = document.activeElement as HTMLElement | null;
    const first = el.querySelector<HTMLElement>("[data-autofocus], button, [href], input, select, textarea");
    first?.focus();
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const f = [...el.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex='-1'])")];
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) {
        e.preventDefault();
        f.at(-1)!.focus();
      } else if (!e.shiftKey && document.activeElement === f.at(-1)) {
        e.preventDefault();
        f[0]!.focus();
      }
    };
    el.addEventListener("keydown", h);
    return () => {
      el.removeEventListener("keydown", h);
      prev?.focus?.();
    };
  }, [open]);
  return ref;
}

export function Drawer({ open, onClose, title, subtitle, children, footer, width = 560 }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; width?: number }) {
  const shown = useHydrated() && open;
  useEscape(shown, onClose);
  const ref = useFocusTrap(shown);
  const id = useId();
  if (!shown) return null;
  return createPortal(
    <div className="fixed inset-0 z-[70]">
      <div className="animate-backdrop absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} className="animate-drawer absolute right-0 top-0 h-full bg-surface shadow-[var(--shadow-pop)] flex flex-col w-full sm:rounded-l-2xl sm:border-l sm:border-line overflow-hidden" style={{ maxWidth: width }}>
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-line bg-gradient-to-b from-surface-2 to-surface">
          <div className="min-w-0">
            <h2 id={id} className="text-[17px] font-semibold text-ink tracking-[-0.01em]">{title}</h2>
            {subtitle && <div className="text-[13px] text-muted mt-0.5">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="size-8 -mr-1.5 rounded-lg text-muted hover:bg-sunken hover:text-ink flex items-center justify-center transition-colors" aria-label="Close">
            <X className="size-4.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="border-t border-line px-6 py-3.5 bg-surface-2/80 backdrop-blur flex items-center justify-end gap-2 flex-wrap">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Modal({ open, onClose, title, description, children, footer, width = 480 }: { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode; width?: number }) {
  const shown = useHydrated() && open;
  useEscape(shown, onClose);
  const ref = useFocusTrap(shown);
  const id = useId();
  if (!shown) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="animate-backdrop absolute inset-0 bg-ink/35 backdrop-blur-[2px]" onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} className="animate-pop relative bg-surface rounded-2xl shadow-[var(--shadow-pop)] ring-1 ring-ink/5 w-full overflow-hidden" style={{ maxWidth: width, transformOrigin: "center" }}>
        <div className="px-6 pt-6">
          <h2 id={id} className="text-[17px] font-semibold text-ink tracking-[-0.01em]">{title}</h2>
          {description && <div className="text-[13.5px] text-muted mt-1.5 leading-relaxed">{description}</div>}
        </div>
        {children && <div className="px-6 pt-4">{children}</div>}
        <div className="px-6 py-4 mt-5 border-t border-line bg-surface-2 flex items-center justify-end gap-2">{footer ?? <Button onClick={onClose}>Close</Button>}</div>
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = "Confirm", tone = "primary", busy, children }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; description?: ReactNode; confirmLabel?: string; tone?: "primary" | "danger"; busy?: boolean; children?: ReactNode }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={tone} onClick={onConfirm} disabled={busy} data-autofocus>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}

// ─── Segmented control / tabs ───────────────────────────────────────────────

export function Segmented<T extends string>({ value, onChange, options, size = "md", label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; size?: "sm" | "md"; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex items-center rounded-[var(--radius-control)] bg-sunken p-1 gap-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("rounded-md font-medium transition-[background-color,color,box-shadow] duration-150", size === "sm" ? "h-7 px-2.5 text-[12.5px]" : "h-7 px-3 text-[13px]", value === o.value ? "bg-surface text-ink shadow-[0_1px_2px_rgba(22,26,23,.08),0_0_0_1px_rgba(22,26,23,.04)]" : "text-muted hover:text-ink")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Popover menu ───────────────────────────────────────────────────────────

export function Popover({ trigger, children, align = "right", width = 300, label }: { trigger: (p: { open: boolean; toggle: () => void }) => ReactNode; children: (close: () => void) => ReactNode; align?: "left" | "right"; width?: number; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div role="menu" aria-label={label} className={cn("animate-pop absolute top-full mt-2 z-[60] rounded-2xl border border-line bg-surface shadow-[var(--shadow-pop)] overflow-hidden", align === "right" ? "right-0 origin-top-right" : "left-0 origin-top-left")} style={{ width: `min(${width}px, calc(100vw - 24px))` }}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** Measures human handling time for the "human minutes per client" north-star metric. */
export function useHandlingTimer(key: string | undefined) {
  const start = useRef(Date.now());
  useEffect(() => {
    start.current = Date.now();
  }, [key]);
  return () => Math.min(900, Math.round((Date.now() - start.current) / 1000));
}
