import Link from "next/link";
import { AlertTriangle, CheckCircle2, Info, TrendingUp } from "lucide-react";
import { requireCtx } from "@/server/auth/session";
import { cfoInsights, getForecast, getKpis, scenarioBaseline, ledgerDataFor } from "@/server/services/finance";
import { balances, buildPostings } from "@/server/engines/ledger";
import { AiBadge, Badge, Card, CardHeader, KpiCard, PageHeader } from "@/components/ui/primitives";
import { ForecastChart } from "@/components/charts";
import { ForecastControls, ForecastWeeks } from "@/components/cfo/forecast";
import { ScenarioLab } from "@/components/cfo/scenarios";
import { money, moneyCompact } from "@/lib/format";
import { today } from "@/lib/dates";
import { cn } from "@/lib/cn";
import type { ScenarioType } from "@/lib/types";

export const metadata = { title: "CFO" };

const ICON = { positive: TrendingUp, warning: AlertTriangle, info: Info, opportunity: CheckCircle2 };

export default async function CfoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const tab = sp.tab === "forecast" ? "forecast" : sp.tab === "scenarios" ? "scenarios" : "dashboard";
  const tabs = [["dashboard", "CFO dashboard"], ["forecast", "13-week cash forecast"], ["scenarios", "Scenarios"]] as const;
  return (
    <div>
      <PageHeader title="CFO" description="Your accounting turned into decisions: where cash is heading, what's changed, and what a big purchase would do to the business." />
      <div className="flex items-center gap-1 border-b border-line mb-5 overflow-x-auto" role="tablist">
        {tabs.map(([k, l]) => (
          <Link key={k} href={k === "dashboard" ? "/cfo" : `/cfo?tab=${k}`} role="tab" aria-selected={tab === k} className={cn("relative px-3 h-10 inline-flex items-center text-[13.5px] font-medium whitespace-nowrap", tab === k ? "text-ink after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:bg-brand-600 after:rounded" : "text-muted hover:text-ink")}>{l}</Link>
        ))}
      </div>
      {tab === "dashboard" && <Dashboard />}
      {tab === "forecast" && <ForecastTab />}
      {tab === "scenarios" && (
        <ScenarioLab
          initialType={(["land_purchase", "equipment_purchase", "hire_employees", "revenue_change", "customer_default"].includes(sp.type ?? "") ? sp.type : "land_purchase") as ScenarioType}
          initialInputs={Object.fromEntries(Object.entries(sp).filter(([k, v]) => !["tab", "type"].includes(k) && v != null && !Number.isNaN(Number(v))).map(([k, v]) => [k, Number(v)]))}
        />
      )}
    </div>
  );

  async function Dashboard() {
    const k = getKpis(ctx.org.id);
    const f = getForecast(ctx.org.id);
    const b = scenarioBaseline(ctx.org.id);
    const insights = cfoInsights(ctx.org.id);
    const ld = ledgerDataFor(ctx.org.id);
    const bal = balances(buildPostings(ld), today());
    let curAssets = 0;
    let curLiab = 0;
    for (const a of ld.accounts) {
      const v = bal.get(a.id) ?? 0;
      if (a.subtype === "bank" || a.subtype === "accounts_receivable" || a.subtype === "prepaid") curAssets += v;
      if (["accounts_payable", "credit_card", "payroll_liabilities", "operating_loc"].includes(a.subtype)) curLiab -= v;
    }
    const ebitda = b.ttmProfit + b.ttmInterest + b.ttmDepreciation;
    const ratios = [
      { label: "Current ratio", value: curLiab ? (curAssets / curLiab).toFixed(2) : "—", note: "Current assets ÷ current liabilities" },
      { label: "Working capital", value: moneyCompact(curAssets - curLiab), note: "Current assets − current liabilities" },
      { label: "Debt-to-assets", value: `${((b.totalDebt / b.totalAssets) * 100).toFixed(0)}%`, note: "Loans ÷ total assets" },
      { label: "Debt service coverage", value: b.annualDebtService ? `${(ebitda / b.annualDebtService).toFixed(2)}×` : "—", note: "TTM EBITDA ÷ TTM debt payments" },
    ];
    return (
      <div className="space-y-6">
        <section className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
          <KpiCard label="Cash" value={moneyCompact(k.cash)} />
          <KpiCard label="Revenue YTD" value={moneyCompact(k.revenueYtd)} />
          <KpiCard label="Expenses YTD" value={moneyCompact(k.expensesYtd)} />
          <KpiCard label="Net income YTD" value={moneyCompact(k.netIncomeYtd)} />
          <KpiCard label="Operating margin" value={`${(k.operatingMargin * 100).toFixed(1)}%`} />
          <KpiCard label="Receivables (AR)" value={moneyCompact(k.receivables)} href="/collect" />
          <KpiCard label="Payables (AP)" value={moneyCompact(k.upcomingBills)} href="/bills" />
          <KpiCard label="Cash in 13 weeks" value={moneyCompact(f.endingCash)} hint={`low ${moneyCompact(f.minCash)}`} href="/cfo?tab=forecast" />
        </section>
        <div className="grid xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-6">
          <Card>
            <CardHeader title="13-week projected cash" subtitle="Known amounts are solid; estimated amounts are hatched" action={<Link href="/cfo?tab=forecast" className="text-[13px] text-brand-700 hover:underline">Inspect</Link>} />
            <div className="px-5 pb-5">
              <ForecastChart startingCash={f.startingCash} buffer={f.bufferCents} weeks={f.weeks.map((w) => ({ label: `W${w.index}`, range: w.label, closing: w.closing, inKnown: w.inKnown, inEstimated: w.inEstimated, outKnown: w.outKnown, outEstimated: w.outEstimated }))} height={250} />
            </div>
          </Card>
          <Card>
            <CardHeader title="AI insights" subtitle="Material financial changes, grounded in your books" action={<AiBadge label="AI-generated" />} />
            <ul className="px-3 pb-3">
              {insights.map((i) => {
                const Icon = ICON[i.tone];
                return (
                  <li key={i.id}>
                    <Link href={i.href} className="flex gap-3 rounded-xl px-2.5 py-2.5 hover:bg-surface-2">
                      <Icon className={cn("size-4 mt-0.5 shrink-0", i.tone === "warning" ? "text-warn-500" : i.tone === "positive" ? "text-ok-600" : "text-info-600")} />
                      <span>
                        <span className="block text-[13.5px]">{i.text}</span>
                        <span className="block text-[11.5px] text-subtle mt-0.5">{i.basis}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
        <Card>
          <CardHeader title="Business ratios" subtitle="Trailing twelve months where applicable" />
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-line border-t border-line">
            {ratios.map((r) => (
              <div key={r.label} className="px-5 py-4">
                <div className="text-[12.5px] text-muted">{r.label}</div>
                <div className="text-[22px] font-semibold tabular mt-0.5">{r.value}</div>
                <div className="text-[11.5px] text-subtle mt-0.5">{r.note}</div>
              </div>
            ))}
          </div>
        </Card>
        <p className="text-[12px] text-subtle">TTM revenue {money(b.ttmRevenue)} · TTM profit {money(b.ttmProfit)} · total debt {money(b.totalDebt)} · {b.acresFarmed.toLocaleString("en-US")} acres farmed.</p>
      </div>
    );
  }

  async function ForecastTab() {
    const grain = sp.grain ? Math.min(1.2, Math.max(0, Number(sp.grain) / 100)) : 0.7;
    const buffer = sp.buffer ? Math.max(0, Number(sp.buffer)) : 150_000;
    const includeEstimated = sp.est !== "0";
    const f = getForecast(ctx.org.id, { grainFactor: grain, bufferDollars: buffer, includeEstimated });
    return (
      <div className="space-y-6">
        <ForecastControls grain={Math.round(grain * 100)} buffer={buffer} includeEstimated={includeEstimated} />
        <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KpiCard label="Cash today" value={moneyCompact(f.startingCash)} />
          <KpiCard label="Week 13" value={moneyCompact(f.endingCash)} />
          <KpiCard label="Lowest point" value={moneyCompact(f.minCash)} hint={`week ${f.minWeek}`} />
          <KpiCard label="Known in / out" value={`${moneyCompact(f.totals.inKnown)} / ${moneyCompact(f.totals.outKnown)}`} />
          <KpiCard label="Estimated in / out" value={`${moneyCompact(f.totals.inEstimated)} / ${moneyCompact(f.totals.outEstimated)}`} />
        </section>
        <Card>
          <CardHeader title="Projected cash by week" subtitle={f.weeksBelowBuffer.length ? `Below the ${moneyCompact(f.bufferCents)} buffer in weeks ${f.weeksBelowBuffer.join(", ")}` : `Stays above the ${moneyCompact(f.bufferCents)} buffer all 13 weeks`} action={<Badge tone={f.weeksBelowBuffer.length ? "warn" : "ok"}>{f.weeksBelowBuffer.length ? "Watch" : "Sufficient"}</Badge>} />
          <div className="px-5 pb-5">
            <ForecastChart startingCash={f.startingCash} buffer={f.bufferCents} weeks={f.weeks.map((w) => ({ label: `W${w.index}`, range: w.label, closing: w.closing, inKnown: w.inKnown, inEstimated: w.inEstimated, outKnown: w.outKnown, outEstimated: w.outEstimated }))} />
          </div>
        </Card>
        <div className="grid xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-6">
          <ForecastWeeks weeks={f.weeks} buffer={f.bufferCents} />
          <div className="space-y-5">
            <Card>
              <CardHeader title="Assumptions" subtitle="What the forecast is based on — adjust above" />
              <ul className="px-5 pb-4">
                {f.assumptions.map((a) => (
                  <li key={a.key} className="py-2.5 border-t border-line first:border-0">
                    <div className="text-[13px] font-medium">{a.label}</div>
                    <div className="text-[13px] text-ink-2">{a.value}</div>
                    <div className="text-[11.5px] text-muted mt-0.5">{a.basis}</div>
                  </li>
                ))}
              </ul>
            </Card>
            {f.excluded.length > 0 && (
              <Card>
                <CardHeader title="Excluded from the forecast" />
                <ul className="px-5 pb-4">
                  {f.excluded.map((x) => (
                    <li key={x.label} className="py-2 border-t border-line first:border-0 text-[13px]">
                      <div className="flex justify-between gap-2"><span className="font-medium">{x.label}</span><span className="tabular">{money(x.amount)}</span></div>
                      <div className="text-[12px] text-muted">{x.reason}</div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>
      </div>
    );
  }
}
