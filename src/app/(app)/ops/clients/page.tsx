import Link from "next/link";
import { Building2 } from "lucide-react";
import { accessibleOrgs, requireCtx } from "@/server/auth/session";
import { opsDashboard } from "@/server/services/ops";
import { Badge, Card, EmptyState, PageHeader, ProgressBar, StatusPill } from "@/components/ui/primitives";
import { ClientActions } from "@/components/ops/org-nav";
import { StaffOnly, TableWrap, pctText, td, tdNum, th, thNum, tr } from "@/components/ops/shared";
import { monthLabel } from "@/lib/dates";
import { count } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata = { title: "Clients" };

const TABS = [
  { key: "", label: "All" },
  { key: "at_risk", label: "At risk" },
  { key: "needs_attention", label: "Needs attention" },
  { key: "current", label: "Current" },
] as const;

const PLAN_TONE = { essentials: "neutral", growth: "brand", enterprise: "ai" } as const;

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ health?: string }> }) {
  const ctx = await requireCtx();
  if (!ctx.isStaff) return <StaffOnly />;
  const sp = await searchParams;
  const d = opsDashboard(ctx);
  const health = TABS.some((t) => t.key === sp.health) ? (sp.health ?? "") : "";
  const rows = health ? d.perClient.filter((c) => c.health === health) : d.perClient;
  const inactive = accessibleOrgs(ctx.user).filter((o) => o.status !== "active");
  const tally: Record<string, number> = { "": d.perClient.length, at_risk: d.atRisk, needs_attention: d.needsAttention, current: d.booksCurrent };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Fabrik Operations" title="Clients" description="Every client you serve, at-risk first. Open a workspace to work inside a client's books, or jump straight to its review queue." badge={<Badge>{count(d.activeClients)} active</Badge>} />

      <div className="flex items-center gap-1 border-b border-line overflow-x-auto" role="tablist" aria-label="Filter by health">
        {TABS.map((t) => (
          <Link key={t.key} href={t.key ? `/ops/clients?health=${t.key}` : "/ops/clients"} role="tab" aria-selected={health === t.key} className={cn("relative px-3 h-10 inline-flex items-center gap-2 text-[13.5px] font-medium whitespace-nowrap", health === t.key ? "text-ink after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:bg-brand-600 after:rounded" : "text-muted hover:text-ink")}>
            {t.label}
            <span className="min-w-5 h-5 px-1.5 rounded-full bg-sunken text-[11px] tabular flex items-center justify-center">{tally[t.key]}</span>
          </Link>
        ))}
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<Building2 className="size-5" />} title="No clients in this group" />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <th className={th}>Client</th>
                <th className={th}>Health</th>
                <th className={th}>Close</th>
                <th className={thNum}>To review</th>
                <th className={thNum}>Questions</th>
                <th className={thNum}>Automation</th>
                <th className={th}>Team</th>
                <th className={cn(th, "text-right")}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const period = c.closePeriod && /^\d{4}-\d{2}$/.test(c.closePeriod) ? monthLabel(c.closePeriod) : c.closePeriod;
                return (
                  <tr key={c.org.id} className={cn(tr, "align-top")}>
                    <td className={cn(td, "min-w-[190px]")}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-ink">{c.org.name}</span>
                        {c.org.id === ctx.org.id && <Badge tone="brand">Active</Badge>}
                      </div>
                      <div className="text-[12px] text-muted mt-0.5 flex items-center gap-1.5">
                        <span className="truncate max-w-[180px]">{c.org.industry} · {c.org.state}</span>
                        <Badge tone={PLAN_TONE[c.org.plan]} className="h-5 text-[11px] capitalize">{c.org.plan}</Badge>
                      </div>
                    </td>
                    <td className={cn(td, "min-w-[160px] max-w-[200px]")}>
                      <StatusPill status={c.health} />
                      {c.reasons.length > 0 && (
                        <ul className="mt-1 space-y-0.5">
                          {c.reasons.map((r) => (
                            <li key={r} className="text-[11.5px] text-muted leading-snug">{r}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className={cn(td, "min-w-[130px]")}>
                      <div className="flex items-center justify-between text-[12px] mb-1">
                        <span className="text-ink-2">{period ?? "—"}</span>
                        <span className={cn("tabular font-medium", c.closeState === "closed" ? "text-ok-600" : "text-ink")}>{c.closeState === "closed" ? "Closed" : `${c.closePct}%`}</span>
                      </div>
                      <ProgressBar value={c.closeState === "closed" ? 1 : c.closePct / 100} tone={c.closeState === "closed" ? "ok" : c.health === "at_risk" ? "warn" : "brand"} label={`${c.org.name} close progress`} />
                    </td>
                    <td className={cn(tdNum, c.review ? "font-semibold text-ink" : "text-muted")}>{count(c.review)}</td>
                    <td className={cn(tdNum, c.questions ? "text-ink" : "text-muted")}>{count(c.questions)}</td>
                    <td className={cn(tdNum, c.automation >= 0.8 ? "text-ok-600" : "text-warn-700")}>{c.volume ? pctText(c.automation) : "—"}</td>
                    <td className={cn(td, "min-w-[120px] text-[12.5px] leading-snug")}>
                      <div className="text-ink-2">{c.bookkeeper ?? <span className="text-muted">No bookkeeper</span>}</div>
                      <div className="text-muted">{c.reviewer ? `Reviewer: ${c.reviewer}` : "No reviewer"}</div>
                    </td>
                    <td className={td}>
                      <ClientActions orgId={c.org.id} activeOrgId={ctx.org.id} review={c.review} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
        <div className="h-2" />
      </Card>
      {inactive.length > 0 && <p className="text-[12px] text-muted">Not shown: {inactive.map((o) => `${o.name} (${o.status})`).join(", ")}. Onboarding and paused clients don&apos;t count toward portfolio metrics.</p>}
    </div>
  );
}
