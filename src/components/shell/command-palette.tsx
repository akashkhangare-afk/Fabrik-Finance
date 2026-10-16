"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowRight, Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { Kbd } from "@/components/ui/primitives";

interface Hit {
  kind: string;
  title: string;
  subtitle?: string;
  href: string;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setHits([]);
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const ctl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal });
        if (res.ok) {
          setHits(((await res.json()) as { results: Hit[] }).results);
          setIdx(0);
        }
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, 140);
    return () => {
      ctl.abort();
      clearTimeout(t);
    };
  }, [q]);

  if (!open || typeof document === "undefined") return null;
  const askItem: Hit = { kind: "Ask Fabrik", title: q ? `Ask Fabrik: “${q}”` : "Ask Fabrik a question", href: `/ask?q=${encodeURIComponent(q)}` };
  const all = [...hits, ...(q.trim() ? [askItem] : [])];
  const go = (h: Hit) => {
    onClose();
    router.push(h.href);
  };

  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-start justify-center pt-[12vh] px-4">
      <div className="absolute inset-0 bg-ink/30" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Search" className="animate-in relative w-full max-w-[600px] rounded-2xl bg-surface shadow-[var(--shadow-pop)] overflow-hidden">
        <div className="flex items-center gap-3 px-4 h-14 border-b border-line">
          <Search className="size-[18px] text-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIdx((i) => Math.min(all.length - 1, i + 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setIdx((i) => Math.max(0, i - 1));
              }
              if (e.key === "Enter" && all[idx]) go(all[idx]!);
            }}
            placeholder="Search transactions, vendors, documents, programs and pages"
            className="flex-1 bg-transparent outline-none text-[15px]"
            aria-label="Search"
            role="combobox"
            aria-expanded={all.length > 0}
            aria-controls="palette-results"
          />
          <Kbd>Esc</Kbd>
        </div>
        <ul id="palette-results" role="listbox" className="max-h-[420px] overflow-y-auto p-2">
          {q.trim().length < 2 && <li className="px-3 py-8 text-center text-[13px] text-muted">Type at least two characters. Try “John Deere”, “JD-28712” or “ARC”.</li>}
          {loading && !hits.length && q.trim().length >= 2 && <li className="px-3 py-3 text-[13px] text-muted">Searching…</li>}
          {all.map((h, i) => (
            <li key={`${h.kind}-${h.href}-${i}`} role="option" aria-selected={i === idx}>
              <button onMouseEnter={() => setIdx(i)} onClick={() => go(h)} className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left", i === idx ? "bg-sunken" : "")}>
                {h.kind === "Ask Fabrik" ? <Sparkles className="size-4 text-ai-600" /> : <span className="w-[92px] shrink-0 text-[11px] font-medium uppercase tracking-wide text-subtle">{h.kind}</span>}
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] text-ink truncate">{h.title}</span>
                  {h.subtitle && <span className="block text-[12px] text-muted truncate">{h.subtitle}</span>}
                </span>
                {i === idx && <ArrowRight className="size-4 text-muted" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
