import type { Cents, ScenarioType } from "@/lib/types";
import { addDays } from "@/lib/dates";
import { amortizedPayment, buildForecast, weekWindows, type Assumption, type Forecast, type ForecastInput, type ForecastLine } from "./forecast";

/**
 * CFO scenarios (Expo PRD §20). Each scenario turns user inputs into forecast adjustments and
 * annual P&L / balance-sheet effects, and always returns the assumptions it used.
 */

export interface Baseline {
  ttmRevenue: Cents;
  ttmExpenses: Cents;
  ttmProfit: Cents;
  ttmDepreciation: Cents;
  ttmInterest: Cents;
  annualDebtService: Cents;
  totalDebt: Cents;
  totalAssets: Cents;
  acresFarmed: number;
  largestCustomer?: { id: string; name: string; openAr: Cents; lines: string[] };
}

export interface ScenarioInputs {
  // land_purchase
  price?: number;
  downPct?: number;
  ratePct?: number;
  termYears?: number;
  closeWeek?: number;
  acres?: number;
  netPerAcre?: number;
  // equipment_purchase
  financedPct?: number;
  depreciationYears?: number;
  // hire_employees
  count?: number;
  salary?: number;
  burdenPct?: number;
  startWeek?: number;
  // revenue_change
  changePct?: number;
}

export interface ScenarioMetrics {
  cashNow: Cents;
  cashWeek13: Cents;
  minCash: Cents;
  annualExpenses: Cents;
  annualProfit: Cents;
  totalDebt: Cents;
  debtToAssets: number;
  dscr: number | null;
}

export interface ScenarioResult {
  type: ScenarioType;
  title: string;
  inputs: ScenarioInputs;
  baseline: ScenarioMetrics;
  scenario: ScenarioMetrics;
  baselineForecast: Forecast;
  scenarioForecast: Forecast;
  assumptions: Assumption[];
  verdict: { level: "comfortable" | "caution" | "strain"; headline: string; points: string[] };
}

const D = 100;

export const SCENARIO_DEFAULTS: Record<ScenarioType, ScenarioInputs> = {
  land_purchase: { price: 1_000_000, downPct: 30, ratePct: 6.75, termYears: 25, closeWeek: 8, acres: 80, netPerAcre: 0 },
  equipment_purchase: { price: 250_000, financedPct: 80, ratePct: 7.25, termYears: 5, closeWeek: 4, depreciationYears: 7 },
  hire_employees: { count: 3, salary: 48_000, burdenPct: 18, startWeek: 3 },
  revenue_change: { changePct: -20 },
  customer_default: {},
};

export const SCENARIO_TITLES: Record<ScenarioType, string> = {
  land_purchase: "Purchase farmland",
  equipment_purchase: "Purchase equipment",
  hire_employees: "Hire employees",
  revenue_change: "Revenue changes",
  customer_default: "Largest customer stops paying",
};

function metrics(b: Baseline, f: Forecast, delta: { expenses?: Cents; profit?: Cents; debt?: Cents; assets?: Cents; debtService?: Cents; interest?: Cents }): ScenarioMetrics {
  const debt = b.totalDebt + (delta.debt ?? 0);
  const assets = b.totalAssets + (delta.assets ?? 0);
  const profit = b.ttmProfit + (delta.profit ?? 0);
  const ds = b.annualDebtService + (delta.debtService ?? 0);
  const ebitda = profit + b.ttmInterest + (delta.interest ?? 0) + b.ttmDepreciation;
  return {
    cashNow: f.startingCash,
    cashWeek13: f.endingCash,
    minCash: f.minCash,
    annualExpenses: b.ttmExpenses + (delta.expenses ?? 0),
    annualProfit: profit,
    totalDebt: debt,
    debtToAssets: assets > 0 ? debt / assets : 0,
    dscr: ds > 0 ? ebitda / ds : null,
  };
}

