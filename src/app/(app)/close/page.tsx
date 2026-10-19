import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, CircleDot, FileBarChart } from "lucide-react";
import { requireCtx, hasPerm } from "@/server/auth/session";
import { closeStatus, ensureClosePeriods, periodLabel, periodRange } from "@/server/services/close";
import { Badge, Card, CardHeader, LinkButton, PageHeader, StatusPill } from "@/components/ui/primitives";
import { CloseActions } from "@/components/close/close-actions";
import { prettyDateTime, today } from "@/lib/dates";
import { cn } from "@/lib/cn";

export const metadata = { title: "Monthly Close" };

export default async function ClosePage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const periods = ensureClosePeriods(ctx.org);
  const d = today();
  const defaultP = periods.filter((p) => p.status !== "closed" && periodRange(p.period).to < d).sort((a, b) => a.period.localeCompare(b.period))[0] ?? periods[0]!;
  const cp = periods.find((p) => p.period === sp.period) ?? defaultP;
  const s = closeStatus(ctx.org.id, cp);
  return (
    <div>
      <PageHeader
        title="Monthly Close"
        actions={<LinkButton href={`/close/${cp.period}/package`} variant="secondary"><FileBarChart className="size-4" /> Finance package</LinkButton>}
      />
      <div className="flex gap-1 border-b border-line mb-5 overflow-x-auto" role="tablist" aria-label="Period">
        {periods.map((p) => (
          <Link key={p.id} href={`/close?period=${p.period}`} role="tab" aria-selected={p.id === cp.id} className={cn("relative px-3 h-10 inline-flex items-center text-[13.5px] font-medium whitespace-nowrap", p.id === cp.id ? "text-ink after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:bg-brand-600 after:rounded" : "text-muted hover:text-ink")}>
            {periodLabel(p.period)}
          </Link>
        ))}
      </div>
      <div className="space-y-5">
          <Card>
            <div className="px-5 py-5 flex flex-col sm:flex-row sm:items-center gap-5">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-[20px] font-semibold">{periodLabel(cp.period)}</h2>
                  <StatusPill status={cp.status} />
                </div>
                <div className="text-[13px] text-muted mt-1">
                  {cp.status === "closed" ? `Closed ${prettyDateTime(cp.closedAt!)}` : `${s.done} of ${s.total} steps complete`}
                </div>
              </div>
              <CloseActions period={cp.period} status={cp.status} bookkeeperDone={Boolean(cp.manual.bookkeeper_review?.done)} ready={s.readyForApproval} blocking={s.blocking.map((b) => b.label)} canWork={hasPerm(ctx, "close:work")} canApprove={hasPerm(ctx, "close:approve")} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Close checklist" />
            <ol className="px-5 pb-4">
              {s.tasks.map((t, i) => (
                <li key={t.key} className="flex items-start gap-3 py-3 border-t border-line first:border-0">
                  {t.state === "done" ? <CheckCircle2 className="size-5 text-ok-600 shrink-0" /> : t.state === "in_progress" ? <CircleDot className="size-5 text-warn-500 shrink-0" /> : <Circle className="size-5 text-line-strong shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14px] font-medium">{i + 1}. {t.label}</span>
                      <Badge tone={t.owner === "AI" ? "ai" : t.owner === "Client" ? "info" : "neutral"}>{t.owner}</Badge>
                    </div>
                    <div className="text-[12.5px] text-muted mt-0.5">
                      {t.detail}
                      {t.by && ` · ${t.by}`}
                      {t.at && ` · ${prettyDateTime(t.at)}`}
                    </div>
                  </div>
                  {t.href && t.state !== "done" && (
                    <Link href={t.href} className="text-[12.5px] text-brand-700 font-medium hover:underline inline-flex items-center gap-1 shrink-0">Go <ArrowRight className="size-3" /></Link>
                  )}
                </li>
              ))}
            </ol>
          </Card>
      </div>
    </div>
  );
}
