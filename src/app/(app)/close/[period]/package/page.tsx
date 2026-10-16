import { notFound } from "next/navigation";
import { Download, Sparkles } from "lucide-react";
import { requireCtx, hasPerm } from "@/server/auth/session";
import { financePackage } from "@/server/services/package";
import { AiBadge, Badge, Card, CardHeader, KpiCard, Notice, PageHeader, StatusPill, buttonClass } from "@/components/ui/primitives";
import { RevenueExpenseChart } from "@/components/charts";
import { ReportTable } from "@/components/books/report";
import { money, moneyCompact, signedPct } from "@/lib/format";
import { prettyDate, prettyDateTime } from "@/lib/dates";

export const metadata = { title: "Finance package" };

export default async function PackagePage({ params }: { params: Promise<{ period: string }> }) {
  const ctx = await requireCtx();
  const { period } = await params;
  if (!/^\d{4}-\d{2}$/.test(period)) notFound();
  const pkg = await financePackage(ctx.org.id, period);
  const draft = pkg.status !== "closed";
  return (
    <div className="max-w-[1100px] space-y-6">
      <PageHeader
        eyebrow={ctx.org.legalName}
        title={pkg.title}
        badge={<StatusPill status={pkg.status} label={draft ? "Draft — books not closed" : "Closed & reviewed"} />}
        description={draft ? "This package updates as the close progresses. It's finalized when the reviewer approves the books." : `Generated ${prettyDateTime(pkg.generatedAt!)} UTC when the books were closed.`}
        actions={hasPerm(ctx, "reports:export") ? <a className={buttonClass("primary")} href={`/api/v1/close/${period}/package`}><Download className="size-4" /> Download PDF</a> : undefined}
      />
      {draft && <Notice tone="warn" title="Draft">Some transactions may still be under review, so figures can change before the close is approved.</Notice>}

      <Card>
        <CardHeader title="Executive summary" subtitle="What changed this month, in plain English" action={<AiBadge label="AI-generated observations" />} />
        <ul className="px-5 pb-5 space-y-2.5">
          {pkg.observations.map((o) => (
            <li key={o} className="flex gap-3 text-[14.5px] leading-relaxed">
              <Sparkles className="size-4 text-ai-500 mt-1 shrink-0" />
              {o}
            </li>
          ))}
        </ul>
      </Card>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Revenue" value={moneyCompact(pkg.summary.revenue)} hint={`${signedPct(pkg.summary.revenueChange)} vs prior month`} />
        <KpiCard label="Expenses" value={moneyCompact(pkg.summary.expenses)} hint={`${signedPct(pkg.summary.expenseChange)} vs prior month`} />
        <KpiCard label="Net income" value={moneyCompact(pkg.summary.net)} />
        <KpiCard label="Ending cash" value={moneyCompact(pkg.summary.cashEnd)} hint={`${money(pkg.summary.cashChange, { sign: true })} this month`} />
      </section>

      <Card>
        <CardHeader title="Revenue & expense trend" subtitle="Last six months" />
        <div className="px-5 pb-5">
          <RevenueExpenseChart series={{ "6m": pkg.trend.map((t) => ({ ...t, partial: false })) }} ranges={[{ value: "6m", label: "6M" }]} defaultRange="6m" height={230} />
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Major expense changes" subtitle="vs. prior month" />
          <table className="w-full text-[13px]">
            <tbody>
              {pkg.changes.map((c) => (
                <tr key={c.sub} className="border-t border-line">
                  <td className="px-5 py-2.5">{c.name}</td>
                  <td className="px-3 py-2.5 text-right tabular text-muted">{money(c.prev)}</td>
                  <td className="px-3 py-2.5 text-right tabular">{money(c.cur)}</td>
                  <td className="px-5 py-2.5 text-right tabular font-medium">{money(c.delta, { sign: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <CardHeader title="Notable transactions" subtitle="Largest of the month" />
          <table className="w-full text-[13px]">
            <tbody>
              {pkg.largest.map((t) => (
                <tr key={t.id} className="border-t border-line">
                  <td className="px-5 py-2.5 text-muted whitespace-nowrap tabular">{prettyDate(t.date)}</td>
                  <td className="px-3 py-2.5"><div className="font-medium">{t.vendor}</div><div className="text-[12px] text-muted">{t.account}</div></td>
                  <td className="px-5 py-2.5 text-right tabular font-medium whitespace-nowrap">{money(t.amount, { decimals: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {pkg.unusual.length > 0 && (
            <div className="px-5 py-3 border-t border-line">
              <div className="text-[12px] font-semibold text-muted mb-1.5">Reviewed by a person</div>
              <div className="flex flex-wrap gap-1.5">
                {pkg.unusual.map((u) => <Badge key={u.id} tone="warn">{u.vendor} · {u.reason}</Badge>)}
              </div>
            </div>
          )}
        </Card>
      </div>

      {pkg.reports.map((r) => (
        <Card key={r.kind} className="overflow-hidden">
          <div className="px-5 pt-4 pb-3 border-b border-line flex items-baseline justify-between gap-2 flex-wrap">
            <h2 className="text-[16px] font-semibold">{r.title}</h2>
            <span className="text-[12.5px] text-muted">{r.subtitle}</span>
          </div>
          <ReportTable report={r} />
        </Card>
      ))}
    </div>
  );
}
