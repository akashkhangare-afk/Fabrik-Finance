import { requireCtx, hasPerm } from "@/server/auth/session";
import { listBills } from "@/server/services/workflow";
import { KpiCard, PageHeader } from "@/components/ui/primitives";
import { BillsTable } from "@/components/bills/bills-table";
import { moneyCompact } from "@/lib/format";

export const metadata = { title: "Bills" };

export default async function BillsPage() {
  const ctx = await requireCtx();
  const { bills, summary } = listBills(ctx);
  return (
    <div>
      <PageHeader title="Bills" />
      <section className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <KpiCard label="Outstanding" value={moneyCompact(summary.outstanding)} hint={`${bills.filter((b) => b.status !== "paid" && b.status !== "rejected").length} open bills`} />
        <KpiCard label="Due this week" value={moneyCompact(summary.dueThisWeek)} />
        <KpiCard label="Overdue" value={moneyCompact(summary.overdue)} className={summary.overdue ? "border-risk-600/25" : undefined} />
      </section>
      <BillsTable
        bills={bills.map((b) => ({ id: b.id, vendor: b.vendor, number: b.number, amount: b.amount, issueDate: b.issueDate, dueDate: b.dueDate, category: b.category, status: b.status, overdue: b.overdue, source: b.source, documentId: b.document?.id, lastAction: b.history.at(-1)?.action }))}
        canApprove={hasPerm(ctx, "bills:approve")}
      />
    </div>
  );
}
