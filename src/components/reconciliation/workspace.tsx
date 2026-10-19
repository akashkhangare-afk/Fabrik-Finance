"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, CircleAlert, Copy, Clock, Lock, Sparkles } from "lucide-react";
import type { StatementLine } from "@/lib/types";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { prettyDate } from "@/lib/dates";
import { recAction } from "@/app/actions/app";
import { AiBadge, Badge, Button, Card, CardHeader, Notice, Select, StatusPill } from "@/components/ui/primitives";
import { ConfirmDialog, useToast } from "@/components/ui/client";

interface BookItemView {
  transactionId: string;
  date: string;
  description: string;
  amount: number;
  vendor?: string;
}

interface Props {
  recId: string;
  approved: boolean;
  isCard: boolean;
  summary: {
    statementBalance: number;
    bookBalance: number;
    outstanding: number;
    adjustedBookBalance: number;
    difference: number;
    matched: number;
    suggested: number;
    unmatched: number;
    duplicates: number;
    unreconciledBook: BookItemView[];
    duplicateBook: BookItemView[];
    canApprove: boolean;
    status: string;
  };
  lines: StatementLine[];
  outstanding: BookItemView[];
  accounts: { id: string; name: string; subtype: string }[];
  canWork: boolean;
  canApprove: boolean;
}

