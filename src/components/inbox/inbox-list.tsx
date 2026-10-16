"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, Check, FileText, HandCoins, Landmark, MessageSquare, Plug, Receipt, Sparkles, Upload, CalendarCheck } from "lucide-react";
import type { InboxItem, InboxItemType } from "@/lib/types";
import { cn } from "@/lib/cn";
import { money as fmtMoney } from "@/lib/format";
import { prettyDate } from "@/lib/dates";

const money = (c: number) => fmtMoney(c, { decimals: true });
const prettyDateSafe = (d: string) => prettyDate(d, { year: true });
import { respondInbox, dismissInboxItem, decideBill, uploadDocuments, uploadSampleInvoice, confirmDocMatch } from "@/app/actions/app";
import { Badge, Button, Card, ConfidenceBar, Input, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/client";

export interface InboxView {
  id: string;
  type: InboxItemType;
  title: string;
  body: string;
  status: InboxItem["status"];
  priority: InboxItem["priority"];
  options?: InboxItem["options"];
  createdAt: string;
  from: string;
  fromAi: boolean;
  response?: { label?: string; comment?: string; by: string; at: string };
  related?: InboxItem["related"];
  context?:
    | { kind: "transaction"; vendor: string; description: string; amount: number; date: string; account: string; txnId: string }
    | { kind: "bill"; vendor: string; number: string; amount: number; dueDate: string; category: string; documentId?: string }
    | { kind: "invoice"; customer: string; number: string; amount: number; dueDate: string; daysOverdue: number; invoiceId: string }
    | { kind: "funding"; programId: string };
}

const TYPE_META: Partial<Record<InboxItemType, { label: string; icon: typeof FileText }>> = {
  transaction_clarification: { label: "Transaction", icon: Sparkles },
  missing_document: { label: "Missing document", icon: FileText },
  missing_receipt: { label: "Missing receipt", icon: FileText },
  bill_approval: { label: "Bill approval", icon: Receipt },
  overdue_invoice: { label: "Overdue invoice", icon: HandCoins },
  funding_info_request: { label: "Funding", icon: Landmark },
  accountant_question: { label: "Accountant question", icon: MessageSquare },
  monthly_close_question: { label: "Monthly close", icon: CalendarCheck },
  integration_issue: { label: "Integration", icon: Plug },
};

export function InboxList({ items, canUpload, canApproveBills, demo }: { items: InboxView[]; canUpload: boolean; canApproveBills: boolean; demo: boolean }) {
  return (
    <div className="space-y-4">
      {items.map((i) => (
        <InboxCard key={i.id} item={i} canUpload={canUpload} canApproveBills={canApproveBills} demo={demo} />
      ))}
    </div>
  );
}

function useAct() {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast({ tone: "success", title: r.message ?? "Done" });
      else toast({ tone: "error", title: r.error ?? "Something went wrong" });
      router.refresh();
    });
  return { pending, act };
}

function InboxCard({ item, canUpload, canApproveBills, demo }: { item: InboxView; canUpload: boolean; canApproveBills: boolean; demo: boolean }) {
  const meta = TYPE_META[item.type] ?? { label: "Question", icon: MessageSquare };
  const Icon = meta.icon;
  const done = item.status !== "open";
  return (
    <Card className={cn("animate-in", done && "opacity-90")}>
      <div className="px-5 pt-4 pb-1 flex items-start gap-3">
        <div className={cn("size-9 rounded-xl flex items-center justify-center shrink-0", item.fromAi ? "bg-ai-50 text-ai-600" : "bg-brand-50 text-brand-700")}>
          <Icon className="size-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted">{meta.label}</span>
            {item.priority === "high" && !done && <Badge tone="risk">Due soon</Badge>}
            {done && <Badge tone="ok"><Check className="size-3" /> {item.status === "dismissed" ? "Dismissed" : "Answered"}</Badge>}
          </div>
          <h3 className="text-[15.5px] font-semibold mt-0.5">{item.title}</h3>
          <div className="text-[12px] text-muted mt-0.5 flex items-center gap-1">
            {item.fromAi ? <Bot className="size-3" /> : null}
            {item.from} · {item.createdAt} UTC
          </div>
        </div>
      </div>
      <div className="px-5 pb-5 pt-2">
        {item.body && <p className="text-[14px] text-ink-2 leading-relaxed">{item.body}</p>}
        {item.context?.kind === "transaction" && <TxnContext c={item.context} />}
        {done ? (
          item.response && (
            <div className="mt-3 rounded-lg bg-surface-2 border border-line px-3 py-2 text-[13px]">
              <span className="font-medium">{item.response.label ?? "Response"}</span>
              {item.response.comment && <span className="text-ink-2"> — {item.response.comment}</span>}
              <div className="text-[11.5px] text-muted mt-0.5">{item.response.by} · {item.response.at} UTC</div>
            </div>
          )
        ) : item.type === "transaction_clarification" ? (
          <ClarifyForm item={item} />
        ) : item.type === "bill_approval" ? (
          <BillForm item={item} canApprove={canApproveBills} />
        ) : item.type === "missing_document" || item.type === "missing_receipt" ? (
          <MissingDocForm item={item} canUpload={canUpload} demo={demo} />
        ) : item.type === "overdue_invoice" && item.context?.kind === "invoice" ? (
          <OverdueForm item={item} />
        ) : item.type === "funding_info_request" ? (
          <FundingForm item={item} />
        ) : (
          <TextAnswer item={item} />
        )}
      </div>
    </Card>
  );
}

