"use client";

import { useEffect, useState, useTransition } from "react";
import { Building, HandCoins, Tractor, TrendingDown, Users, Save } from "lucide-react";
import type { ScenarioType } from "@/lib/types";
import { cn } from "@/lib/cn";
import { money, moneyCompact } from "@/lib/format";
import { SCENARIO_DEFAULTS, SCENARIO_TITLES, type ScenarioInputs } from "@/server/engines/scenarios";
import { computeScenario, saveScenario } from "@/app/actions/app";
import { Button, Card, CardHeader, Field, Input, Notice, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/client";
import { ScenarioChart } from "@/components/charts";

const TYPES: { type: ScenarioType; icon: typeof Building; blurb: string }[] = [
  { type: "land_purchase", icon: Building, blurb: "e.g. $1M of farmland with 30% down" },
  { type: "equipment_purchase", icon: Tractor, blurb: "e.g. $250K planter and sprayer" },
  { type: "hire_employees", icon: Users, blurb: "e.g. three seasonal hires" },
  { type: "revenue_change", icon: TrendingDown, blurb: "e.g. revenue falls 20%" },
  { type: "customer_default", icon: HandCoins, blurb: "Largest customer stops paying" },
];

/** Inputs per scenario; the first HEADLINE[type] are shown, the rest sit under "More assumptions". */
const FIELDS: Record<ScenarioType, { key: keyof ScenarioInputs; label: string; suffix?: string; prefix?: string; min?: number; max?: number }[]> = {
  land_purchase: [
    { key: "price", label: "Purchase price", prefix: "$" },
    { key: "downPct", label: "Down payment", suffix: "%", min: 0, max: 100 },
    { key: "ratePct", label: "Interest rate", suffix: "%" },
    { key: "termYears", label: "Loan term", suffix: "yrs" },
    { key: "closeWeek", label: "Closing week", min: 1, max: 13 },
    { key: "acres", label: "Acres" },
    { key: "netPerAcre", label: "Expected net income per acre", prefix: "$" },
  ],
  equipment_purchase: [
    { key: "price", label: "Purchase price", prefix: "$" },
    { key: "financedPct", label: "Financed", suffix: "%", min: 0, max: 100 },
    { key: "ratePct", label: "Interest rate", suffix: "%" },
    { key: "termYears", label: "Loan term", suffix: "yrs" },
    { key: "closeWeek", label: "Purchase week", min: 1, max: 13 },
    { key: "depreciationYears", label: "Depreciation", suffix: "yrs" },
  ],
  hire_employees: [
    { key: "count", label: "New employees" },
    { key: "salary", label: "Salary each", prefix: "$" },
    { key: "burdenPct", label: "Taxes & benefits", suffix: "%" },
    { key: "startWeek", label: "Start week", min: 1, max: 13 },
  ],
  revenue_change: [{ key: "changePct", label: "Revenue change", suffix: "%" }],
  customer_default: [],
};

const HEADLINE: Record<ScenarioType, number> = { land_purchase: 2, equipment_purchase: 2, hire_employees: 2, revenue_change: 1, customer_default: 0 };

type Result = Extract<Awaited<ReturnType<typeof computeScenario>>, { ok: true }>["data"];

export function ScenarioLab({ initialType, initialInputs, canSave }: { initialType: ScenarioType; initialInputs: Record<string, number>; canSave: boolean }) {
  const [type, setType] = useState<ScenarioType>(initialType);
  const [inputs, setInputs] = useState<ScenarioInputs>({ ...SCENARIO_DEFAULTS[initialType], ...initialInputs });
  const [result, setResult] = useState<Result>();
  const [pending, start] = useTransition();
  const toast = useToast();
  const run = (t: ScenarioType, i: ScenarioInputs) =>
    start(async () => {
      const r = await computeScenario(t, i);
      if (r.ok) setResult(r.data);
      else toast({ tone: "error", title: r.error });
    });
  useEffect(() => {
    run(type, inputs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);
  const pick = (t: ScenarioType) => {
    setType(t);
    setInputs({ ...SCENARIO_DEFAULTS[t] });
    setResult(undefined);
  };
  const r = result;
  const input = (f: (typeof FIELDS)[ScenarioType][number]) => (
    <Field key={f.key} label={f.label} htmlFor={`sc-${f.key}`}>
      <div className="relative">
        {f.prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-[13px]">{f.prefix}</span>}
        <Input id={`sc-${f.key}`} inputMode="decimal" value={String(inputs[f.key] ?? "")} onChange={(e) => setInputs({ ...inputs, [f.key]: Number(e.target.value.replace(/[,$%]/g, "")) || 0 })} className={cn(f.prefix && "pl-6", f.suffix && "pr-10")} />
        {f.suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted text-[13px]">{f.suffix}</span>}
      </div>
    </Field>
  );
  const verdictTone = r?.verdict.level === "comfortable" ? "ok" : r?.verdict.level === "caution" ? "warn" : "crit";
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {TYPES.map(({ type: t, icon: Icon, blurb }) => (
          <button key={t} onClick={() => pick(t)} aria-pressed={type === t} className={cn("text-left rounded-xl border px-3.5 py-3 transition", type === t ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500" : "border-line bg-surface hover:border-line-strong")}>
            <Icon className={cn("size-4.5", type === t ? "text-brand-700" : "text-muted")} />
            <div className="text-[13.5px] font-semibold mt-2">{SCENARIO_TITLES[t]}</div>
            <div className="text-[11.5px] text-muted mt-0.5">{blurb}</div>
          </button>
        ))}
      </div>

      <div className="grid xl:grid-cols-[340px_minmax(0,1fr)] gap-5">
        <Card className="h-fit">
          <CardHeader title="Inputs" />
          <form className="px-5 pb-5 space-y-3" onSubmit={(e) => { e.preventDefault(); run(type, inputs); }}>
            {FIELDS[type].length === 0 && <p className="text-[13px] text-muted">Uses your largest open receivable from Collect — no inputs needed.</p>}
            {FIELDS[type].slice(0, HEADLINE[type]).map(input)}
            {FIELDS[type].length > HEADLINE[type] && (
              <details className="pt-1">
                <summary className="cursor-pointer text-[13px] text-brand-700 font-medium">More assumptions</summary>
                <div className="space-y-3 mt-3">{FIELDS[type].slice(HEADLINE[type]).map(input)}</div>
              </details>
            )}
            <div className="flex gap-2 pt-1">
              <Button type="submit" variant="primary" className="flex-1" disabled={pending}>{pending ? "Calculating…" : "Run scenario"}</Button>
              {canSave && <Button type="button" disabled={pending || !r} onClick={async () => { const s = await saveScenario(type, `${SCENARIO_TITLES[type]} · ${new Date().toLocaleDateString()}`, inputs); toast(s.ok ? { tone: "success", title: s.message ?? "Saved" } : { tone: "error", title: s.error }); }} aria-label="Save scenario"><Save className="size-4" /></Button>}
            </div>
          </form>
        </Card>

        <div className="space-y-5 min-w-0">
          {!r ? (
            <Card className="p-5 space-y-3"><Skeleton className="h-6 w-2/3" /><Skeleton className="h-40" /><Skeleton className="h-24" /></Card>
          ) : (
            <>
              <Notice tone={verdictTone} title={r.verdict.headline}>
                <ul className="mt-1.5 space-y-0.5 list-disc pl-4">
                  {r.verdict.points.map((p) => <li key={p}>{p}</li>)}
                </ul>
              </Notice>
              <Card className="overflow-hidden">
                <CardHeader title="Impact" />
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="text-[12px] text-muted bg-surface-2 border-y border-line">
                        <th className="px-5 py-2 text-left font-medium">Measure</th>
                        <th className="px-3 py-2 text-right font-medium">Baseline</th>
                        <th className="px-3 py-2 text-right font-medium">With scenario</th>
                        <th className="px-5 py-2 text-right font-medium">Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ["Cash in week 13", r.baseline.cashWeek13, r.scenario.cashWeek13],
                        ["Annual expenses (TTM)", r.baseline.annualExpenses, r.scenario.annualExpenses],
                        ["Annual profit (TTM)", r.baseline.annualProfit, r.scenario.annualProfit],
                        ["Total debt", r.baseline.totalDebt, r.scenario.totalDebt],
                      ].map(([label, a, b]) => {
                        const fmt = (v: number) => moneyCompact(v);
                        const d = (b as number) - (a as number);
                        return (
                          <tr key={label as string} className="border-b border-line last:border-0">
                            <td className="px-5 py-2.5">{label as string}</td>
                            <td className="px-3 py-2.5 text-right tabular text-muted">{fmt(a as number)}</td>
                            <td className="px-3 py-2.5 text-right tabular font-semibold">{fmt(b as number)}</td>
                            <td className={cn("px-5 py-2.5 text-right tabular", d < 0 ? "text-risk-600" : "text-ink-2")}>{d === 0 ? "–" : money(d, { sign: true })}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
              <Card>
                <CardHeader title="13-week cash position" />
                <div className="px-5 pb-5"><ScenarioChart data={r.chart} buffer={r.scenarioForecast.bufferCents} /></div>
              </Card>
              <Card>
                <CardHeader title="Assumptions used" />
                <ul className="px-5 pb-4">
                  {r.assumptions.map((a) => (
                    <li key={a.key} className="py-2 border-t border-line first:border-0 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 text-[13px]">
                      <span className="sm:w-56 shrink-0 text-muted">{a.label}</span>
                      <span className="font-medium">{a.value}</span>
                      <span className="text-[12px] text-subtle sm:ml-auto">{a.basis}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
