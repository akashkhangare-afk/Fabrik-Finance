"use client";

import { useState, useTransition } from "react";
import { FileText, Paperclip } from "lucide-react";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { prettyDate } from "@/lib/dates";
import { decideBill } from "@/app/actions/app";
import { Button, Card, EmptyState, StatusPill, pillListClass, pillClass, pillCountClass } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/client";

interface Row {
  id: string;
  vendor: string;
  number: string;
  amount: number;
  issueDate: string;
  dueDate: string;
  category: string;
  status: string;
  overdue: boolean;
  source: string;
  documentId?: string;
  lastAction?: string;
}

const TABS = [
  ["open", "Open"],
  ["all", "All"],
] as const;

export function BillsTable({ bills, canApprove }: { bills: Row[]; canApprove: boolean }) {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("open");
  const [pending, start] = useTransition();
  const toast = useToast();
  const inTab = (k: (typeof TABS)[number][0], b: Row) =>
    k === "all" || (b.status !== "paid" && b.status !== "rejected");
  const rows = bills.filter((b) => inTab(tab, b));
  const act = (id: string, a: "approve" | "reject" | "request_review") =>
    start(async () => {
      const r = await decideBill(id, a);
      toast(r.ok ? { tone: "success", title: r.message ?? "Done" } : { tone: "error", title: r.error });
    });
  return (
    <Card className="overflow-hidden">
      <div className="px-4 pt-4 pb-3">
        <div className={pillListClass} role="tablist">
          {TABS.map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={pillClass(tab === k)}>
              {l} <span className={pillCountClass(tab === k)}>{bills.filter((b) => inTab(k, b)).length}</span>
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No bills here" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-[12px] text-muted text-left bg-surface-2 border-y border-line whitespace-nowrap">
                <th className="px-5 py-2.5 font-medium">Vendor</th>
                <th className="px-3 py-2.5 font-medium">Invoice #</th>
                <th className="px-3 py-2.5 font-medium text-right">Amount</th>
                <th className="px-3 py-2.5 font-medium">Invoice date</th>
                <th className="px-3 py-2.5 font-medium">Due date</th>
                <th className="px-3 py-2.5 font-medium">Category</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-5 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="px-5 py-2.5 font-medium whitespace-nowrap">
                    {b.vendor}
                    {b.source === "document" && <Paperclip className="inline size-3.5 ml-1.5 text-subtle" aria-label="From an uploaded document" />}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {b.documentId ? (
                      <a href={`/api/v1/documents/${b.documentId}/file`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-700 hover:underline"><FileText className="size-3.5" />{b.number}</a>
                    ) : (
                      b.number
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular font-medium whitespace-nowrap">{money(b.amount, { decimals: true })}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-ink-2 tabular">{prettyDate(b.issueDate)}</td>
                  <td className={cn("px-3 py-2.5 whitespace-nowrap tabular", b.overdue ? "text-crit-600 font-medium" : "text-ink-2")}>{prettyDate(b.dueDate)}{b.overdue && " · overdue"}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-ink-2">{b.category}</td>
                  <td className="px-3 py-2.5"><StatusPill status={b.status} /></td>
                  <td className="px-5 py-2.5 text-right whitespace-nowrap">
                    {canApprove && b.status !== "approved" && b.status !== "paid" && b.status !== "rejected" ? (
                      <div className="inline-flex gap-1">
                        <Button size="sm" disabled={pending} onClick={() => act(b.id, "approve")}>Approve</Button>
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(b.id, "request_review")}>Request review</Button>
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(b.id, "reject")}>Reject</Button>
                      </div>
                    ) : (
                      <span className="text-[12px] text-muted">{b.status === "approved" ? "Approved" : "—"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
