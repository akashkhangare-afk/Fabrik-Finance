import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Circle, CircleDot, Inbox, Lightbulb, TrendingUp } from "lucide-react";
import { requireCtx } from "@/server/auth/session";
import { getKpis, getTrend, financeBrief } from "@/server/services/finance";
import { currentClose, periodLabel } from "@/server/services/close";
import { inboxSummary } from "@/server/services/workflow";
import { fundingSummary } from "@/server/services/funding";
import { showExtras } from "@/server/config";
import { Card, CardHeader, KpiCard, LinkButton, ProgressBar, AiBadge } from "@/components/ui/primitives";
import { RevenueExpenseChart, type MonthPoint } from "@/components/charts";
import { AskAccountantButton } from "@/components/home/ask-accountant";
import { monthLabel, prettyDate } from "@/lib/dates";
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
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.02em]">Home</h1>
        {showExtras() && !ctx.isStaff && <AskAccountantButton />}
      </header>

      {inbox.total > 0 && (
        <Card className="relative overflow-hidden border-[#f1c9b4]/70">
          <div className="absolute inset-y-0 left-0 w-1 bg-risk-600" aria-hidden />
          <div className="absolute -right-16 -top-16 size-48 rounded-full bg-risk-50 blur-2xl" aria-hidden />
          <div className="relative flex flex-col sm:flex-row sm:items-center gap-4 pl-6 pr-5 py-4">
            <span className="hidden sm:flex size-11 rounded-xl bg-risk-50 text-risk-600 ring-1 ring-inset ring-[#f1c9b4] items-center justify-center shrink-0">
              <Inbox className="size-5" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-risk-600">Fabrik needs your help</div>
              <div className="text-[16px] font-semibold mt-0.5 tracking-[-0.01em]">{plural(inbox.total, "item")} need your input</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {attention.map((a) => (
                  <span key={a.one} className="inline-flex items-center h-6 px-2 rounded-md bg-surface-2 ring-1 ring-inset ring-line text-[12.5px] text-ink-2"><span className="font-semibold tabular mr-1">{a.n}</span>{a.n === 1 ? a.one : a.many}</span>
                ))}
              </div>
            </div>
            <LinkButton href="/inbox" variant="primary" size="lg" className="shrink-0">Review <ArrowRight className="size-4" /></LinkButton>
          </div>
        </Card>
      )}

      <section aria-label="Key figures" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard label="Cash" value={moneyCompact(k.cash)} href="/cfo?tab=forecast" />
        <KpiCard label="Revenue YTD" value={moneyCompact(k.revenueYtd)} href="/books?tab=reports" />
        <KpiCard label="Expenses YTD" value={moneyCompact(k.expensesYtd)} href="/books?tab=reports" />
        <KpiCard label="Net income YTD" value={moneyCompact(k.netIncomeYtd)} href="/books?tab=reports" />
        <KpiCard label="Receivables" value={moneyCompact(k.receivables)} hint={k.receivablesOver30 ? `${moneyCompact(k.receivablesOver30)} over 30 days` : "all current"} href="/collect" />
        <KpiCard label="Upcoming bills" value={moneyCompact(k.upcomingBills)} hint={`${moneyCompact(k.billsDueThisWeek)} due this week`} href="/bills" />
      </section>

      <div className="grid xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] gap-6">
        <Card>
          <CardHeader title="Revenue vs expenses" />
          <div className="px-5 pb-5">
            <RevenueExpenseChart height={320} series={series} defaultRange="12m" ranges={[{ value: "3m", label: "3M" }, { value: "6m", label: "6M" }, { value: "12m", label: "12M" }, { value: "ytd", label: "YTD" }]} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Fabrik Finance Brief" action={<AiBadge label="AI-generated" />} />
          <ul className="px-3 pb-3">
            {brief.map((b) => {
              const Icon = TONE_ICON[b.tone];
              return (
                <li key={b.id}>
                  <Link href={b.href} className="group flex gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-surface-2">
                    <span className={cn("size-8 rounded-lg flex items-center justify-center shrink-0", TONE_CLS[b.tone])}>
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] text-ink leading-snug">{b.text}</span>
                      <span className="block text-[11.5px] text-subtle mt-0.5">{b.basis}</span>
                    </span>
                    <ArrowRight className="size-4 text-brand-600 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 mt-2 shrink-0" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader
          title={`${periodLabel(close.cp.period)} books`}
          subtitle={close.cp.status === "closed" ? "Closed and reviewed" : `Target close ${prettyDate(close.cp.targetCloseDate)}`}
          action={<Link href="/close" className="inline-flex items-center gap-1 text-[13px] text-brand-700 font-medium hover:underline underline-offset-4">View monthly close <ArrowRight className="size-3.5" /></Link>}
        />
        <div className="px-5 pb-5 grid gap-5 lg:grid-cols-[200px_minmax(0,1fr)] lg:items-center">
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[34px] leading-none font-semibold tracking-[-0.03em] tabular">{close.pct}%</span>
              <span className="text-[13px] text-muted">complete</span>
            </div>
            <ProgressBar value={close.pct / 100} label="Close progress" className="mt-3" />
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-2">
            {close.tasks.map((t) => (
              <li key={t.key} className={cn("flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] ring-1 ring-inset", t.state === "done" ? "bg-surface-2 ring-line text-ink-2" : t.state === "in_progress" ? "bg-warn-50/60 ring-[#efd9a6] text-ink font-medium" : "bg-surface ring-line text-ink font-medium")}>
                {t.state === "done" ? <CheckCircle2 className="size-4 text-ok-600 shrink-0" /> : t.state === "in_progress" ? <CircleDot className="size-4 text-warn-500 shrink-0" /> : <Circle className="size-4 text-line-strong shrink-0" />}
                <span className="leading-snug">{t.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </div>
  );
}
