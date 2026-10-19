import { notFound } from "next/navigation";
import { requireCtx, hasPerm } from "@/server/auth/session";
import { recDetail, periodLabel } from "@/server/services/close";
import { db } from "@/server/db/store";
import { PageHeader, StatusPill, LinkButton } from "@/components/ui/primitives";
import { RecWorkspace } from "@/components/reconciliation/workspace";
import { prettyDateTime } from "@/lib/dates";

export const metadata = { title: "Reconciliation" };

export default async function RecPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  let d;
  try {
    d = recDetail(ctx, id);
  } catch {
    notFound();
  }
  const accounts = db().glAccounts.filter((a) => a.orgId === ctx.org.id && (a.type === "expense" || a.type === "income")).map((a) => ({ id: a.id, name: a.name, subtype: a.subtype }));
  const txnMeta = new Map(db().transactions.filter((t) => t.orgId === ctx.org.id).map((t) => [t.id, t]));
  return (
    <div>
      <PageHeader
        eyebrow={<a href={`/reconciliation?period=${d.rec.period}`} className="hover:underline">← Reconciliation · {periodLabel(d.rec.period)}</a>}
        title={`${d.bank.name} ••••${d.bank.mask}`}
        badge={<StatusPill status={d.summary.status} />}
        description={`Statement ending ${d.rec.statementDate}${d.preparedBy ? ` · prepared by ${d.preparedBy}` : ""}${d.approvedBy ? ` · approved by ${d.approvedBy} ${d.rec.approvedAt ? prettyDateTime(d.rec.approvedAt) : ""}` : ""}`}
        actions={d.statementDoc ? <LinkButton href={`/documents?doc=${d.statementDoc.id}`}>View statement</LinkButton> : undefined}
      />
      <RecWorkspace
        recId={d.rec.id}
        approved={d.rec.status === "approved"}
        isCard={d.bank.kind === "credit_card"}
        summary={{ ...d.summary, unreconciledBook: d.summary.unreconciledBook.map((i) => ({ ...i, vendor: txnMeta.get(i.transactionId)?.ai?.normalizedVendor ?? i.description })), duplicateBook: d.summary.duplicateBook.map((i) => ({ ...i, vendor: txnMeta.get(i.transactionId)?.ai?.normalizedVendor ?? i.description })) }}
        lines={d.rec.lines}
        outstanding={d.items.filter((i) => d.rec.outstandingTxnIds.includes(i.transactionId))}
        accounts={accounts}
        canWork={hasPerm(ctx, "reconciliation:work")}
        canApprove={hasPerm(ctx, "reconciliation:approve")}
      />
    </div>
  );
}
