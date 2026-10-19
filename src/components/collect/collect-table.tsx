"use client";

import { useEffect, useState, useTransition } from "react";
import { Mail, Sparkles } from "lucide-react";
import type { CollectionReminder } from "@/lib/types";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { prettyDate, prettyDateTime } from "@/lib/dates";
import { approveReminder, discardReminder, draftReminder } from "@/app/actions/app";
import { AiBadge, Button, Card, EmptyState, Field, Input, Notice, StatusPill, Textarea } from "@/components/ui/primitives";
import { Drawer, useToast } from "@/components/ui/client";

interface Row {
  id: string;
  customer: string;
  contact?: string;
  email?: string;
  number: string;
  issueDate: string;
  dueDate: string;
  amount: number;
  open: number;
  daysOverdue: number;
  status: string;
  memo?: string;
  reminders: CollectionReminder[];
}

export function CollectTable({ rows, openId, canDraft, canApprove, demo }: { rows: Row[]; openId?: string; canDraft: boolean; canApprove: boolean; demo: boolean }) {
  const [open, setOpen] = useState(openId);
  useEffect(() => setOpen(openId), [openId]);
  const inv = rows.find((r) => r.id === open);
  if (!rows.length) return <Card><EmptyState title="No open invoices" /></Card>;
  return (
    <>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-[12px] text-muted text-left bg-surface-2 border-b border-line whitespace-nowrap">
                <th className="px-5 py-2.5 font-medium">Customer</th>
                <th className="px-3 py-2.5 font-medium">Invoice #</th>
                <th className="px-3 py-2.5 font-medium">Invoice date</th>
                <th className="px-3 py-2.5 font-medium">Due date</th>
                <th className="px-3 py-2.5 font-medium text-right">Amount</th>
                <th className="px-3 py-2.5 font-medium text-right">Outstanding</th>
                <th className="px-3 py-2.5 font-medium text-right">Days overdue</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-5 py-2.5 font-medium text-right">Fabrik recommends</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const sent = r.reminders.filter((m) => m.status === "sent").at(-1);
                return (
                  <tr key={r.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                    <td className="px-5 py-2.5 font-medium whitespace-nowrap">{r.customer}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{r.number}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap tabular text-ink-2">{prettyDate(r.issueDate)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap tabular text-ink-2">{prettyDate(r.dueDate)}</td>
                    <td className="px-3 py-2.5 text-right tabular whitespace-nowrap">{money(r.amount)}</td>
                    <td className="px-3 py-2.5 text-right tabular font-medium whitespace-nowrap">{money(r.open)}</td>
                    <td className={cn("px-3 py-2.5 text-right tabular", r.daysOverdue > 30 && "text-crit-600 font-medium")}>{r.daysOverdue || "—"}</td>
                    <td className="px-3 py-2.5"><StatusPill status={r.status} /></td>
                    <td className="px-5 py-2.5 text-right whitespace-nowrap">
                      {sent ? (
                        <span className="text-[12px] text-muted">Reminder sent {prettyDate(sent.sentAt!.slice(0, 10))}</span>
                      ) : r.daysOverdue > 0 && canDraft ? (
                        <Button size="sm" variant="secondary" onClick={() => setOpen(r.id)}><Sparkles className="size-3.5 text-ai-600" /> Send reminder</Button>
                      ) : (
                        <span className="text-[12px] text-subtle">{r.daysOverdue > 0 ? "Reminder" : "No action"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {inv && <ReminderDrawer inv={inv} onClose={() => setOpen(undefined)} canApprove={canApprove} demo={demo} />}
    </>
  );
}

function ReminderDrawer({ inv, onClose, canApprove, demo }: { inv: Row; onClose: () => void; canApprove: boolean; demo: boolean }) {
  const draft = inv.reminders.filter((r) => r.status === "draft").at(-1);
  const [subject, setSubject] = useState(draft?.subject ?? "");
  const [body, setBody] = useState(draft?.body ?? "");
  const [pending, start] = useTransition();
  const toast = useToast();
  useEffect(() => {
    setSubject(draft?.subject ?? "");
    setBody(draft?.body ?? "");
  }, [draft?.id, draft?.subject, draft?.body]);
  return (
    <Drawer
      open
      onClose={onClose}
      width={640}
      title={`Reminder · ${inv.customer}`}
      subtitle={`${inv.number} · ${money(inv.open, { decimals: true })} · ${inv.daysOverdue} days past due`}
      footer={
        draft ? (
          <>
            <Button variant="ghost" disabled={pending} onClick={() => start(async () => { await discardReminder(inv.id, draft.id); })}>Discard</Button>
            {canApprove ? (
              <Button variant="primary" disabled={pending || !subject.trim() || !body.trim()} onClick={() => start(async () => {
                const r = await approveReminder(inv.id, draft.id, subject, body);
                toast(r.ok ? { tone: "success", title: r.message ?? "Sent", body: `To ${inv.email ?? inv.customer}` } : { tone: "error", title: r.error });
                if (r.ok) onClose();
              })}>
                <Mail className="size-4" /> Approve &amp; send
              </Button>
            ) : (
              <span className="text-[12.5px] text-muted">An owner or finance user approves reminders.</span>
            )}
          </>
        ) : undefined
      }
    >
      {!draft ? (
        <div className="text-center py-10">
          <div className="size-12 rounded-2xl bg-ai-50 text-ai-600 flex items-center justify-center mx-auto"><Sparkles className="size-5" /></div>
          <h3 className="mt-3 text-[16px] font-semibold">Generate a professional reminder</h3>
          <Button variant="ai" className="mt-5" disabled={pending} onClick={() => start(async () => {
            const r = await draftReminder(inv.id);
            if (!r.ok) toast({ tone: "error", title: r.error });
          })}>
            {pending ? "Drafting…" : "Generate reminder"}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <AiBadge label="AI draft — review before sending" />
          <Field label="To"><Input value={`${inv.contact ?? ""} <${inv.email ?? "no email on file"}>`} disabled /></Field>
          <Field label="Subject"><Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} /></Field>
          <Field label="Message"><Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={14} className="font-normal" /></Field>
          {demo && <Notice tone="info">Demo: approved emails are delivered to the development outbox, not to the customer.</Notice>}
        </div>
      )}
      {inv.reminders.filter((r) => r.status === "sent").length > 0 && (
        <div className="mt-6">
          <h3 className="text-[13px] font-semibold mb-2">Sent reminders</h3>
          {inv.reminders.filter((r) => r.status === "sent").map((r) => (
            <div key={r.id} className="rounded-lg border border-line px-3 py-2 text-[12.5px] mb-2">
              <div className="font-medium">{r.subject}</div>
              <div className="text-muted">Sent {prettyDateTime(r.sentAt!)} UTC</div>
            </div>
          ))}
        </div>
      )}
    </Drawer>
  );
}
