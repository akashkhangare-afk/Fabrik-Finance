import { requireCtx, hasPerm } from "@/server/auth/session";
import { listReceivables } from "@/server/services/workflow";
import { arAging } from "@/server/services/finance";
import { db } from "@/server/db/store";
import { Card, CardHeader, PageHeader, Notice } from "@/components/ui/primitives";
import { AgingBar } from "@/components/charts";
import { CollectTable } from "@/components/collect/collect-table";
import { moneyCompact } from "@/lib/format";

export const metadata = { title: "Collect" };

export default async function CollectPage({ searchParams }: { searchParams: Promise<{ invoice?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const rows = listReceivables(ctx);
  const a = arAging(ctx.org.id);
  const total = a.current + a.d1_30 + a.d31_60 + a.d60plus;
  const invoices = new Map(db().invoices.filter((i) => i.orgId === ctx.org.id).map((i) => [i.id, i]));
  return (
    <div>
      <PageHeader title="Collect" description="Accounts receivable from QuickBooks, with AI-drafted collection reminders. Nothing is sent without your approval." />
      <Card className="mb-6">
        <CardHeader title={`Outstanding AR · ${moneyCompact(total)}`} subtitle="Aging by days past due" />
        <div className="px-5 pb-5">
          <AgingBar buckets={[{ label: "Current", value: a.current, tone: "ok" }, { label: "1–30 days", value: a.d1_30, tone: "warn" }, { label: "31–60 days", value: a.d31_60, tone: "risk" }, { label: "60+ days", value: a.d60plus, tone: "crit" }]} />
        </div>
      </Card>
      <CollectTable
        rows={rows.map((r) => ({ id: r.id, customer: r.customer, contact: r.contact, email: r.email, number: r.number, issueDate: r.issueDate, dueDate: r.dueDate, amount: r.amount, open: r.open, daysOverdue: r.daysOverdue, status: r.status, memo: r.memo, reminders: invoices.get(r.id)!.reminders.map((m) => ({ ...m })) }))}
        openId={sp.invoice}
        canDraft={hasPerm(ctx, "collect:draft_reminder")}
        canApprove={hasPerm(ctx, "collect:approve_reminder")}
      />
      <Notice tone="neutral" className="mt-5" title="Human approval required">Fabrik drafts; you decide. Automated collection workflows and customer payments are outside the Expo MVP.</Notice>
    </div>
  );
}