export function runScenario(type: ScenarioType, raw: ScenarioInputs, base: ForecastInput, b: Baseline): ScenarioResult {
  const inputs: ScenarioInputs = { ...SCENARIO_DEFAULTS[type], ...raw };
  const windows = weekWindows(base.today);
  const weekDate = (w: number) => windows[Math.min(Math.max(1, Math.round(w)), windows.length) - 1]!.start;
  const extra: ForecastLine[] = [];
  const assumptions: Assumption[] = [];
  let delta: Parameters<typeof metrics>[2] = {};
  let modified = base.lines;
  const line = (id: string, label: string, direction: "in" | "out", date: string, amount: Cents, source: string): ForecastLine => ({ id, label, category: "scenario", direction, certainty: "estimated", date, amount: Math.round(amount), source });

  switch (type) {
    case "land_purchase":
    case "equipment_purchase": {
      const price = inputs.price! * D;
      const downPct = type === "land_purchase" ? inputs.downPct! : 100 - inputs.financedPct!;
      const down = Math.round((price * downPct) / 100);
      const closing = type === "land_purchase" ? Math.round(price * 0.015) : 0;
      const loan = price - down;
      const close = weekDate(inputs.closeWeek!);
      extra.push(line("sc-down", type === "land_purchase" ? "Land purchase — down payment" : "Equipment purchase — cash portion", "out", close, down + closing, `${downPct}% down${closing ? " + 1.5% closing costs" : ""}`));
      const periods = type === "land_purchase" ? 1 : 12;
      const pmt = loan > 0 ? amortizedPayment(loan, inputs.ratePct!, inputs.termYears!, periods) : 0;
      const annualDs = pmt * periods;
      if (type === "equipment_purchase" && loan > 0) {
        for (let d = addDays(close, 30); d <= windows.at(-1)!.end; d = addDays(d, 30)) extra.push(line(`sc-pmt-${d}`, "Equipment loan payment", "out", d, pmt, `${inputs.termYears}-yr loan at ${inputs.ratePct}%`));
      }
      const interestY1 = Math.round((loan * inputs.ratePct!) / 100);
      const depreciation = type === "equipment_purchase" ? Math.round(price / inputs.depreciationYears!) : 0;
      const addedNet = type === "land_purchase" ? Math.round(inputs.acres! * inputs.netPerAcre! * D) : 0;
      delta = { debt: loan, assets: price, debtService: annualDs, interest: interestY1, expenses: interestY1 + depreciation, profit: addedNet - interestY1 - depreciation };
      assumptions.push(
        { key: "price", label: "Purchase price", value: `$${inputs.price!.toLocaleString("en-US")}`, basis: "Scenario input" },
        { key: "down", label: type === "land_purchase" ? "Down payment" : "Cash portion", value: `${downPct}% ($${(down / D).toLocaleString("en-US")})`, basis: "Scenario input" },
        { key: "rate", label: "Interest rate", value: `${inputs.ratePct}% for ${inputs.termYears} years`, basis: "Scenario input — confirm with your lender" },
        { key: "timing", label: "Closing", value: `Week ${inputs.closeWeek}`, basis: "Scenario input" },
        { key: "ds", label: "Added annual debt service", value: `$${Math.round(annualDs / D).toLocaleString("en-US")}`, basis: type === "land_purchase" ? "Annual level payments (typical for farm real estate loans)" : "Monthly level payments" },
      );
      if (type === "land_purchase") {
        if (closing) assumptions.push({ key: "closing", label: "Closing costs", value: "1.5% of price", basis: "Typical range; replace with your title company's estimate" });
        assumptions.push({ key: "income", label: "Added net income from the acres", value: inputs.netPerAcre ? `$${inputs.netPerAcre}/acre × ${inputs.acres} acres` : "Not included", basis: "Scenario input — conservative default is $0 until a crop budget exists" });
        assumptions.push({ key: "firstpay", label: "First loan payment", value: "Outside the 13-week window", basis: "Annual payment due one year after closing" });
      } else {
        assumptions.push({ key: "dep", label: "Depreciation (book)", value: `${inputs.depreciationYears} years straight-line`, basis: "Book depreciation; tax treatment (e.g. Section 179) is separate — see Funding" });
      }
      break;
    }
    case "hire_employees": {
      const annual = inputs.count! * inputs.salary! * D * (1 + inputs.burdenPct! / 100);
      const start = weekDate(inputs.startWeek!);
      for (let d = start; d <= windows.at(-1)!.end; d = addDays(d, 14)) extra.push(line(`sc-pay-${d}`, `Payroll — ${inputs.count} new hires`, "out", d, annual / 26, "Biweekly, fully loaded"));
      delta = { expenses: Math.round(annual), profit: -Math.round(annual) };
      assumptions.push(
        { key: "count", label: "New employees", value: String(inputs.count), basis: "Scenario input" },
        { key: "salary", label: "Salary per employee", value: `$${inputs.salary!.toLocaleString("en-US")}`, basis: "Scenario input" },
        { key: "burden", label: "Payroll taxes & benefits", value: `${inputs.burdenPct}%`, basis: "Scenario input (Smith Family Farms' current payroll tax rate is ~9%)" },
        { key: "start", label: "Start", value: `Week ${inputs.startWeek}`, basis: "Paid biweekly via existing payroll" },
      );
      break;
    }
    case "revenue_change": {
      const f = inputs.changePct! / 100;
      modified = base.lines.map((l) => (l.category === "grain_sales" ? { ...l, amount: Math.round(l.amount * (1 + f)), source: `${l.source} · adjusted ${inputs.changePct}%` } : l));
      const rev = Math.round(b.ttmRevenue * f);
      delta = { profit: rev };
      assumptions.push(
        { key: "change", label: "Revenue change", value: `${inputs.changePct}%`, basis: "Applied to estimated grain sales in the forecast and to trailing-12-month revenue" },
        { key: "costs", label: "Costs", value: "Unchanged", basis: "Conservative: input costs are largely committed for the season" },
        { key: "invoices", label: "Open invoices", value: "Collected as billed", basis: "Already-invoiced sales are not reduced" },
      );
      break;
    }
    case "customer_default": {
      const c = b.largestCustomer;
      if (c) {
        modified = base.lines.filter((l) => !c.lines.includes(l.id));
        delta = { profit: -c.openAr, expenses: c.openAr };
        assumptions.push({ key: "customer", label: "Customer", value: c.name, basis: "Largest open receivable balance" }, { key: "ar", label: "Uncollected receivables", value: `$${Math.round(c.openAr / D).toLocaleString("en-US")}`, basis: "Removed from forecast collections and written off as bad debt" });
      }
      break;
    }
  }

  const baselineForecast = buildForecast(base);
  const scenarioForecast = buildForecast({ ...base, lines: [...modified, ...extra] });
  const baseline = metrics(b, baselineForecast, {});
  const scenario = metrics(b, scenarioForecast, delta);
  return { type, title: SCENARIO_TITLES[type], inputs, baseline, scenario, baselineForecast, scenarioForecast, assumptions, verdict: verdict(type, baseline, scenario, scenarioForecast) };
}

