import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, CircleDot, FileBarChart } from "lucide-react";
import { requireCtx, hasPerm } from "@/server/auth/session";
import { closeStatus, ensureClosePeriods, periodLabel, periodRange } from "@/server/services/close";
import { Badge, Card, CardHeader, ClassBadge, LinkButton, PageHeader, ProgressBar, ProgressRing, StatusPill, Notice } from "@/components/ui/primitives";
import { CloseActions } from "@/components/close/close-actions";
import { monthName, prettyDate, prettyDateTime, today, diffDays } from "@/lib/dates";
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
  const catchUp = ctx.org.catchUp;
  const daysToTarget = diffDays(cp.targetCloseDate, d);
  return (
    <div>
      <PageHeader
        title="Monthly Close"
        description="Each period has a close workflow. Fabrik completes the automatic steps; your bookkeeper and an independent reviewer finish it."
        badge={<Badge tone="neutral">Schedule: {ctx.org.closeFrequency}</Badge>}
        actions={<LinkButton href={`/close/${cp.period}/package`} variant="secondary"><FileBarChart className="size-4" /> Finance package</LinkButton>}
      />
      <div className="grid lg:grid-cols-[260px_minmax(0,1fr)] gap-6">
        <Card className="h-fit">
          <div className="px-4 pt-4 pb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Periods</div>
          <ul className="px-2 pb-2">
            {periods.map((p) => {
              const st = closeStatus(ctx.org.id, p);
              return (
                <li key={p.id}>
                  <Link href={`/close?period=${p.period}`} className={cn("flex items-center gap-3 rounded-lg px-2.5 py-2", p.id === cp.id ? "bg-brand-50" : "hover:bg-sunken")}>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-medium">{periodLabel(p.period)}</div>
                      <ProgressBar value={st.pct / 100} className="mt-1.5 h-1.5" tone={p.status === "closed" ? "ok" : "brand"} />
                    </div>
                    <span className="text-[12px] tabular text-muted w-9 text-right">{st.pct}%</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>

        <div className="space-y-5 min-w-0">
          <Card>
            <div className="px-5 py-5 flex flex-col sm:flex-row sm:items-center gap-5">
              <ProgressRing value={s.pct / 100} size={76} stroke={7} />
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-[20px] font-semibold">{periodLabel(cp.period)}</h2>
                  <StatusPill status={cp.status} />
                </div>
                <div className="text-[13px] text-muted mt-1">
                  {cp.status === "closed" ? `Closed ${prettyDateTime(cp.closedAt!)} UTC` : `Target close ${prettyDate(cp.targetCloseDate, { year: true })} · ${daysToTarget >= 0 ? `${daysToTarget} days left` : `${-daysToTarget} days past target`}`} · {s.done} of {s.total} steps complete
                </div>
              </div>
              <CloseActions period={cp.period} status={cp.status} bookkeeperDone={Boolean(cp.manual.bookkeeper_review?.done)} ready={s.readyForApproval} blocking={s.blocking.map((b) => b.label)} canWork={hasPerm(ctx, "close:work")} canApprove={hasPerm(ctx, "close:approve")} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Close checklist" subtitle="Tasks are generated automatically from the state of your books" />
            <ol className="px-5 pb-4">
              {s.tasks.map((t, i) => (
                <li key={t.key} className="flex items-start gap-3 py-3 border-t border-line first:border-0">
                  {t.state === "done" ? <CheckCircle2 className="size-5 text-ok-600 shrink-0" /> : t.state === "in_progress" ? <CircleDot className="size-5 text-warn-500 shrink-0" /> : <Circle className="size-5 text-line-strong shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14px] font-medium">{i + 1}. {t.label}</span>
                      <Badge tone={t.owner === "AI" ? "ai" : t.owner === "Client" ? "info" : "neutral"}>{t.owner}</Badge>
                      {t.auto && <span className="text-[11.5px] text-subtle">auto-tracked</span>}
                    </div>
                    <div className="text-[12.5px] text-muted mt-0.5">
                      {t.detail}
                      {t.by && ` · ${t.by}`}
                      {t.at && ` · ${prettyDateTime(t.at)} UTC`}
                    </div>
                  </div>
                  {t.href && t.state !== "done" && (
                    <Link href={t.href} className="text-[12.5px] text-brand-700 font-medium hover:underline inline-flex items-center gap-1 shrink-0">Go <ArrowRight className="size-3" /></Link>
                  )}
                </li>
              ))}
            </ol>
          </Card>

          {catchUp && (
            <Card>
              <CardHeader title="Catch-up bookkeeping" subtitle={`Bringing ${monthName(catchUp.fromPeriod)}–${monthName(catchUp.toPeriod)} current (${catchUp.monthsBehind} months behind)`} action={<ClassBadge cls="B" />} />
              <div className="px-5 pb-5 text-[13px] text-ink-2">Historical cleanup is a proposed Fondo-inspired service. Fabrik processes the backlog with the same AI pipeline, then closes each month in order.</div>
            </Card>
          )}
          <Notice tone="neutral" title="Bookkeeping schedule">
            This organization closes <b>{ctx.org.closeFrequency}</b>. Quarterly and annual schedules are a proposed addition (classification B) — change it in Team &amp; Settings → Bookkeeping. PRD target: monthly close in under 10 business days.
          </Notice>
        </div>
      </div>
    </div>
  );
}
