import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Circle, CircleDot, Landmark, Lightbulb, MessageSquare, Sparkles, TrendingUp } from "lucide-react";
import { requireCtx } from "@/server/auth/session";
import { getForecast, getKpis, getTrend, financeBrief } from "@/server/services/finance";
import { currentClose, periodLabel } from "@/server/services/close";
import { inboxSummary } from "@/server/services/workflow";
import { fundingMatches, fundingSummary } from "@/server/services/funding";
import { fabrikTeam } from "@/server/services/admin";
import { Badge, Card, CardHeader, Delta, KpiCard, LinkButton, ProgressBar, AiBadge, Avatar, Money } from "@/components/ui/primitives";
import { ForecastChart, RevenueExpenseChart, type MonthPoint } from "@/components/charts";
import { AskAccountantButton } from "@/components/home/ask-accountant";
import { monthLabel, prettyDate, today } from "@/lib/dates";
import { moneyCompact, plural } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata = { title: "Home" };

const TONE_ICON = { positive: TrendingUp, warning: AlertTriangle, info: CheckCircle2, opportunity: Lightbulb };
const TONE_CLS = { positive: "text-ok-600 bg-ok-50", warning: "text-warn-700 bg-warn-50", info: "text-info-600 bg-info-50", opportunity: "text-ai-600 bg-ai-50" };