function TxnContext({ c }: { c: Extract<NonNullable<InboxView["context"]>, { kind: "transaction" }> }) {
  return (
    <div className="mt-3 flex items-center gap-4 rounded-xl border border-line bg-surface-2 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[12.5px] text-ink truncate">{c.description}</div>
        <div className="text-[12px] text-muted mt-0.5">{prettyDateSafe(c.date)} · {c.account}</div>
      </div>
      <div className="text-[17px] font-semibold tabular">{money(c.amount)}</div>
    </div>
  );
}

function ClarifyForm({ item }: { item: InboxView }) {
  const { pending, act } = useAct();
  const [other, setOther] = useState(false);
  const [comment, setComment] = useState("");
  const opts = (item.options ?? []).filter((o) => o.value !== "other");
  const hasConf = opts.some((o) => o.confidence);
  return (
    <div className="mt-4">
      {hasConf && <div className="text-[12px] font-medium text-ai-600 mb-2 flex items-center gap-1"><Sparkles className="size-3.5" /> Fabrik thinks</div>}
      <div className="grid gap-2 sm:grid-cols-2">
        {opts.map((o) => (
          <button key={o.value} disabled={pending} onClick={() => act(() => respondInbox(item.id, { value: o.value, label: o.label, comment: comment || undefined }))} className="group text-left rounded-xl border border-line bg-surface px-3.5 py-2.5 hover:border-brand-300 hover:bg-brand-50/40 transition disabled:opacity-60">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13.5px] font-medium">{o.label}</span>
              {o.confidence != null && <span className="text-[12px] text-muted tabular">{Math.round(o.confidence * 100)}%</span>}
            </div>
            {o.confidence != null && <ConfidenceBar value={o.confidence} className="mt-2" />}
          </button>
        ))}
        <button onClick={() => setOther((x) => !x)} className={cn("text-left rounded-xl border border-dashed px-3.5 py-2.5 text-[13.5px] font-medium transition", other ? "border-brand-500 bg-brand-50/40" : "border-line-strong text-ink-2 hover:border-brand-300")}>Something else / add a comment</button>
      </div>
      {other && (
        <div className="mt-3 space-y-2">
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Tell us what it was for — e.g. 'Paid Jensen Trucking for hauling seed'" rows={3} maxLength={2000} />
          <div className="flex justify-end">
            <Button variant="primary" disabled={!comment.trim() || pending} onClick={() => act(() => respondInbox(item.id, { comment }))}>Send answer</Button>
          </div>
        </div>
      )}
      <p className="text-[11.5px] text-subtle mt-3">Your answer goes straight back into processing. Fabrik remembers it for similar transactions.</p>
    </div>
  );
}

function BillForm({ item, canApprove }: { item: InboxView; canApprove: boolean }) {
  const { pending, act } = useAct();
  const [comment, setComment] = useState("");
  const c = item.context?.kind === "bill" ? item.context : undefined;
  return (
    <div className="mt-4 space-y-3">
      {c && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3 text-[13px]">
          <div><div className="text-muted text-[12px]">Vendor</div><div className="font-medium">{c.vendor}</div></div>
          <div><div className="text-muted text-[12px]">Bill #</div><div className="font-medium">{c.number}</div></div>
          <div><div className="text-muted text-[12px]">Due</div><div className="font-medium">{prettyDateSafe(c.dueDate)}</div></div>
          <div><div className="text-muted text-[12px]">Amount</div><div className="font-semibold tabular">{money(c.amount)}</div></div>
        </div>
      )}
      {canApprove ? (
        <>
          <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional note for your bookkeeper" />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={pending} onClick={() => act(() => decideBill(item.related!.id, "approve", comment || undefined))}>Approve</Button>
            <Button disabled={pending} onClick={() => act(() => decideBill(item.related!.id, "request_review", comment || undefined))}>Request review</Button>
            <Button variant="ghost" disabled={pending} onClick={() => act(() => decideBill(item.related!.id, "reject", comment || undefined))}>Reject</Button>
            {c?.documentId && <a href={`/api/v1/documents/${c.documentId}/file`} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1.5 text-[13px] text-brand-700 hover:underline"><FileText className="size-4" /> View invoice</a>}
          </div>
          <p className="text-[11.5px] text-subtle">Approving doesn&apos;t pay the bill — payment stays in your bank. Approved bills feed your cash forecast.</p>
        </>
      ) : (
        <p className="text-[13px] text-muted">A Business Owner or Client Finance User approves bills.</p>
      )}
    </div>
  );
}

