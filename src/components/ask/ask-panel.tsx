"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowUp, BookOpen, Database, ExternalLink, FileText, Landmark, LineChart, ShieldAlert, Sparkles, UserRound, X } from "lucide-react";
import type { AskAnswer } from "@/lib/ask-types";
import { cn } from "@/lib/cn";
import { ask } from "@/app/actions/app";
import { Badge } from "@/components/ui/primitives";

export const STARTERS = [
  "What government programs could potentially help Smith Family Farms expand?",
  "Can we afford to purchase another $1 million of farmland?",
  "How much did we spend on equipment this year?",
  "Show me payments to John Deere.",
  "Which bills are due this month?",
  "Who owes us more than $20,000?",
  "Why did profit decline last quarter?",
  "What is our current cash position?",
];

interface Turn {
  role: "user" | "assistant";
  text: string;
  answer?: AskAnswer;
  error?: boolean;
}

const MODULE_LABEL: Record<string, string> = { books: "Books", bills: "Bills", collect: "Collect", funding: "Funding", cfo: "CFO", documents: "Documents", reports: "Reports" };
const SOURCE_ICON = { accounting: Database, document: FileText, program: Landmark, forecast: LineChart, scenario: LineChart, profile: UserRound };

export function AnswerView({ a, onFollowUp }: { a: AskAnswer; onFollowUp?: (q: string) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        {a.refused ? (
          <Badge tone="warn"><ShieldAlert className="size-3" /> Read-only</Badge>
        ) : (
          a.modules.map((m) => (
            <Badge key={m} tone="neutral">{MODULE_LABEL[m] ?? m}</Badge>
          ))
        )}
        {a.grounding === "grounded" && !a.refused && <Badge tone="ok">Grounded in your data</Badge>}
        {a.grounding === "partial" && <Badge tone="warn">Partial data</Badge>}
      </div>
      <p className="text-[14.5px] leading-relaxed text-ink">{a.summary}</p>
      {a.metrics && a.metrics.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {a.metrics.map((m) => (
            <div key={m.label} className="rounded-lg border border-line bg-surface px-3 py-2">
              <div className="text-[11.5px] text-muted">{m.label}</div>
              <div className={cn("text-[16px] font-semibold tabular", m.tone === "negative" && "text-risk-600", m.tone === "positive" && "text-ok-600")}>{m.value}</div>
            </div>
          ))}
        </div>
      )}
      {a.bullets && a.bullets.length > 0 && (
        <ul className="space-y-1 text-[13.5px] text-ink-2">
          {a.bullets.map((b, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-subtle">•</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
      {a.table && a.table.rows.length > 0 && (
        <div className="rounded-lg border border-line overflow-hidden">
          {a.table.caption && <div className="px-3 py-2 text-[12px] font-medium text-muted bg-surface-2 border-b border-line">{a.table.caption}</div>}
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-muted">
                  {a.table.columns.map((c) => (
                    <th key={c.key} className={cn("px-3 py-1.5 font-medium whitespace-nowrap", c.align === "right" ? "text-right" : "text-left")}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {a.table.rows.map((r, i) => (
                  <tr key={i} className="border-t border-line">
                    {a.table!.columns.map((c) => (
                      <td key={c.key} className={cn("px-3 py-1.5 align-top", c.align === "right" ? "text-right tabular whitespace-nowrap" : "min-w-[90px]")}>{r[c.key]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {a.table.href && (
            <Link href={a.table.href} className="flex items-center gap-1 px-3 py-2 text-[12px] text-brand-700 border-t border-line hover:bg-surface-2">
              Open supporting data <ExternalLink className="size-3" />
            </Link>
          )}
        </div>
      )}
      {a.links && a.links.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {a.links.map((l) => (
            <Link key={l.href + l.label} href={l.href} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md bg-brand-50 text-brand-700 text-[12.5px] font-medium hover:bg-brand-100">
              {l.label}
            </Link>
          ))}
        </div>
      )}
      {a.sources.length > 0 && (
        <div className="pt-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-subtle mb-1.5">Sources</div>
          <div className="flex flex-wrap gap-1.5">
            {a.sources.map((s, i) => {
              const Icon = SOURCE_ICON[s.kind] ?? BookOpen;
              const inner = (
                <>
                  <Icon className="size-3 shrink-0" />
                  <span className="truncate max-w-[220px]">{s.label}</span>
                  {s.detail && <span className="text-subtle truncate max-w-[160px]">· {s.detail}</span>}
                </>
              );
              const cls = "inline-flex items-center gap-1 h-6 px-2 rounded-md border border-line bg-surface text-[11.5px] text-ink-2";
              return s.href ? (
                s.href.startsWith("http") ? (
                  <a key={i} href={s.href} target="_blank" rel="noreferrer noopener" className={cn(cls, "hover:border-line-strong")}>{inner}</a>
                ) : (
                  <Link key={i} href={s.href} className={cn(cls, "hover:border-line-strong")}>{inner}</Link>
                )
              ) : (
                <span key={i} className={cls}>{inner}</span>
              );
            })}
          </div>
        </div>
      )}
      {a.followUps && onFollowUp && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {a.followUps.slice(0, 1).map((f) => (
            <button key={f} onClick={() => onFollowUp(f)} className="text-left text-[12.5px] px-2.5 py-1.5 rounded-lg border border-ai-100 bg-ai-50/50 text-ai-700 hover:bg-ai-50">
              {f}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AskChat({ initialQuestion, compact, orgName }: { initialQuestion?: string; compact?: boolean; orgName?: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [threadId, setThreadId] = useState<string>();
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  const asked = useRef(false);

  const send = (question: string) => {
    const text = question.trim();
    if (!text || pending) return;
    setQ("");
    setTurns((t) => [...t, { role: "user", text }]);
    start(async () => {
      const r = await ask(text, threadId);
      if (r.ok && r.data) {
        setThreadId(r.data.threadId);
        setTurns((t) => [...t, { role: "assistant", text: r.data!.answer.summary, answer: r.data!.answer }]);
      } else setTurns((t) => [...t, { role: "assistant", text: r.ok ? "Something went wrong." : r.error, error: true }]);
    });
  };

  useEffect(() => {
    if (initialQuestion && !asked.current) {
      asked.current = true;
      send(initialQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, pending]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto min-h-0">
        {turns.length === 0 && (
          <div className={cn(compact ? "px-5 py-6" : "py-12 sm:py-16 max-w-3xl mx-auto text-center")}>
            <div className={cn("relative inline-flex", !compact && "mx-auto")}>
              <div className="absolute inset-0 -m-3 rounded-3xl bg-ai-100/60 blur-xl" aria-hidden />
              <div className="relative size-12 rounded-2xl bg-gradient-to-b from-ai-500 to-ai-700 text-white shadow-[var(--shadow-raised),var(--shadow-inset)] flex items-center justify-center">
                <Sparkles className="size-5" />
              </div>
            </div>
            <h3 className={cn("mt-4 font-normal tracking-[-0.025em]", compact ? "text-[20px]" : "text-[30px]")}>Ask anything about {orgName ?? "your finances"}</h3>
            <div className={cn("mt-6 grid gap-2 text-left", compact ? "" : "sm:grid-cols-2")}>
              {STARTERS.slice(0, compact ? 5 : 8).map((s) => (
                <button key={s} onClick={() => send(s)} className="group flex items-center gap-3 text-left text-[13px] rounded-2xl border border-line bg-surface px-4 py-3 shadow-[var(--shadow-xs)] hover:border-ai-100 hover:bg-ai-50/40 hover:shadow-[var(--shadow-raised)] hover:-translate-y-px active:translate-y-0 transition-[border-color,background-color,box-shadow,transform] duration-200">
                  <span className="flex-1">{s}</span>
                  <ArrowUp className="size-3.5 rotate-45 text-subtle shrink-0 transition-colors group-hover:text-ai-600" aria-hidden />
                </button>
              ))}
            </div>
          </div>
        )}
        <div className={cn("space-y-5", compact ? "px-5 py-5" : "py-6")}>
          {turns.map((t, i) =>
            t.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="animate-in max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-b from-brand-600 to-brand-700 text-white px-4 py-2.5 text-[14px] shadow-[var(--shadow-xs),var(--shadow-inset)]">{t.text}</div>
              </div>
            ) : (
              <div key={i} className="animate-in flex gap-3">
                <div className="size-7 rounded-lg bg-ai-50 text-ai-600 ring-1 ring-inset ring-ai-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Sparkles className="size-4" />
                </div>
                <div className={cn("min-w-0 flex-1 rounded-2xl rounded-tl-md border px-4 py-3", t.error ? "border-crit-50 bg-crit-50 text-crit-600 text-[13.5px]" : "border-line bg-surface-2")}>
                  {t.answer ? <AnswerView a={t.answer} onFollowUp={send} /> : t.text}
                </div>
              </div>
            ),
          )}
          {pending && (
            <div className="flex gap-3">
              <div className="size-7 rounded-lg bg-ai-50 text-ai-600 flex items-center justify-center shrink-0">
                <Sparkles className="size-4 animate-pulse" />
              </div>
              <div className="rounded-2xl border border-line bg-surface-2 px-4 py-3 text-[13px] text-muted inline-flex items-center gap-2.5">
                <span className="flex gap-1" aria-hidden>
                  <span className="size-1.5 rounded-full bg-ai-500 animate-bounce [animation-delay:-0.3s]" />
                  <span className="size-1.5 rounded-full bg-ai-500 animate-bounce [animation-delay:-0.15s]" />
                  <span className="size-1.5 rounded-full bg-ai-500 animate-bounce" />
                </span>
                Checking your books, forecasts and programs…
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(q);
        }}
        className={cn("shrink-0 border-t border-line bg-surface", compact ? "p-3" : "pt-4")}
      >
        <div className="flex items-end gap-2 rounded-[26px] border border-line-strong bg-surface pl-5 pr-2 py-2 shadow-[var(--shadow-xs)] transition-[border-color,box-shadow] duration-150 focus-within:border-brand-500 focus-within:shadow-[var(--shadow-focus)]">
          <textarea
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(q);
              }
            }}
            rows={1}
            maxLength={500}
            placeholder="Ask about cash, spending, bills, funding, scenarios…"
            className="flex-1 resize-none bg-transparent outline-none text-[14px] py-1 max-h-32"
            aria-label="Ask Fabrik"
          />
          <button type="submit" disabled={!q.trim() || pending} className="size-10 rounded-full bg-brand-700 text-white flex items-center justify-center shadow-[var(--shadow-inset)] hover:bg-brand-800 active:scale-95 transition-[background-color,transform] duration-150 disabled:bg-line-strong disabled:shadow-none" aria-label="Send">
            <ArrowUp className="size-4" />
          </button>
        </div>
        <p className="text-[11px] text-subtle mt-1.5 px-1">Funding matches are potential, not confirmed eligibility.</p>
      </form>
    </div>
  );
}

export function AskLauncher() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open]);
  return (
    <>
      <button onClick={() => setOpen(true)} className="no-print group fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 h-11 px-3.5 sm:pl-3.5 sm:pr-4 rounded-full bg-gradient-to-b from-brand-600 to-brand-800 text-white ring-1 ring-white/10 shadow-[var(--shadow-pop),var(--shadow-inset)] hover:-translate-y-0.5 hover:shadow-[0_20px_44px_-12px_rgba(28,34,48,.45)] active:translate-y-0 transition-[transform,box-shadow] duration-200" aria-label="Ask Fabrik">
        <Sparkles className="size-4.5 text-brand-300 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
        <span className="text-[13.5px] font-medium hidden sm:inline">Ask Fabrik</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-[75]">
          <div className="animate-backdrop absolute inset-0 bg-ink/25 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div role="dialog" aria-modal="true" aria-label="Ask Fabrik" className="animate-drawer absolute right-0 top-0 h-full w-full max-w-[520px] bg-surface shadow-[var(--shadow-pop)] flex flex-col sm:rounded-l-2xl sm:border-l sm:border-line overflow-hidden">
            <div className="flex items-center justify-between px-5 h-14 border-b border-line shrink-0">
              <div className="flex items-center gap-2 font-semibold">
                <Sparkles className="size-4.5 text-ai-600" /> Ask Fabrik
              </div>
              <div className="flex items-center gap-1">
                <Link href="/ask" onClick={() => setOpen(false)} className="text-[12.5px] text-muted hover:text-ink px-2 py-1 rounded-md hover:bg-sunken">Open full page</Link>
                <button onClick={() => setOpen(false)} className="size-8 rounded-lg hover:bg-sunken flex items-center justify-center" aria-label="Close">
                  <X className="size-4.5" />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <AskChat compact />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