function verdict(type: ScenarioType, base: ScenarioMetrics, sc: ScenarioMetrics, f: Forecast): ScenarioResult["verdict"] {
  const k = (c: Cents) => `$${Math.round(c / 100_000)}K`;
  const points: string[] = [];
  points.push(`Lowest projected cash in the next 13 weeks: ${k(sc.minCash)} (week ${f.minWeek}), versus ${k(base.minCash)} today.`);
  if (sc.totalDebt !== base.totalDebt) points.push(`Debt-to-assets moves from ${(base.debtToAssets * 100).toFixed(0)}% to ${(sc.debtToAssets * 100).toFixed(0)}%.`);
  if (sc.dscr != null && base.dscr != null && sc.dscr !== base.dscr) points.push(`Debt service coverage moves from ${base.dscr.toFixed(2)}× to ${sc.dscr.toFixed(2)}×.`);
  if (sc.annualProfit !== base.annualProfit) points.push(`Annual profit changes by ${k(sc.annualProfit - base.annualProfit)} on a trailing-12-month basis.`);
  const belowBuffer = f.weeksBelowBuffer.length;
  let level: ScenarioResult["verdict"]["level"] = "comfortable";
  if (sc.minCash < 0 || (sc.dscr != null && sc.dscr < 1.0)) level = "strain";
  else if (belowBuffer > 0 || (sc.dscr != null && sc.dscr < 1.25)) level = "caution";
  if (belowBuffer) points.push(`Cash falls below your ${k(f.bufferCents)} minimum buffer in ${belowBuffer} of 13 weeks.`);
  const what = SCENARIO_TITLES[type].toLowerCase();
  const headline =
    level === "comfortable"
      ? `Based on current books and forecast, the business can absorb this (${what}) while staying above its cash buffer.`
      : level === "caution"
        ? `This looks possible but tight (${what}) — it would need financing or timing changes to keep a comfortable cushion.`
        : `This would strain cash or debt capacity (${what}) on current numbers.`;
  return { level, headline, points };
}
