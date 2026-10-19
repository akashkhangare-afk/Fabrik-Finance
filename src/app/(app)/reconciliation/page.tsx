import Link from "next/link";
import { ArrowRight, Scale } from "lucide-react";
import { requireCtx } from "@/server/auth/session";
import { recsForPeriod, periodLabel } from "@/server/services/close";
import { addMonths, periodOf, today } from "@/lib/dates";
import { money } from "@/lib/format";
import { Card, EmptyState, PageHeader, StatusPill, Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

export const metadata = { title: "Reconciliation" };

export default async function ReconciliationPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const last = addMonths(periodOf(today()), -1);
  const period = sp.period && /^\d{4}-\d{2}$/.test(sp.period) ? sp.period : last;
  const recs = recsForPeriod(ctx, period);
  const periods = [0, -1, -2].map((o) => addMonths(last, o));
  return (
    <div>
      <PageHeader title="Reconciliation" />
      <div className="flex gap-1 mb-5">
        {periods.map((p) => (
          <Link key={p} href={`/reconciliation?period=${p}`} className={cn("h-8 px-3 rounded-lg text-[13px] font-medium inline-flex items-center", p === period ? "bg-ink text-white" : "text-ink-2 hover:bg-sunken")}>{periodLabel(p)}</Link>
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {recs.map(({ bank, rec, summary }) => (
          <Card key={bank.id} className="flex flex-col">
            <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted">{bank.kind === "credit_card" ? "Credit card" : bank.kind}</div>
                <h2 className="text-[15.5px] font-semibold mt-0.5">{bank.name} ••••{bank.mask}</h2>
              </div>
              {summary ? <StatusPill status={summary.status} /> : <Badge>No statement</Badge>}
            </div>
            {rec && summary ? (
              <>
                <div className="px-5 grid grid-cols-3 gap-3 text-[13px]">
                  <div><div className="text-muted text-[12px]">Statement balance</div><div className="font-semibold tabular">{money(summary.statementBalance, { decimals: true })}</div></div>
                  <div><div className="text-muted text-[12px]">Book balance</div><div className="font-semibold tabular">{money(summary.adjustedBookBalance, { decimals: true })}</div></div>
                  <div><div className="text-muted text-[12px]">Difference</div><div className={cn("font-semibold tabular", summary.difference !== 0 ? "text-crit-600" : "text-ok-600")}>{money(summary.difference, { decimals: true })}</div></div>
                </div>
                <div className="px-5 mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-muted">
                  <span><b className="text-ink tabular">{summary.matched}</b> matched</span>
                  <span><b className={cn("tabular", summary.unmatched + summary.suggested ? "text-warn-700" : "text-ink")}>{summary.unmatched + summary.suggested}</b> unmatched</span>
                  <span><b className={cn("tabular", summary.duplicates ? "text-warn-700" : "text-ink")}>{summary.duplicates}</b> duplicates</span>
                  <span><b className="text-ink tabular">{summary.unreconciledBook.length}</b> book-only items</span>
                </div>
                <div className="mt-auto px-5 py-3 border-t border-line mt-4">
                  <Link href={`/reconciliation/${rec.id}`} className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-700 hover:underline">{rec.status === "approved" ? "View reconciliation" : "Open workspace"} <ArrowRight className="size-3.5" /></Link>
                </div>
              </>
            ) : (
              <EmptyState icon={<Scale className="size-5" />} title="Statement not received" description="Upload the bank statement in Documents to start this reconciliation." />
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
