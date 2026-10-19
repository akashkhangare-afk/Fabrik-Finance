import { accessibleOrgs, requireCtx } from "@/server/auth/session";
import { accountName, reviewQueue } from "@/server/services/transactions";
import { db } from "@/server/db/store";
import { showExtras } from "@/server/config";
import { Badge, PageHeader } from "@/components/ui/primitives";
import { AutoSwitch, ClientPicker } from "@/components/ops/org-nav";
import { ReviewQueue, type AccountOpt, type ReviewRow } from "@/components/ops/review-queue";
import { StaffOnly } from "@/components/ops/shared";
import { plural } from "@/lib/format";

export const metadata = { title: "AI Review Queue" };

export default async function ReviewQueuePage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const ctx = await requireCtx();
  if (!ctx.isStaff) return <StaffOnly />;
  const sp = await searchParams;
  const orgs = accessibleOrgs(ctx.user);
  const data = db();

  // Deep link from the work queue (/ops/review?org=…): switch the active org client-side, then reload.
  const target = sp.org ? orgs.find((o) => o.id === sp.org) : undefined;
  if (target && target.id !== ctx.org.id) return <AutoSwitch orgId={target.id} orgName={target.name} to="/ops/review" />;

  const counts = new Map<string, number>();
  for (const t of data.transactions) if (t.status === "needs_review") counts.set(t.orgId, (counts.get(t.orgId) ?? 0) + 1);
  const picker = orgs.map((o) => ({ id: o.id, name: o.name, review: counts.get(o.id) ?? 0 })).sort((a, b) => b.review - a.review || a.name.localeCompare(b.name));

  const org = ctx.org;
  const queue = reviewQueue(org.id);
  const rows: ReviewRow[] = queue.slice(0, 200).map((t) => ({
    id: t.id,
    date: t.date,
    vendor: t.ai?.normalizedVendor ?? t.description,
    amount: t.amount,
    accountId: t.ai?.accountId,
    accountName: accountName(t.ai?.accountId),
    confidence: t.ai?.confidence ?? 0,
    decision: t.ai?.decision ?? "review",
    explanation: t.ai?.explanation ?? "No AI recommendation yet — a person needs to categorize this transaction.",
    risk: t.risk?.reasons.length ? { level: t.risk.level, reasons: t.risk.reasons.map((r) => r.label) } : null,
    alternatives: (t.ai?.alternatives ?? []).filter((a) => a.confidence >= 0.02).slice(0, 4).map((a) => ({ accountId: a.accountId, name: accountName(a.accountId), confidence: a.confidence })),
    escalated: t.memo?.startsWith("Escalated:") ? t.memo : undefined,
  }));
  const accounts: AccountOpt[] = data.glAccounts
    .filter((a) => a.orgId === org.id && a.active)
    .sort((a, b) => a.code.localeCompare(b.code) || a.name.localeCompare(b.name))
    .map((a) => ({ id: a.id, name: a.name, code: a.code, type: a.type }));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="AI Review Queue"
        title={org.name}
        badge={<Badge tone={queue.length ? "warn" : "ok"}>{queue.length ? `${plural(queue.length, "item")} need${queue.length === 1 ? "s" : ""} review` : "Queue clear"}</Badge>}
        actions={<ClientPicker orgs={picker} activeOrgId={org.id} />}
      />

      <div className="min-w-0">
        <ReviewQueue rows={rows} accounts={accounts} thresholds={org.thresholds} shortcuts={showExtras()} />
        {queue.length > rows.length && <p className="text-[12px] text-muted mt-3">Showing the first {rows.length} of {queue.length} by risk and confidence.</p>}
      </div>
    </div>
  );
}