export function RecWorkspace({ recId, approved, isCard, summary: s, lines, outstanding, accounts, canWork, canApprove }: Props) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [showMatched, setShowMatched] = useState(false);
  const toast = useToast();
  const act = (a: Parameters<typeof recAction>[1]) =>
    start(async () => {
      const r = await recAction(recId, a);
      toast(r.ok ? { tone: "success", title: r.message ?? "Updated" } : { tone: "error", title: r.error });
    });
  const exceptions = lines.filter((l) => l.state !== "matched");
  const matched = lines.filter((l) => l.state === "matched");
  const editable = canWork && !approved;
  const bal = (c: number) => money(isCard ? -c : c, { decimals: true });

  return (
    <div className="space-y-5">
      <Card>
        <div className="grid grid-cols-2 lg:grid-cols-7 divide-y lg:divide-y-0 lg:divide-x divide-line">
          {[
            ["Statement balance", bal(s.statementBalance)],
            ["Book balance", bal(s.bookBalance)],
            ["Outstanding items", bal(s.outstanding)],
            ["Difference", money(s.difference, { decimals: true })],
            ["Matched", String(s.matched)],
            ["Unmatched", String(s.unmatched + s.suggested)],
            ["Duplicates", String(s.duplicates)],
          ].map(([k, v]) => (
            <div key={k} className="px-5 py-4">
              <div className="text-[12px] text-muted">{k}</div>
              <div className={cn("text-[18px] font-semibold tabular mt-0.5", k === "Difference" && (s.difference === 0 ? "text-ok-600" : "text-crit-600"))}>{v}</div>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-line flex flex-col sm:flex-row sm:items-center gap-3 justify-between bg-surface-2 rounded-b-[var(--radius-card)]">
          <div className="text-[13px] flex items-center gap-2">
            {approved ? <Lock className="size-4 text-ok-600" /> : s.canApprove ? <CheckCircle2 className="size-4 text-ok-600" /> : <CircleAlert className="size-4 text-warn-500" />}
            <span className="font-medium">Reconciliation status:</span> <StatusPill status={s.status} />
            {!approved && !s.canApprove && <span className="text-muted">Resolve the exceptions below to bring the difference to zero.</span>}
          </div>
          {!approved && canApprove && (
            <Button variant="primary" disabled={!s.canApprove || pending} onClick={() => setConfirm(true)}>Approve reconciliation</Button>
          )}
          {approved && canApprove && <Button variant="ghost" disabled={pending} onClick={() => act({ kind: "reopen" })}>Reopen</Button>}
          {!approved && !canApprove && s.canApprove && <span className="text-[12.5px] text-muted">Ready — a Fabrik reviewer approves the final reconciliation.</span>}
        </div>
      </Card>

      {!approved && (exceptions.length > 0 || s.duplicateBook.length > 0 || s.unreconciledBook.length > 0) && (
        <Notice tone="ai" icon={<Sparkles className="size-4" />}>Fabrik auto-matched {s.matched} lines.</Notice>
      )}

      {exceptions.length > 0 && (
        <Card>
          <CardHeader title="Statement lines without a match" />
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <tbody>
                {exceptions.map((l) => (
                  <ExceptionRow key={l.id} line={l} accounts={accounts} editable={editable} pending={pending} onAct={act} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {s.duplicateBook.length > 0 && (
        <Card>
          <CardHeader title="Possible duplicates in the books" icon={<Copy className="size-4" />} />
          <BookTable items={s.duplicateBook} action={editable ? (i) => <Button size="sm" disabled={pending} onClick={() => act({ kind: "book", txnId: i.transactionId, action: "duplicate" })}>Exclude duplicate</Button> : undefined} />
        </Card>
      )}

      {s.unreconciledBook.length > 0 && (
        <Card>
          <CardHeader title="In the books, not on this statement" icon={<Clock className="size-4" />} />
          <BookTable items={s.unreconciledBook} action={editable ? (i) => <Button size="sm" disabled={pending} onClick={() => act({ kind: "book", txnId: i.transactionId, action: "outstanding" })}>Mark outstanding</Button> : undefined} />
        </Card>
      )}

      {outstanding.length > 0 && (
        <Card>
          <CardHeader title="Outstanding items" />
          <BookTable items={outstanding} action={editable ? (i) => <Button size="sm" variant="ghost" disabled={pending} onClick={() => act({ kind: "book", txnId: i.transactionId, action: "clear" })}>Undo</Button> : undefined} />
        </Card>
      )}

      <Card>
        <CardHeader
          title={`Matched lines (${matched.length})`}
          action={<Button size="sm" variant="ghost" onClick={() => setShowMatched((x) => !x)}>{showMatched ? "Hide" : "Show"}</Button>}
        />
        {showMatched && (
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto border-t border-line">
            <table className="w-full text-[12.5px]">
              <tbody>
                {matched.map((l) => (
                  <tr key={l.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-1.5 text-muted tabular whitespace-nowrap w-28">{prettyDate(l.date)}</td>
                    <td className="px-3 py-1.5 font-mono truncate max-w-[420px]">{l.description}</td>
                    <td className="px-3 py-1.5 text-right tabular whitespace-nowrap">{money(l.amount, { decimals: true })}</td>
                    <td className="px-5 py-1.5 text-right"><span className="text-[11.5px] text-ok-600 tabular">{l.confidence != null ? `${Math.round(l.confidence * 100)}%` : "✓"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => { setConfirm(false); act({ kind: "approve" }); }}
        title="Approve this reconciliation?"
        description={`Difference ${money(s.difference, { decimals: true })}. Approval locks the reconciliation.`}
        confirmLabel="Approve"
      />
    </div>
  );
}

function ExceptionRow({ line, accounts, editable, pending, onAct }: { line: StatementLine; accounts: Props["accounts"]; editable: boolean; pending: boolean; onAct: (a: Parameters<typeof recAction>[1]) => void }) {
  const guess = /FEE|CHARGE/.test(line.description) ? accounts.find((a) => a.subtype === "bank_fees")?.id : /INTEREST/.test(line.description) ? accounts.find((a) => a.subtype === "other_income")?.id : undefined;
  const [acct, setAcct] = useState(guess ?? "");
  return (
    <tr className="border-t border-line align-top">
      <td className="px-5 py-3 text-muted tabular whitespace-nowrap w-28">{prettyDate(line.date)}</td>
      <td className="px-3 py-3">
        <div className="font-mono text-[12.5px]">{line.description}</div>
        {line.state === "suggested" && <div className="mt-1"><AiBadge label={`Suggested match · ${Math.round((line.confidence ?? 0) * 100)}%`} /></div>}
      </td>
      <td className="px-3 py-3 text-right tabular whitespace-nowrap font-medium">{money(line.amount, { decimals: true })}</td>
      <td className="px-5 py-3">
        {editable ? (
          line.state === "suggested" ? (
            <div className="flex gap-2 justify-end">
              <Button size="sm" disabled={pending} onClick={() => onAct({ kind: "accept", lineId: line.id })}>Accept</Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => onAct({ kind: "unmatch", lineId: line.id })}>Reject</Button>
            </div>
          ) : (
            <div className="flex gap-2 justify-end">
              <Select aria-label="Account for new transaction" value={acct} onChange={(e) => setAcct(e.target.value)} className="w-52">
                <option value="">Record as…</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
              <Button size="sm" disabled={!acct || pending} onClick={() => onAct({ kind: "create", lineId: line.id, accountId: acct })}>Record</Button>
            </div>
          )
        ) : (
          <Badge tone="warn">Unmatched</Badge>
        )}
      </td>
    </tr>
  );
}

function BookTable({ items, action }: { items: BookItemView[]; action?: (i: BookItemView) => React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <tbody>
          {items.map((i) => (
            <tr key={i.transactionId} className="border-t border-line">
              <td className="px-5 py-2.5 text-muted tabular whitespace-nowrap w-28">{prettyDate(i.date)}</td>
              <td className="px-3 py-2.5">
                <div className="font-medium">{i.vendor}</div>
                <div className="font-mono text-[11.5px] text-muted">{i.description}</div>
              </td>
              <td className="px-3 py-2.5 text-right tabular whitespace-nowrap font-medium">{money(i.amount, { decimals: true })}</td>
              <td className="px-5 py-2.5 text-right">{action?.(i)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
