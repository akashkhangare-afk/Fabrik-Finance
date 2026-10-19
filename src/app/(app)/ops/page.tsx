import { Check, X } from "lucide-react";
import { requireCtx } from "@/server/auth/session";
import { opsDashboard, syncWorkQueue } from "@/server/services/ops";
import { showExtras } from "@/server/config";
import { Badge, Card, CardHeader, KpiCard, PageHeader } from "@/components/ui/primitives";
import { StaffOnly, TableWrap, fmtMinutes, pctText, td, tdNum, th, thNum, tr } from "@/components/ops/shared";
import { count } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata = { title: "Fabrik Operations" };

export default async function OpsDashboardPage() {
  const ctx = await requireCtx();
  if (!ctx.isStaff) return <StaffOnly />;
  syncWorkQueue(ctx);
  const d = opsDashboard(ctx);
  const missed = d.metrics.filter((m) => !m.ok).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Fabrik Operations" />

      <section aria-label="Portfolio KPIs" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <KpiCard label="Active clients" value={count(d.activeClients)} href="/ops/clients" />
        <KpiCard label="Books current" value={count(d.booksCurrent)} href="/ops/clients?health=current" />
        <KpiCard label="Needs attention" value={count(d.needsAttention)} href="/ops/clients?health=needs_attention" />
        <KpiCard label="At risk" value={count(d.atRisk)} href="/ops/clients?health=at_risk" />
        <KpiCard label="AI processed" value={count(d.aiProcessed)} hint="last 30 days" />
        <KpiCard label="Human reviewed" value={count(d.humanReviewed)} href="/ops/review" hint="last 30 days" />
        <KpiCard label="Client questions" value={count(d.clientQuestions)} hint="last 30 days" />
        <KpiCard label="Automation rate" value={pctText(d.automationRate)} />
        <KpiCard label="Human minutes per client per month" value={fmtMinutes(d.humanMinutesPerClient)} hint={`${fmtMinutes(d.humanMinutesPer100)} per 100 transactions`} className="col-span-2" />
      </section>

      {showExtras() && (
        <Card>
          <CardHeader title="Critical metrics vs targets" action={missed ? <Badge tone="warn">{missed} below target</Badge> : <Badge tone="ok">All on target</Badge>} />
          <TableWrap>
            <thead>
              <tr>
                <th className={th}>Metric</th>
                <th className={thNum}>Current</th>
                <th className={thNum}>Target</th>
                <th className={cn(th, "text-right")}>Status</th>
              </tr>
            </thead>
            <tbody>
              {d.metrics.map((m) => (
                <tr key={m.key} className={tr}>
                  <td className={cn(td, "text-ink font-medium")}>{m.label}</td>
                  <td className={cn(tdNum, "font-semibold")}>{m.format === "pct" ? `${(m.value * 100).toFixed(1)}%` : `${m.value.toFixed(1)} days`}</td>
                  <td className={cn(tdNum, "text-muted")}>{m.target}</td>
                  <td className={cn(td, "text-right")}>
                    {m.ok ? (
                      <Badge tone="ok"><Check className="size-3" aria-hidden /> On target</Badge>
                    ) : (
                      <Badge tone="risk"><X className="size-3" aria-hidden /> Miss</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <div className="h-2" />
        </Card>
      )}
    </div>
  );
}
