import Link from "next/link";
import { ArrowRight, Check, Clock, Gauge, X } from "lucide-react";
import { requireCtx } from "@/server/auth/session";
import { opsDashboard, syncWorkQueue } from "@/server/services/ops";
import { db } from "@/server/db/store";
import { Badge, Card, CardHeader, KpiCard, LinkButton, PageHeader, StatusPill } from "@/components/ui/primitives";
import { OrgLink } from "@/components/ops/org-nav";
import { PRIORITY_RANK, PriorityBadge, StaffOnly, TableWrap, WORK_TYPE_LABEL, fmtMinutes, pctText, td, tdNum, th, thNum, tr } from "@/components/ops/shared";
import { count } from "@/lib/format";
import { monthLabel, relativeAge, today, prettyDate } from "@/lib/dates";
import { cn } from "@/lib/cn";

export const metadata = { title: "Fabrik Operations" };

export default async function OpsDashboardPage() {
  const ctx = await requireCtx();
  if (!ctx.isStaff) return <StaffOnly />;
  const work = syncWorkQueue(ctx);
  const d = opsDashboard(ctx);
  const data = db();
  const orgName = new Map(data.organizations.map((o) => [o.id, o.name]));
  const userName = new Map(data.users.map((u) => [u.id, u.name]));
  const top = work
    .filter((w) => w.status !== "done")
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.createdAt.localeCompare(b.createdAt))
    .slice(0, 5);
  const openCount = work.filter((w) => w.status !== "done").length;
  const maxTrend = Math.max(1, ...d.trend.map((t) => t.minutesPerClient));
  const missed = d.metrics.filter((m) => !m.ok).length;
  const flagged = d.perClient.filter((c) => c.health !== "current");
  const glance = [...flagged, ...d.perClient.filter((c) => c.health === "current")].slice(0, Math.max(10, flagged.length));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations Portal"
        title="Fabrik Operations"
        description={`Exceptions across ${count(d.activeClients)} active clients · ${prettyDate(today(), { year: true })}. Automation handles the routine — your team handles what needs judgment.`}
        actions={
          <>
            <LinkButton href="/ops/queue">Work queue</LinkButton>
            <LinkButton href="/ops/review" variant="primary">
              AI review queue <ArrowRight className="size-4" />
            </LinkButton>
          </>
        }
      />

      <div className="grid xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
        <section aria-label="Portfolio KPIs" className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Active clients" value={count(d.activeClients)} href="/ops/clients" hint="on Fabrik" />
          <KpiCard label="Books current" value={count(d.booksCurrent)} href="/ops/clients?health=current" hint={<span className="text-ok-600 font-medium">{pctText(d.activeClients ? d.booksCurrent / d.activeClients : 0)} of clients</span>} />
          <KpiCard label="Needs attention" value={count(d.needsAttention)} href="/ops/clients?health=needs_attention" hint={d.needsAttention ? <span className="text-warn-700 font-medium">close or connection open</span> : "none"} />
          <KpiCard label="At risk" value={count(d.atRisk)} href="/ops/clients?health=at_risk" hint={d.atRisk ? <span className="text-crit-600 font-medium">needs a plan this week</span> : "none"} />
          <KpiCard label="AI processed" value={count(d.aiProcessed)} hint="last 30 days" />
          <KpiCard label="Human reviewed" value={count(d.humanReviewed)} href="/ops/review" hint="last 30 days" />
          <KpiCard label="Client questions" value={count(d.clientQuestions)} hint="asked in 30 days" />
          <KpiCard label="Automation rate" value={pctText(d.automationRate)} hint={<Badge tone={d.automationRate > 0.8 ? "ok" : "warn"}>target &gt; 80%</Badge>} />
        </section>

        <Card className="overflow-hidden border-brand-200">
          <div className="h-full flex flex-col bg-gradient-to-br from-brand-50 via-surface to-surface px-5 py-4">
            <div className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-brand-700">
              <Gauge className="size-3.5" aria-hidden /> North Star
            </div>
            <div className="text-[13.5px] text-ink-2 font-medium mt-1">Human minutes per client per month</div>
            <div className="flex items-end gap-3 mt-2">
              <div className="text-[40px] leading-[44px] font-semibold tracking-[-0.02em] tabular text-ink">{fmtMinutes(d.humanMinutesPerClient)}</div>
              <div className="pb-1.5 text-[13px] text-muted">min / client · 30d</div>
            </div>
            <div className="mt-1 text-[13px] text-ink-2">
              <span className="font-semibold tabular">{fmtMinutes(d.humanMinutesPer100)}</span> human minutes per 100 transactions
            </div>
            <div className="mt-auto pt-4">
              <div className="flex items-center justify-between text-[12px] text-muted mb-2">
                <span>3-month trend</span>
                <span>Lower is better</span>
              </div>
              <div className="grid grid-cols-3 gap-3 items-end h-[92px]" role="img" aria-label={`Human minutes per client: ${d.trend.map((t) => `${t.label} ${fmtMinutes(t.minutesPerClient)}`).join(", ")}`}>
                {d.trend.map((t, i) => (
                  <div key={t.period} className="flex flex-col items-center justify-end h-full gap-1">
                    <span className="text-[12px] font-semibold tabular text-ink">{fmtMinutes(t.minutesPerClient)}</span>
                    <div className={cn("w-full max-w-14 rounded-t-md", i === d.trend.length - 1 ? "bg-brand-600" : "bg-brand-200")} style={{ height: `${Math.max(6, (t.minutesPerClient / maxTrend) * 56)}px` }} />
                    <span className="text-[11.5px] text-muted">{monthLabel(t.period)}{i === d.trend.length - 1 ? " (MTD)" : ""}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6">
        <Card>
          <CardHeader title="Critical metrics vs targets" subtitle="MVP success criteria · live across your clients" action={missed ? <Badge tone="warn">{missed} below target</Badge> : <Badge tone="ok">All on target</Badge>} />
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

        <Card>
          <CardHeader title="Top of the work queue" subtitle={`${count(openCount)} open items across clients · sorted by priority, then age`} action={<LinkButton href="/ops/queue" size="sm">View all <ArrowRight className="size-3.5" /></LinkButton>} />
          {top.length === 0 ? (
            <div className="px-5 pb-5 text-[13px] text-muted">Nothing open — every client is current.</div>
          ) : (
            <ul className="px-2 pb-2">
              {top.map((w) => (
                <li key={w.id} className="flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-surface-2">
                  <div className="pt-0.5 w-[76px] shrink-0"><PriorityBadge priority={w.priority} /></div>
                  <div className="min-w-0 flex-1">
                    {w.href ? (
                      <OrgLink orgId={w.orgId} href={w.href} activeOrgId={ctx.org.id} className="text-[13.5px] font-medium leading-snug">{w.title}</OrgLink>
                    ) : (
                      <div className="text-[13.5px] font-medium leading-snug">{w.title}</div>
                    )}
                    <div className="text-[12px] text-muted mt-0.5 truncate">
                      {orgName.get(w.orgId)} · {WORK_TYPE_LABEL[w.type]} · {w.assigneeId ? userName.get(w.assigneeId) : "Unassigned"}
                    </div>
                  </div>
                  <span className="text-[12px] text-muted tabular whitespace-nowrap inline-flex items-center gap-1 pt-0.5"><Clock className="size-3" aria-hidden />{relativeAge(w.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Clients at a glance" subtitle="At-risk clients first · health from close status, reconciliation differences and connections" action={<LinkButton href="/ops/clients" size="sm">All clients <ArrowRight className="size-3.5" /></LinkButton>} />
        <TableWrap>
          <thead>
            <tr>
              <th className={th}>Client</th>
              <th className={th}>Health</th>
              <th className={th}>Close</th>
              <th className={thNum}>To review</th>
              <th className={thNum}>Open questions</th>
              <th className={thNum}>Automation</th>
              <th className={thNum}>Minutes (30d)</th>
              <th className={th}>Bookkeeper</th>
            </tr>
          </thead>
          <tbody>
            {glance.map((c) => (
              <tr key={c.org.id} className={tr}>
                <td className={cn(td, "min-w-[180px]")}>
                  <Link href="/ops/clients" className="font-medium text-ink hover:text-brand-700 hover:underline underline-offset-2">{c.org.name}</Link>
                  <div className="text-[12px] text-muted truncate max-w-[240px]">{c.reasons[0] ?? c.org.industry}</div>
                </td>
                <td className={td}><StatusPill status={c.health} /></td>
                <td className={cn(td, "whitespace-nowrap")}>
                  {c.closePeriod ? (
                    <span className="tabular">
                      <span className="text-ink-2">{/^\d{4}-\d{2}$/.test(c.closePeriod) ? monthLabel(c.closePeriod) : c.closePeriod}</span>
                      <span className="text-muted"> · </span>
                      <span className={cn("font-medium", c.closeState === "closed" ? "text-ok-600" : "text-ink")}>{c.closeState === "closed" ? "Closed" : `${c.closePct}%`}</span>
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className={cn(tdNum, c.review ? "font-semibold text-ink" : "text-muted")}>{count(c.review)}</td>
                <td className={cn(tdNum, c.questions ? "text-ink" : "text-muted")}>{count(c.questions)}</td>
                <td className={cn(tdNum, c.automation >= 0.8 ? "text-ok-600" : "text-warn-700")}>{c.volume ? pctText(c.automation) : "—"}</td>
                <td className={tdNum}>{fmtMinutes(c.minutes)}</td>
                <td className={cn(td, "whitespace-nowrap text-ink-2")}>{c.bookkeeper ?? <span className="text-muted">Unassigned</span>}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        <div className="px-5 py-3 border-t border-line text-[12px] text-muted flex items-center justify-between gap-3">
          <span>Showing {glance.length} of {d.perClient.length} clients</span>
          <Link href="/ops/clients" className="text-brand-700 font-medium hover:underline">See all clients</Link>
        </div>
      </Card>
    </div>
  );
}