function MissingDocForm({ item, canUpload, demo }: { item: InboxView; canUpload: boolean; demo: boolean }) {
  const { pending, act } = useAct();
  const fileRef = useRef<HTMLInputElement>(null);
  const txnId = item.related?.type === "transaction" ? item.related.id : undefined;
  const isJd = /john deere/i.test(item.title);
  const matchFirst = async (docId: string, candidates: { transactionId: string; confidence: number }[]) => {
    const hit = candidates.find((c) => c.transactionId === txnId);
    if (hit) {
      const m = await confirmDocMatch(docId, hit.transactionId);
      return m.ok ? { ok: true, message: `Matched (${Math.round(hit.confidence * 100)}% confidence). ${m.message ?? ""}` } : m;
    }
    return { ok: true, message: "Uploaded — no confident match yet. Your bookkeeper will link it." };
  };
  if (!canUpload) return <p className="mt-3 text-[13px] text-muted">You can view this request; uploading needs document permissions.</p>;
  return (
    <div className="mt-4 rounded-xl border-2 border-dashed border-line-strong bg-surface-2 px-4 py-5 text-center">
      <Upload className="size-5 mx-auto text-muted" />
      <div className="text-[13.5px] font-medium mt-2">Upload the document — Fabrik will extract it and match it automatically</div>
      <div className="text-[12px] text-muted mt-0.5">PDF, PNG or JPEG · up to 15 MB</div>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const fd = new FormData();
          fd.append("files", f);
          act(async () => {
            const r = await uploadDocuments(fd);
            if (!r.ok) return r;
            return matchFirst(r.data![0]!.id, r.data![0]!.candidates);
          });
        }}
      />
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <Button variant="primary" disabled={pending} onClick={() => fileRef.current?.click()}>{pending ? "Processing…" : "Choose file"}</Button>
        {demo && isJd && (
          <Button variant="ai" disabled={pending} onClick={() => act(async () => {
            const r = await uploadSampleInvoice();
            if (!r.ok) return r;
            return matchFirst(r.data!.id, r.data!.candidates);
          })}>
            <Sparkles className="size-4" /> Use sample JD invoice
          </Button>
        )}
        <Button variant="ghost" disabled={pending} onClick={() => act(() => respondInbox(item.id, { comment: "I don't have this document" }))}>I don&apos;t have it</Button>
      </div>
    </div>
  );
}

function OverdueForm({ item }: { item: InboxView }) {
  const { pending, act } = useAct();
  const c = item.context as Extract<NonNullable<InboxView["context"]>, { kind: "invoice" }>;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <div className="text-[13px] text-muted">{c.customer} · {c.number} · <span className="font-semibold text-ink tabular">{money(c.amount)}</span> · {c.daysOverdue} days past due</div>
      <div className="flex-1" />
      <Link href={`/collect?invoice=${c.invoiceId}`} className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700"><Sparkles className="size-4" /> Draft a reminder</Link>
      <Button variant="ghost" disabled={pending} onClick={() => act(() => dismissInboxItem(item.id))}>Not now</Button>
    </div>
  );
}

function FundingForm({ item }: { item: InboxView }) {
  const { pending, act } = useAct();
  const [v, setV] = useState("");
  const programId = item.related?.id;
  return (
    <div className="mt-4 flex flex-wrap items-end gap-2">
      <div className="w-48">
        <label htmlFor={`f-${item.id}`} className="text-[12px] text-muted">Base acres</label>
        <Input id={`f-${item.id}`} inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder="e.g. 2,180" />
      </div>
      <Button variant="primary" disabled={!v.trim() || pending} onClick={() => act(() => respondInbox(item.id, { value: v, label: `${v} base acres` }))}>Save to profile</Button>
      {programId && <Link href={`/funding/${programId}`} className="text-[13px] text-brand-700 hover:underline ml-2 mb-2">View program</Link>}
    </div>
  );
}

function TextAnswer({ item }: { item: InboxView }) {
  const { pending, act } = useAct();
  const [v, setV] = useState("");
  return (
    <div className="mt-4 space-y-2">
      <Textarea value={v} onChange={(e) => setV(e.target.value)} rows={3} placeholder="Type your answer" maxLength={2000} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" disabled={pending} onClick={() => act(() => dismissInboxItem(item.id))}>Dismiss</Button>
        <Button variant="primary" disabled={!v.trim() || pending} onClick={() => act(() => respondInbox(item.id, { comment: v }))}>Send</Button>
      </div>
    </div>
  );
}