export default async function HomePage() {
  const ctx = await requireCtx();
  const orgId = ctx.org.id;
  const k = getKpis(orgId);
  const toPoints = (rows: ReturnType<typeof getTrend>): MonthPoint[] => rows.map((r) => ({ ...r, label: monthLabel(r.period) }));
  const series = { "3m": toPoints(getTrend(orgId, "3m")), "6m": toPoints(getTrend(orgId, "6m")), "12m": toPoints(getTrend(orgId, "12m")), ytd: toPoints(getTrend(orgId, "ytd")) };
  const fs = fundingSummary(orgId);
  const brief = financeBrief(orgId, { fundingHighCount: fs.high });
  const close = currentClose(orgId);
  const inbox = inboxSummary(orgId);
  const f = getForecast(orgId);
  const top = fundingMatches(orgId).filter((m) => m.match.level === "high").slice(0, 3);
  const team = fabrikTeam(ctx.org);
  const pct = (a: number, b: number) => (b ? (a - b) / b : 0);
  const firstName = ctx.user.name.split(" ")[0];
  const hour = new Date().getHours();

  const attention = [
    { n: inbox.transactions, one: "transaction", many: "transactions" },
    { n: inbox.bills, one: "bill approval", many: "bill approvals" },
    { n: inbox.documents, one: "missing document", many: "missing documents" },
    { n: inbox.funding, one: "funding question", many: "funding questions" },
    { n: inbox.invoices, one: "overdue invoice", many: "overdue invoices" },
    { n: inbox.questions, one: "question", many: "questions" },
  ].filter((x) => x.n > 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-[13px] text-muted">{ctx.org.legalName} · {prettyDate(today(), { year: true })}</div>
          <h1 className="mt-1 text-[28px] leading-9 font-semibold tracking-[-0.02em]">{ctx.isStaff ? `${ctx.org.name} overview` : `Good ${hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}, ${firstName}`}</h1>
        </div>
        <div className="flex gap-2">
          <LinkButton href={`/close/${close.cp.period}/package`} variant="secondary">Finance package</LinkButton>
          <LinkButton href="/ask" variant="primary"><Sparkles className="size-4" /> Ask Fabrik</LinkButton>
        </div>
      </header>

      {inbox.total > 0 && (
        <Card className="overflow-hidden border-risk-600/20">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 px-5 py-4 bg-gradient-to-r from-risk-50 to-surface">
            <div className="size-10 rounded-xl bg-white text-risk-600 flex items-center justify-center ring-1 ring-risk-600/15 shrink-0">
              <MessageSquare className="size-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-risk-600">Fabrik needs your help</div>
              <div className="text-[15px] font-semibold mt-0.5">{plural(inbox.total, "item")} need your input — everything else is handled.</div>
              <div className="text-[13px] text-muted mt-1 flex flex-wrap gap-x-3 gap-y-1">
                {attention.map((a) => (
                  <span key={a.one}>{a.n} {a.n === 1 ? a.one : a.many}</span>
                ))}
              </div>
            </div>
            <LinkButton href="/inbox" variant="primary">Review <ArrowRight className="size-4" /></LinkButton>
          </div>
        </Card>
      )}

      <section aria-label="Key figures" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard label="Cash" value={moneyCompact(k.cash)} href="/cfo?tab=forecast" hint="across bank accounts" />
        <KpiCard label="Revenue YTD" value={moneyCompact(k.revenueYtd)} delta={<Delta value={pct(k.revenueYtd, k.revenueYtdPrior)} suffix="vs last year" />} href="/books?tab=reports" />
        <KpiCard label="Expenses YTD" value={moneyCompact(k.expensesYtd)} delta={<Delta value={pct(k.expensesYtd, k.expensesYtdPrior)} goodWhen="down" suffix="vs last year" />} href="/books?tab=reports" />
        <KpiCard label="Net income YTD" value={moneyCompact(k.netIncomeYtd)} hint={`${(k.operatingMargin * 100).toFixed(1)}% margin`} href="/books?tab=reports" />
        <KpiCard label="Receivables" value={moneyCompact(k.receivables)} hint={k.receivablesOver30 ? `${moneyCompact(k.receivablesOver30)} over 30 days` : "all current"} href="/collect" />
        <KpiCard label="Upcoming bills" value={moneyCompact(k.upcomingBills)} hint={`${moneyCompact(k.billsDueThisWeek)} due this week`} href="/bills" />
      </section>

      <div className="grid xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] gap-6">
        <Card>
          <CardHeader title="Revenue vs expenses" subtitle="Monthly, accrual basis · from QuickBooks Online" />
          <div className="px-5 pb-5">
            <RevenueExpenseChart series={series} defaultRange="12m" ranges={[{ value: "3m", label: "3M" }, { value: "6m", label: "6M" }, { value: "12m", label: "12M" }, { value: "ytd", label: "YTD" }]} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Fabrik Finance Brief" subtitle="Observations generated from your books, forecast and funding profile" action={<AiBadge label="AI-generated" />} />
          <ul className="px-3 pb-3">
            {brief.map((b) => {
              const Icon = TONE_ICON[b.tone];
              return (
                <li key={b.id}>
                  <Link href={b.href} className="group flex gap-3 rounded-xl px-2.5 py-2.5 hover:bg-surface-2">
                    <span className={cn("size-8 rounded-lg flex items-center justify-center shrink-0", TONE_CLS[b.tone])}>
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] text-ink leading-snug">{b.text}</span>
                      <span className="block text-[11.5px] text-subtle mt-0.5">{b.basis}</span>
                    </span>
                    <ArrowRight className="size-4 text-subtle opacity-0 group-hover:opacity-100 mt-2 shrink-0" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader title={`${periodLabel(close.cp.period)} books`} subtitle={close.cp.status === "closed" ? "Closed and reviewed" : `Target close ${prettyDate(close.cp.targetCloseDate)}`} action={<span className="text-[22px] font-semibold tabular">{close.pct}%</span>} />
          <div className="px-5 pb-5">
            <ProgressBar value={close.pct / 100} label="Close progress" />
            <ul className="mt-4 space-y-2">
              {close.tasks.map((t) => (
                <li key={t.key} className="flex items-center gap-2.5 text-[13.5px]">
                  {t.state === "done" ? <CheckCircle2 className="size-4 text-ok-600" /> : t.state === "in_progress" ? <CircleDot className="size-4 text-warn-500" /> : <Circle className="size-4 text-line-strong" />}
                  <span className={cn(t.state === "done" ? "text-ink-2" : "text-ink font-medium")}>{t.label}</span>
                  {t.state !== "done" && <span className="ml-auto text-[12px] text-muted truncate max-w-[45%]">{t.detail}</span>}
                </li>
              ))}
            </ul>
            <Link href="/close" className="mt-4 inline-flex items-center gap-1 text-[13px] text-brand-700 font-medium hover:underline">View monthly close <ArrowRight className="size-3.5" /></Link>
          </div>
        </Card>

        <Card>
          <CardHeader title="Next 13 weeks" subtitle={`Low point ${moneyCompact(f.minCash)} in week ${f.minWeek} · buffer ${moneyCompact(f.bufferCents)}`} action={<Badge tone={f.weeksBelowBuffer.length ? "warn" : "ok"}>{f.weeksBelowBuffer.length ? "Watch cash" : "Sufficient"}</Badge>} />
          <div className="px-3 pb-2">
            <ForecastChart compact height={170} startingCash={f.startingCash} buffer={f.bufferCents} weeks={f.weeks.map((w) => ({ label: `W${w.index}`, range: w.label, closing: w.closing, inKnown: w.inKnown, inEstimated: w.inEstimated, outKnown: w.outKnown, outEstimated: w.outEstimated }))} />
          </div>
          <div className="px-5 pb-5 grid grid-cols-2 gap-3 text-[13px]">
            <div>
              <div className="text-muted text-[12px]">Today</div>
              <div className="font-semibold tabular">{moneyCompact(f.startingCash)}</div>
            </div>
            <div>
              <div className="text-muted text-[12px]">Week 13</div>
              <div className="font-semibold tabular">{moneyCompact(f.endingCash)}</div>
            </div>
            <Link href="/cfo?tab=forecast" className="col-span-2 inline-flex items-center gap-1 text-[13px] text-brand-700 font-medium hover:underline">Inspect forecast & assumptions <ArrowRight className="size-3.5" /></Link>
          </div>
        </Card>

        <Card>
          <CardHeader title="Funding opportunities" subtitle={`${fs.identified} potential programs · ${fs.high} high-potential`} icon={<Landmark className="size-4" />} />
          <ul className="px-3 pb-2">
            {top.map((m) => (
              <li key={m.program.id}>
                <Link href={`/funding/${m.program.id}`} className="flex items-start gap-3 rounded-xl px-2.5 py-2.5 hover:bg-surface-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-medium leading-snug">{m.program.name}</div>
                    <div className="text-[12px] text-muted mt-0.5">{m.program.agency}</div>
                  </div>
                  <Badge tone="ok" className="tabular">{m.match.score}%</Badge>
                </Link>
              </li>
            ))}
          </ul>
          <div className="px-5 pb-5">
            <p className="text-[11.5px] text-subtle">Potential matches only — eligibility is confirmed by the agency or lender.</p>
            <Link href="/funding" className="mt-2 inline-flex items-center gap-1 text-[13px] text-brand-700 font-medium hover:underline">All funding matches <ArrowRight className="size-3.5" /></Link>
          </div>
        </Card>
      </div>

      {!ctx.isStaff && (team.bookkeeper || team.accountant) && (
        <Card>
          <div className="flex flex-col md:flex-row md:items-center gap-4 px-5 py-4">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <div className="text-[15px] font-semibold">Your Fabrik accounting team</div>
                <Badge tone="ai" title="Proposed Fondo-inspired addition: a named, consistent accounting contact">Dedicated team</Badge>
              </div>
              <p className="text-[13px] text-muted mt-0.5">AI does the routine work. These people review exceptions, reconcile accounts and approve your close.</p>
            </div>
            <div className="flex flex-wrap gap-4">
              {[
                { role: "Dedicated accountant", user: team.accountant },
                { role: "Reviewer", user: team.reviewer },
              ].map(({ role, user }) =>
                user ? (
                  <div key={role} className="flex items-center gap-2.5">
                    <Avatar name={user.name} hue={user.avatarHue} size={34} />
                    <div className="leading-tight">
                      <div className="text-[13px] font-medium">{user.name}</div>
                      <div className="text-[12px] text-muted">{role}</div>
                    </div>
                  </div>
                ) : null,
              )}
            </div>
            <AskAccountantButton />
          </div>
        </Card>
      )}
      <p className="text-[12px] text-subtle">
        Figures are accrual-basis from QuickBooks Online as of {prettyDate(k.asOf, { year: true })}. Cash <Money cents={k.cash} /> · AR aging and bills from Collect and Bills.
      </p>
    </div>
  );
}
