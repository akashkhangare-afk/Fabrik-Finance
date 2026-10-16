import { ShieldAlert, SlidersHorizontal } from "lucide-react";
import { accessibleOrgs, requireCtx } from "@/server/auth/session";
import { accountName, reviewQueue } from "@/server/services/transactions";
import { db } from "@/server/db/store";
import { Badge, Card, CardHeader, Kbd, PageHeader } from "@/components/ui/primitives";
import { AutoSwitch, ClientPicker } from "@/components/ops/org-nav";
import { ReviewQueue, type AccountOpt, type ReviewRow } from "@/components/ops/review-queue";
import { StaffOnly, pctText } from "@/components/ops/shared";
import { money, plural } from "@/lib/format";
import { addDays, today } from "@/lib/dates";

export const metadata = { title: "AI Review Queue" };

const SHORTCUTS: [string, string][] = [
  ["J / K", "Next / previous"],
  ["A", "Approve suggestion"],
  ["C", "Change category"],
  ["Q", "Ask client"],
  ["E", "Escalate"],
  ["X", "Select for bulk"],
];

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
  const banks = new Map(data.bankAccounts.filter((b) => b.orgId === org.id).map((b) => [b.id, `${b.name} ••••${b.mask}`]));
  const queue = reviewQueue(org.id);
  const rows: ReviewRow[] = queue.slice(0, 200).map((t) => ({
    id: t.id,
    date: t.date,
    vendor: t.ai?.normalizedVendor ?? t.description,
    description: t.description,
    amount: t.amount,
    bank: banks.get(t.bankAccountId) ?? "",
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
  const risky = queue.filter((t) => t.risk?.forcesReview).length;
  const highConfRisky = queue.filter((t) => t.risk?.forcesReview && (t.ai?.confidence ?? 0) >= org.thresholds.autoApprove).length;
  const since = addDays(today(), -30);
  const recent = data.transactions.filter((t) => t.orgId === org.id && t.date >= since);
  const auto = recent.length ? recent.filter((t) => t.status === "processed").length / recent.length : 0;
  const { autoApprove, review } = org.thresholds;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="AI Review Queue"
        title={org.name}
        badge={<Badge tone={queue.length ? "warn" : "ok"}>{queue.length ? `${plural(queue.length, "item")} need${queue.length === 1 ? "s" : ""} review` : "Queue clear"}</Badge>}
        description="Only transactions the AI is unsure about, or that a risk rule flagged, reach people. Approve in one keystroke; corrections teach Fabrik."
        actions={<ClientPicker orgs={picker} activeOrgId={org.id} />}
      />

      <div className="grid xl:grid-cols-[minmax(0,1fr)_288px] gap-5 items-start">
        <div className="min-w-0">
          <ReviewQueue rows={rows} accounts={accounts} thresholds={org.thresholds} orgName={org.name} />
          {queue.length > rows.length && <p className="text-[12px] text-muted mt-3">Showing the first {rows.length} of {queue.length} by risk and confidence.</p>}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-20">
          <Card>
            <CardHeader title="This client's AI policy" icon={<SlidersHorizontal className="size-4" />} className="pb-2" />
            <div className="px-5 pb-4">
              <dl className="text-[13px] divide-y divide-line">
                {[
                  ["Auto-process", `≥ ${pctText(autoApprove)}`],
                  ["Bookkeeper review", `${pctText(review)}–${pctText(autoApprove)}`],
                  ["Review or ask client", `< ${pctText(review)}`],
                  ["Large transaction", `≥ ${money(org.largeTransactionThreshold)}`],
                  ["Automation (30d)", pctText(auto)],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-3 py-1.5">
                    <dt className="text-muted">{k}</dt>
                    <dd className="tabular font-medium text-ink whitespace-nowrap">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-risk-50 text-risk-600 ring-1 ring-inset ring-[#f1c9b4] px-3 py-2 text-[12.5px]">
                <ShieldAlert className="size-4 shrink-0 mt-px" aria-hidden />
                <span>
                  <span className="font-semibold">Risk rules override confidence.</span>{" "}
                  {risky ? `${plural(risky, "item")} here ${risky === 1 ? "was" : "were"} held by a risk rule${highConfRisky ? ` — ${highConfRisky} at auto-process confidence` : ""}.` : "Loans, equity, tax and large items always reach a person."}
                </span>
              </div>
            </div>
          </Card>
          <Card className="hidden md:block">
            <CardHeader title="Keyboard" subtitle="Works anywhere outside a text field" className="pb-2" />
            <ul className="px-5 pb-4 space-y-1.5">
              {SHORTCUTS.map(([k, label]) => (
                <li key={k} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="text-ink-2">{label}</span>
                  <span className="flex gap-1">{k.split(" / ").map((x) => <Kbd key={x}>{x}</Kbd>)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
