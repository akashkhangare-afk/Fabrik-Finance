"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check, CheckCheck, Loader2, MessageSquare, PartyPopper, Pencil, ShieldAlert, X } from "lucide-react";
import { approveTxn, askClientAboutTxn, bulkApproveTxns, draftQuestion, escalateTxn } from "@/app/actions/app";
import { AiBadge, Badge, Button, Card, ConfidenceBadge, EmptyState, Input, Kbd, Select, Textarea } from "@/components/ui/primitives";
import { useHandlingTimer, useToast } from "@/components/ui/client";
import { money } from "@/lib/format";
import { prettyDate } from "@/lib/dates";
import { cn } from "@/lib/cn";

export interface ReviewRow {
  id: string;
  date: string;
  vendor: string;
  description: string;
  amount: number;
  bank: string;
  accountId?: string;
  accountName: string;
  confidence: number;
  decision: "auto" | "review" | "clarify";
  explanation: string;
  risk: { level: "low" | "medium" | "high"; reasons: string[] } | null;
  alternatives: { accountId: string; name: string; confidence: number }[];
  escalated?: string;
}

export interface AccountOpt {
  id: string;
  name: string;
  code: string;
  type: string;
}

type Mode = "change" | "ask" | "escalate";
type Result = { ok: true; message?: string } | { ok: false; error: string };

const isTyping = (el: EventTarget | null) => {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
};

