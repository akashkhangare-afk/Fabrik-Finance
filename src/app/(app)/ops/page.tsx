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

      {/* The north-star metric (PRD G§27) leads; client health and transaction flow follow as two groups. */}
      <section aria-label="North star" className="relative overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 text-white shadow-[var(--shadow-raised)] px-6 py-6 sm:px-8">
        <svg className="absolute inset-0 w-full h-full opacity-[0.08]" aria-hidden>
          <defs>
            <pattern id="ns-rows" width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(-12)">
              <path d="M0 13h26" stroke="white" strokeWidth="1.2" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#ns-rows)" />
        </svg>
        <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-brand-200">Human minutes per client per month</div>
            <div className="mt-2 text-[44px] leading-none font-semibold tracking-[-0.03em] tabular">{fmtMinutes(d.humanMinutesPerClient)}</div>
          </div>
          <div className="text-[13px] text-brand-100 tabular">{fmtMinutes(d.humanMinutesPer100)} per 100 transactions</div>
        </div>
      </section>

      <section aria-label="Client health" className="space-y-3">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-subtle">Clients</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="Active clients" value={count(d.activeClients)} href="/ops/clients" />
          <KpiCard label="Books current" value={count(d.booksCurrent)} href="/ops/clients?health=current" />
          <KpiCard label="Needs attention" value={count(d.needsAttention)} href="/ops/clients?health=needs_attention" />
          <KpiCard label="At risk" value={count(d.atRisk)} href="/ops/clients?health=at_risk" />
        </div>
      </section>

      <section aria-label="Transactions" className="space-y-3">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-subtle">Transactions</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="AI processed" value={count(d.aiProcessed)} hint="last 30 days" />
          <KpiCard label="Human reviewed" value={count(d.humanReviewed)} href="/ops/review" hint="last 30 days" />
          <KpiCard label="Client questions" value={count(d.clientQuestions)} hint="last 30 days" />
          <KpiCard label="Automation rate" value={pctText(d.automationRate)} />
        </div>
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