export function ReviewQueue({ rows, accounts, thresholds, orgName }: { rows: ReviewRow[]; accounts: AccountOpt[]; thresholds: { autoApprove: number; review: number }; orgName: string }) {
  const router = useRouter();
  const toast = useToast();
  const [, startRefresh] = useTransition();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visible = useMemo(() => rows.filter((r) => !hidden.has(r.id)), [rows, hidden]);
  const [focus, setFocus] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<{ id: string; kind: Mode } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const fi = Math.min(focus, Math.max(0, visible.length - 1));
  const current = visible[fi];
  const elapsed = useHandlingTimer(current?.id);

  // Prune selection when rows leave the queue.
  useEffect(() => {
    const ids = new Set(rows.map((r) => r.id));
    setSelected((s) => (Array.from(s).every((id) => ids.has(id)) ? s : new Set(Array.from(s).filter((id) => ids.has(id)))));
    setHidden((h) => (h.size ? new Set(Array.from(h).filter((id) => ids.has(id))) : h));
  }, [rows]);

  useEffect(() => {
    if (!current) return;
    listRef.current?.querySelector<HTMLElement>(`[data-row="${current.id}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const perform = useCallback(
    async (key: string, fn: () => Promise<Result>, hide: string[] = []) => {
      setBusy(key);
      try {
        const r = await fn();
        if (r.ok) {
          toast({ tone: "success", title: r.message ?? "Done" });
          if (hide.length) setHidden((h) => new Set([...h, ...hide]));
          setMode(null);
        } else toast({ tone: "error", title: r.error });
        return r.ok;
      } finally {
        setBusy(null);
        startRefresh(() => router.refresh());
      }
    },
    [router, toast],
  );

  const approve = useCallback((r: ReviewRow) => perform(r.id, () => approveTxn(r.id, { humanSeconds: elapsed() }), [r.id]), [perform, elapsed]);
  const toggle = useCallback((id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  }), []);

  const bulkIds = visible.filter((r) => selected.has(r.id)).map((r) => r.id);
  const bulk = () => {
    const eligible = visible.filter((r) => selected.has(r.id) && r.decision !== "clarify").map((r) => r.id);
    return perform("bulk", async () => {
      const r = await bulkApproveTxns(bulkIds, elapsed());
      if (r.ok) setSelected(new Set());
      return r.ok ? { ok: true as const, message: r.message } : { ok: false as const, error: r.error };
    }, eligible);
  };

  // Keyboard shortcuts: J/K move, A approve, C change, Q ask, E escalate, X select.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || document.querySelector("[role=dialog]")) return;
      const k = e.key.toLowerCase();
      if (k === "escape" && mode) return setMode(null);
      if (!current || busy) return;
      const acts: Record<string, () => void> = {
        j: () => setFocus(Math.min(visible.length - 1, fi + 1)),
        arrowdown: () => setFocus(Math.min(visible.length - 1, fi + 1)),
        k: () => setFocus(Math.max(0, fi - 1)),
        arrowup: () => setFocus(Math.max(0, fi - 1)),
        a: () => void approve(current),
        c: () => setMode({ id: current.id, kind: "change" }),
        q: () => setMode({ id: current.id, kind: "ask" }),
        e: () => setMode({ id: current.id, kind: "escalate" }),
        x: () => toggle(current.id),
      };
      const fn = acts[k];
      if (!fn) return;
      if ((k === "arrowdown" || k === "arrowup") && document.activeElement && document.activeElement !== document.body && !listRef.current?.contains(document.activeElement)) return;
      e.preventDefault();
      fn();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [current, fi, visible.length, mode, busy, approve, toggle]);

  if (!visible.length) {
    return (
      <Card>
        <EmptyState icon={<PartyPopper className="size-5" />} title="Queue clear — automation is handling everything for this client" description={`Nothing at ${orgName} needs a decision right now. New uncertain or risky transactions will appear here after the next sync.`} />
      </Card>
    );
  }

  const allSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));

  return (
    <div>
      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 px-4 sm:px-5 py-2.5 border-b border-line bg-surface-2 text-[12.5px] text-muted">
          <input type="checkbox" aria-label="Select all transactions" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(visible.map((r) => r.id)))} className="size-4 accent-brand-600 cursor-pointer" />
          <span>{allSelected ? "All selected" : selected.size ? `${bulkIds.length} selected` : "Highest risk and lowest confidence first"}</span>
          <span className="ml-auto hidden sm:inline tabular">{fi + 1} / {visible.length}</span>
        </div>
        <ul ref={listRef} aria-label="Transactions needing review">
          {visible.map((r, i) => (
            <ReviewItem
              key={r.id}
              row={r}
              focused={i === fi}
              selected={selected.has(r.id)}
              mode={mode?.id === r.id ? mode.kind : null}
              busy={busy === r.id}
              disabled={busy !== null}
              accounts={accounts}
              thresholds={thresholds}
              onFocus={() => setFocus(i)}
              onToggle={() => toggle(r.id)}
              onMode={(k) => {
                setFocus(i);
                setMode(k ? { id: r.id, kind: k } : null);
              }}
              onApprove={() => {
                setFocus(i);
                void approve(r);
              }}
              onChange={(accountId, comment) => perform(r.id, () => approveTxn(r.id, { accountId, comment: comment || undefined, humanSeconds: elapsed() }), [r.id])}
              onAsk={(body) => perform(r.id, () => askClientAboutTxn(r.id, body, elapsed()), [r.id])}
              onEscalate={(note) => perform(r.id, async () => {
                const x = await escalateTxn(r.id, note);
                return x.ok ? { ok: true as const, message: x.message } : x;
              })}
            />
          ))}
        </ul>
      </Card>

      {bulkIds.length > 0 && (
        <div className="sticky bottom-4 z-30 mt-4 flex justify-center pointer-events-none">
          <div className="animate-in pointer-events-auto flex items-center gap-3 rounded-2xl bg-ink text-white pl-4 pr-2 py-2 shadow-[var(--shadow-pop)]" role="region" aria-label="Bulk actions">
            <span className="text-[13.5px] font-medium tabular">{bulkIds.length} selected</span>
            <button type="button" onClick={() => setSelected(new Set())} className="text-[12.5px] text-white/70 hover:text-white underline-offset-2 hover:underline">Clear</button>
            <Button variant="primary" size="sm" disabled={busy !== null} onClick={bulk}>
              {busy === "bulk" ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCheck className="size-3.5" />} Approve {bulkIds.length} as suggested
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewItem({ row: r, focused, selected, mode, busy, disabled, accounts, thresholds, onFocus, onToggle, onMode, onApprove, onChange, onAsk, onEscalate }: {
  row: ReviewRow;
  focused: boolean;
  selected: boolean;
  mode: Mode | null;
  busy: boolean;
  disabled: boolean;
  accounts: AccountOpt[];
  thresholds: { autoApprove: number; review: number };
  onFocus: () => void;
  onToggle: () => void;
  onMode: (k: Mode | null) => void;
  onApprove: () => void;
  onChange: (accountId: string, comment: string) => Promise<boolean>;
  onAsk: (body: string) => Promise<boolean>;
  onEscalate: (note: string) => Promise<boolean>;
}) {
  const out = r.amount < 0;
  return (
    <li
      data-row={r.id}
      onClick={onFocus}
      className={cn("relative border-t border-line first:border-t-0 px-4 sm:px-5 py-4 transition-colors", focused ? "bg-brand-50/50" : "hover:bg-surface-2", selected && !focused && "bg-ai-50/40")}
      aria-current={focused ? "true" : undefined}
    >
      {focused && <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-brand-600" aria-hidden />}
      <div className="flex items-start gap-3">
        <input type="checkbox" aria-label={`Select ${r.vendor} ${money(r.amount, { decimals: true })}`} checked={selected} onChange={onToggle} onClick={(e) => e.stopPropagation()} className="mt-1 size-4 accent-brand-600 cursor-pointer shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[15px] font-semibold text-ink">{r.vendor}</span>
                {r.escalated && <Badge tone="info" title={r.escalated}>Escalated</Badge>}
                {r.decision === "clarify" && <Badge tone="ai">Client input suggested</Badge>}
              </div>
              <div className="text-[12px] text-muted mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                <span className="tabular whitespace-nowrap">{prettyDate(r.date, { year: true })}</span>
                <span aria-hidden>·</span>
                <span className="font-mono text-[11.5px] text-ink-2 break-words min-w-0">{r.description}</span>
                <span aria-hidden className="hidden sm:inline">·</span>
                <span className="hidden sm:inline whitespace-nowrap">{r.bank}</span>
              </div>
            </div>
            <div className={cn("text-[17px] font-semibold tabular whitespace-nowrap", out ? "text-ink" : "text-ok-600")}>{money(r.amount, { decimals: true, sign: !out })}</div>
          </div>

          <div className="mt-3 rounded-xl border border-ai-100 bg-ai-50/40 px-3.5 py-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <AiBadge label="AI recommendation" />
              <span className="text-[14px] font-semibold text-ink">{r.accountName}</span>
              <span className="text-[12px] text-muted">Confidence</span>
              <ConfidenceBadge value={r.confidence} thresholds={thresholds} />
            </div>
            <p className="text-[13px] text-ink-2 mt-1.5 leading-relaxed">
              <span className="text-muted">Reason: </span>
              {r.explanation}
            </p>
            {r.risk && r.risk.reasons.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <ShieldAlert className={cn("size-3.5", r.risk.level === "high" ? "text-crit-600" : "text-risk-600")} aria-hidden />
                <span className="text-[12px] text-muted mr-0.5">Risk rules:</span>
                {r.risk.reasons.map((x) => (
                  <Badge key={x} tone={r.risk!.level === "high" ? "crit" : "risk"} className="h-5 text-[11.5px]">{x}</Badge>
                ))}
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm" disabled={disabled} onClick={(e) => { e.stopPropagation(); onApprove(); }} aria-keyshortcuts="A">
              {busy && !mode ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Approve
            </Button>
            <Button size="sm" disabled={disabled} onClick={(e) => { e.stopPropagation(); onMode(mode === "change" ? null : "change"); }} aria-expanded={mode === "change"} aria-keyshortcuts="C">
              <Pencil className="size-3.5" /> Change
            </Button>
            <Button size="sm" disabled={disabled} onClick={(e) => { e.stopPropagation(); onMode(mode === "ask" ? null : "ask"); }} aria-expanded={mode === "ask"} aria-keyshortcuts="Q">
              <MessageSquare className="size-3.5" /> Ask client
            </Button>
            <Button size="sm" variant="ghost" disabled={disabled} onClick={(e) => { e.stopPropagation(); onMode(mode === "escalate" ? null : "escalate"); }} aria-expanded={mode === "escalate"} aria-keyshortcuts="E">
              <ArrowUpRight className="size-3.5" /> Escalate
            </Button>
            {focused && (
              <span className="hidden md:inline-flex items-center gap-1 ml-auto text-[11.5px] text-subtle">
                <Kbd>A</Kbd><Kbd>C</Kbd><Kbd>Q</Kbd><Kbd>E</Kbd>
              </span>
            )}
          </div>

          {mode === "change" && <ChangePanel row={r} accounts={accounts} busy={busy} onCancel={() => onMode(null)} onSubmit={onChange} />}
          {mode === "ask" && <AskPanel row={r} busy={busy} onCancel={() => onMode(null)} onSubmit={onAsk} />}
          {mode === "escalate" && <EscalatePanel busy={busy} onCancel={() => onMode(null)} onSubmit={onEscalate} />}
        </div>
      </div>
    </li>
  );
}

function PanelShell({ title, children, onCancel }: { title: string; children: React.ReactNode; onCancel: () => void }) {
  return (
    <div className="animate-in mt-3 rounded-xl border border-line-strong bg-surface px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-2.5">
        <div className="text-[13px] font-semibold text-ink">{title}</div>
        <button type="button" onClick={onCancel} className="size-7 -mr-1.5 rounded-md text-muted hover:bg-sunken hover:text-ink flex items-center justify-center" aria-label="Cancel">
          <X className="size-4" />
        </button>
      </div>
      {children}
    </div>
  );
}

function ChangePanel({ row, accounts, busy, onCancel, onSubmit }: { row: ReviewRow; accounts: AccountOpt[]; busy: boolean; onCancel: () => void; onSubmit: (accountId: string, comment: string) => Promise<boolean> }) {
  const alts = row.alternatives.filter((a) => a.accountId !== row.accountId);
  const [accountId, setAccountId] = useState(alts[0]?.accountId ?? row.accountId ?? accounts[0]?.id ?? "");
  const [comment, setComment] = useState("");
  const groups = ["expense", "income", "asset", "liability", "equity"].map((t) => ({ t, list: accounts.filter((a) => a.type === t) })).filter((g) => g.list.length);
  const selectRef = useRef<HTMLSelectElement>(null);
  useEffect(() => selectRef.current?.focus(), []);
  return (
    <PanelShell title="Change category" onCancel={onCancel}>
      <form
        className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (accountId) void onSubmit(accountId, comment);
        }}
      >
        <div className="flex flex-col gap-1">
          <label htmlFor={`acct-${row.id}`} className="text-[12px] text-muted font-medium">Account</label>
          <Select ref={selectRef} id={`acct-${row.id}`} value={accountId} onChange={(e) => setAccountId(e.target.value)} onKeyDown={(e) => e.key === "Escape" && onCancel()}>
            {alts.length > 0 && (
              <optgroup label="AI alternatives">
                {alts.map((a) => (
                  <option key={`alt-${a.accountId}`} value={a.accountId}>{a.name} · {Math.round(a.confidence * 100)}%</option>
                ))}
              </optgroup>
            )}
            {groups.map((g) => (
              <optgroup key={g.t} label={g.t[0]!.toUpperCase() + g.t.slice(1)}>
                {g.list.map((a) => (
                  <option key={a.id} value={a.id}>{a.code ? `${a.code} · ` : ""}{a.name}</option>
                ))}
              </optgroup>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`cmt-${row.id}`} className="text-[12px] text-muted font-medium">Comment (optional, saved to audit trail)</label>
          <Input id={`cmt-${row.id}`} value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => e.key === "Escape" && onCancel()} placeholder="Why the change?" maxLength={500} />
        </div>
        <Button type="submit" variant="primary" disabled={busy || !accountId}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Approve with change
        </Button>
      </form>
      <p className="text-[11.5px] text-subtle mt-2">Fabrik learns from corrections and may apply this to similar pending transactions.</p>
    </PanelShell>
  );
}

function AskPanel({ row, busy, onCancel, onSubmit }: { row: ReviewRow; busy: boolean; onCancel: () => void; onSubmit: (body: string) => Promise<boolean> }) {
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    let live = true;
    draftQuestion(row.id).then((r) => {
      if (!live) return;
      if (r.ok && r.data) setBody(r.data);
      setLoading(false);
      setTimeout(() => ref.current?.focus(), 0);
    });
    return () => {
      live = false;
    };
  }, [row.id]);
  return (
    <PanelShell title="Ask the client" onCancel={onCancel}>
      <div className="flex items-center gap-2 mb-1.5">
        <label htmlFor={`ask-${row.id}`} className="text-[12px] text-muted font-medium">Question for the client&apos;s Finance Inbox</label>
        {!loading && <AiBadge label="AI draft" className="h-5" />}
      </div>
      <Textarea ref={ref} id={`ask-${row.id}`} value={loading ? "" : body} placeholder={loading ? "Drafting a question…" : "Write a short, specific question"} disabled={loading} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => e.key === "Escape" && onCancel()} rows={3} maxLength={2000} />
      <div className="mt-2.5 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11.5px] text-subtle">The client answers with one tap; their answer returns to processing.</p>
        <Button variant="primary" disabled={busy || loading || !body.trim()} onClick={() => void onSubmit(body)}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <MessageSquare className="size-4" />} Send to client
        </Button>
      </div>
    </PanelShell>
  );
}

function EscalatePanel({ busy, onCancel, onSubmit }: { busy: boolean; onCancel: () => void; onSubmit: (note: string) => Promise<boolean> }) {
  const [note, setNote] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <PanelShell title="Escalate to the reviewer" onCancel={onCancel}>
      <form
        className="flex flex-col sm:flex-row sm:items-end gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (note.trim()) void onSubmit(note.trim());
        }}
      >
        <div className="flex flex-col gap-1 flex-1">
          <label htmlFor="escalate-note" className="text-[12px] text-muted font-medium">Note for the reviewer</label>
          <Input ref={ref} id="escalate-note" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Escape" && onCancel()} placeholder="e.g. Looks like a capital purchase — confirm treatment" maxLength={300} />
        </div>
        <Button type="submit" disabled={busy || !note.trim()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUpRight className="size-4" />} Escalate
        </Button>
      </form>
    </PanelShell>
  );
}
