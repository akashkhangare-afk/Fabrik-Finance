import "server-only";
import type { Cents, ID, ISODate, Transaction } from "@/lib/types";
import { db } from "@/server/db/store";
import { addDays, addMonths, diffDays, monthEnd, periodOf, prettyDate, today } from "@/lib/dates";
import { balances, buildPostings, cashBalance, monthlyTotals, netIncome, totalsBySubtype } from "@/server/engines/ledger";
import { buildForecast, weekWindows, type Assumption, type Forecast, type ForecastInput, type ForecastLine } from "@/server/engines/forecast";
import type { Baseline } from "@/server/engines/scenarios";
import { ledgerDataFor } from "@/server/integrations/accounting/synthetic-qbo";
import { subtypeMeta } from "@/server/domain/coa";

export { ledgerDataFor };

const fyStart = (d: ISODate) => `${d.slice(0, 4)}-01-01`;
const lastYear = (d: ISODate) => `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`;

export interface Kpis {
  asOf: ISODate;
  cash: Cents;
  revenueYtd: Cents;
  revenueYtdPrior: Cents;
  expensesYtd: Cents;
  expensesYtdPrior: Cents;
  netIncomeYtd: Cents;
  netIncomeYtdPrior: Cents;
  receivables: Cents;
  receivablesOver30: Cents;
  upcomingBills: Cents;
  billsDueThisWeek: Cents;
  billsOverdue: Cents;
  revenueMonth: Cents;
  expensesMonth: Cents;
  operatingMargin: number;
}

export function openReceivables(orgId: ID) {
  const d = today();
  return db()
    .invoices.filter((i) => i.orgId === orgId && i.amount - i.amountPaid > 0)
    .map((i) => ({ ...i, open: i.amount - i.amountPaid, daysOverdue: Math.max(0, diffDays(d, i.dueDate)) }));
}

export function arAging(orgId: ID) {
  const buckets = { current: 0, d1_30: 0, d31_60: 0, d60plus: 0 };
  for (const i of openReceivables(orgId)) {
    if (i.daysOverdue === 0) buckets.current += i.open;
    else if (i.daysOverdue <= 30) buckets.d1_30 += i.open;
    else if (i.daysOverdue <= 60) buckets.d31_60 += i.open;
    else buckets.d60plus += i.open;
  }
  return buckets;
}

export function openBills(orgId: ID) {
  return db().bills.filter((b) => b.orgId === orgId && b.status !== "paid" && b.status !== "rejected");
}

export function getKpis(orgId: ID): Kpis {
  const d = today();
  const data = ledgerDataFor(orgId);
  const cur = plDedup(data, fyStart(d), d);
  const prior = plDedup(data, fyStart(lastYear(d)), lastYear(d));
  const month = plDedup(data, `${periodOf(d)}-01`, d);
  const aging = arAging(orgId);
  const bills = openBills(orgId);
  const weekEnd = addDays(d, 6);
  return {
    asOf: d,
    cash: cashBalance(data, d),
    revenueYtd: cur.rev,
    revenueYtdPrior: prior.rev,
    expensesYtd: cur.exp,
    expensesYtdPrior: prior.exp,
    netIncomeYtd: cur.rev - cur.exp,
    netIncomeYtdPrior: prior.rev - prior.exp,
    receivables: aging.current + aging.d1_30 + aging.d31_60 + aging.d60plus,
    receivablesOver30: aging.d31_60 + aging.d60plus,
    upcomingBills: bills.reduce((s, b) => s + b.amount, 0),
    billsDueThisWeek: bills.filter((b) => b.dueDate >= d && b.dueDate <= weekEnd).reduce((s, b) => s + b.amount, 0),
    billsOverdue: bills.filter((b) => b.dueDate < d).reduce((s, b) => s + b.amount, 0),
    revenueMonth: month.rev,
    expensesMonth: month.exp,
    operatingMargin: cur.rev ? (cur.rev - cur.exp) / cur.rev : 0,
  };
}

function plDedup(data: ReturnType<typeof ledgerDataFor>, from: ISODate, to: ISODate) {
  const m = totalsBySubtype(data, from, to);
  let rev = 0;
  let exp = 0;
  for (const [sub, v] of m) {
    const t = subtypeMeta(sub).type;
    if (t === "income") rev += v;
    else if (t === "expense") exp += v;
  }
  return { rev, exp };
}

export type TrendRange = "1m" | "3m" | "6m" | "12m" | "ytd";

export function getTrend(orgId: ID, range: TrendRange) {
  const d = today();
  const cur = periodOf(d);
  const n = range === "1m" ? 1 : range === "3m" ? 3 : range === "6m" ? 6 : range === "12m" ? 12 : Number(cur.slice(5, 7));
  const periods = Array.from({ length: n }, (_, i) => addMonths(cur, i - n + 1));
  const rows = monthlyTotals(ledgerDataFor(orgId), periods);
  const prior = monthlyTotals(ledgerDataFor(orgId), periods.map((p) => addMonths(p, -12)));
  return rows.map((r, i) => ({ ...r, partial: r.period === cur, priorRevenue: prior[i]!.revenue, priorExpenses: prior[i]!.expenses }));
}

export function expenseByCategory(orgId: ID, from: ISODate, to: ISODate) {
  const data = ledgerDataFor(orgId);
  const m = totalsBySubtype(data, from, to);
  return data.accounts
    .filter((a) => a.type === "expense" && (m.get(a.subtype) ?? 0) !== 0)
    .map((a) => ({ accountId: a.id, subtype: a.subtype, name: a.name, group: subtypeMeta(a.subtype).group, amount: m.get(a.subtype)! }))
    .sort((a, b) => b.amount - a.amount);
}

/** Change for one subtype YTD vs the same period last year. */
export function ytdChange(orgId: ID, subtype: string) {
  const d = today();
  const data = ledgerDataFor(orgId);
  const cur = totalsBySubtype(data, fyStart(d), d).get(subtype) ?? 0;
  const prior = totalsBySubtype(data, fyStart(lastYear(d)), lastYear(d)).get(subtype) ?? 0;
  return { cur, prior, pct: prior ? (cur - prior) / prior : 0 };
}

// ─── 13-week forecast ─────────────────────────────────────────────────────────

const VARIABLE = ["seed", "fertilizer", "chemicals", "fuel", "repairs", "equipment_machinery", "custom_hire", "freight", "storage_drying", "professional_fees", "office_supplies", "travel", "other_expense", "marketing", "meals", "rent", "software", "utilities", "insurance", "dues", "bank_fees", "wages"];
const REVENUE = ["grain_sales_corn", "grain_sales_soy", "sales", "service_revenue", "rental_income", "custom_hire_income"];

export interface ForecastOptions {
  grainFactor?: number; // share of prior-year seasonal sales expected
  bufferDollars?: number;
  includeEstimated?: boolean;
}

export function forecastInput(orgId: ID, opts: ForecastOptions = {}): { input: ForecastInput; excluded: Forecast["excluded"] } {
  const d = today();
  const data = ledgerDataFor(orgId);
  const grainFactor = opts.grainFactor ?? 0.7;
  const buffer = (opts.bufferDollars ?? 150_000) * 100;
  const windows = weekWindows(d);
  const horizon = windows.at(-1)!.end;
  const lines: ForecastLine[] = [];
  const excluded: Forecast["excluded"] = [];
  const acct = new Map(data.accounts.map((a) => [a.id, a]));
  const customers = new Map(db().customers.map((c) => [c.id, c]));
  const vendors = new Map(db().vendors.map((v) => [v.id, v]));
  const ccBanks = new Set(data.bankAccounts.filter((b) => b.kind === "credit_card").map((b) => b.id));
  const final = data.transactions.filter((t) => t.status !== "excluded");

  // Known: open invoices.
  for (const inv of openReceivables(orgId)) {
    const c = customers.get(inv.customerId);
    if (inv.daysOverdue > 90) {
      excluded.push({ label: `${inv.number} · ${c?.name}`, amount: inv.open, reason: `${inv.daysOverdue} days past due — excluded until collection is confirmed` });
      continue;
    }
    const expected = inv.daysOverdue > 0 ? addDays(d, inv.daysOverdue > 30 ? 21 : 10) : addDays(inv.dueDate, c?.avgDaysLate ?? 0);
    if (expected > horizon) continue;
    lines.push({ id: `inv-${inv.id}`, label: `Collect ${inv.number} — ${c?.name}`, category: "collections", direction: "in", certainty: "known", date: expected < addDays(d, 1) ? addDays(d, 1) : expected, amount: inv.open, source: `Invoice due ${prettyDate(inv.dueDate)}; ${c?.name} typically pays ${c?.avgDaysLate ?? 0} days after due`, href: "/collect" });
  }
  // Known: open bills.
  for (const b of openBills(orgId)) {
    const date = b.dueDate < addDays(d, 1) ? addDays(d, 1) : b.dueDate;
    if (date > horizon) continue;
    lines.push({ id: `bill-${b.id}`, label: `Pay ${vendors.get(b.vendorId)?.name} ${b.number}`, category: "bills", direction: "out", certainty: "known", date, amount: b.amount, source: `Bill due ${prettyDate(b.dueDate)} · ${b.status.replace("_", " ")}${b.dueDate < d ? " · overdue" : ""}`, href: "/bills" });
  }
  // Known: recurring obligations detected from cadence (payroll, debt service).
  const groups = new Map<string, Transaction[]>();
  for (const t of final) {
    if (t.amount >= 0 || t.date < addDays(d, -400)) continue;
    const isPayroll = /GUSTO|PAYROLL/.test(t.description) && !/ADJ/.test(t.description);
    const isDebt = t.splits?.length || t.type === "loan_payment";
    if (!isPayroll && !isDebt) continue;
    if (/LOC (ADVANCE|PAYMENT)/.test(t.description)) continue;
    const key = `${isPayroll ? "payroll" : "debt"}|${t.vendorId}|${t.description.replace(/\d+/g, "").slice(0, 22)}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(t);
  }
  for (const [key, txs] of groups) {
    txs.sort((a, b) => a.date.localeCompare(b.date));
    if (txs.length < 2) continue;
    const last = txs.at(-1)!;
    const gaps = txs.slice(-4).map((t, i, arr) => (i ? diffDays(t.date, arr[i - 1]!.date) : 0)).slice(1);
    const gap = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)]!;
    if (gap < 7 || diffDays(d, last.date) > gap * 1.6) continue;
    const isPayroll = key.startsWith("payroll");
    const amount = Math.round(txs.slice(-6).reduce((s, t) => s + -t.amount, 0) / Math.min(6, txs.length));
    const amt = isPayroll ? amount : -last.amount;
    const name = vendors.get(last.vendorId ?? "")?.name ?? last.description;
    for (let next = gap >= 170 ? addMonths(periodOf(last.date), 6) + last.date.slice(7) : addDays(last.date, gap); next <= horizon; next = gap >= 170 ? addMonths(periodOf(next), 6) + next.slice(7) : gap >= 28 && gap <= 31 ? addMonths(periodOf(next), 1) + next.slice(7) : addDays(next, gap)) {
      if (next <= d) continue;
      lines.push({ id: `rec-${key}-${next}`, label: isPayroll ? `Payroll — ${name}` : `Debt service — ${name}`, category: isPayroll ? "payroll" : "debt_service", direction: "out", certainty: "known", date: next, amount: amt, source: isPayroll ? `Every ${gap} days; average of last ${Math.min(6, txs.length)} runs` : `Scheduled every ${gap >= 170 ? "6 months" : gap >= 28 ? "month" : `${gap} days`}; last payment ${prettyDate(last.date)}` });
    }
  }

  // Estimated: seasonal history (prior-year same weeks), falling back to recent run-rate.
  const priorFrom = addDays(windows[0]!.start, -364);
  const priorTo = addDays(horizon, -364);
  const hasPriorYear = final.some((t) => t.date <= priorFrom);
  const weekOf = (date: ISODate) => windows.findIndex((w) => date >= w.start && date <= w.end);
  const estimatedByWeek = new Map<string, number>();
  const bump = (key: string, w: number, v: number) => estimatedByWeek.set(`${key}|${w}`, (estimatedByWeek.get(`${key}|${w}`) ?? 0) + v);
  const billsBySub = new Map<string, number>();
  for (const b of openBills(orgId)) billsBySub.set(acct.get(b.accountId)?.subtype ?? "", (billsBySub.get(acct.get(b.accountId)?.subtype ?? "") ?? 0) + b.amount);

  if (hasPriorYear) {
    for (const t of final) {
      if (t.date < priorFrom || t.date > priorTo) continue;
      const shifted = addDays(t.date, 364);
      const w = weekOf(shifted);
      if (w < 0) continue;
      const sub = t.accountId ? acct.get(t.accountId)?.subtype : undefined;
      if (t.amount > 0 && sub && REVENUE.includes(sub)) bump("grain_sales", w, t.amount * grainFactor);
      else if (t.amount < 0 && sub === "credit_card") bump("card", w, -t.amount);
      else if (t.amount < 0 && sub && VARIABLE.includes(sub) && sub !== "wages" && !ccBanks.has(t.bankAccountId) && !/GUSTO/.test(t.description)) bump(`variable:${subtypeMeta(sub).group}`, w, -t.amount);
      else if (t.amount < 0 && sub === "member_draws") bump("owner", w, -t.amount);
    }
    // Avoid double counting spend already captured by open bills.
    for (const [sub, amt] of billsBySub) {
      const group = subtypeMeta(sub).group;
      let left = amt;
      for (let w = 0; w < windows.length && left > 0; w++) {
        const k = `variable:${group}|${w}`;
        const v = estimatedByWeek.get(k) ?? 0;
        const take = Math.min(v, left);
        estimatedByWeek.set(k, v - take);
        left -= take;
      }
    }
  } else {
    const from = addDays(d, -56);
    let rev = 0;
    let out = 0;
    for (const t of final) {
      if (t.date < from || t.date > d || ccBanks.has(t.bankAccountId)) continue;
      const sub = t.accountId ? acct.get(t.accountId)?.subtype : undefined;
      if (t.amount > 0 && sub && acct.get(t.accountId!)?.type === "income") rev += t.amount;
      if (t.amount < 0 && sub && VARIABLE.includes(sub) && !/GUSTO/.test(t.description)) out += -t.amount;
    }
    for (let w = 0; w < windows.length; w++) {
      bump("grain_sales", w, (rev / 8) * grainFactor);
      bump("variable:Operating spend", w, out / 8);
    }
  }
  const LABEL: Record<string, string> = { grain_sales: hasPriorYear ? "Expected crop & product sales" : "Expected revenue (run-rate)", card: "Card spending (autopay)", owner: "Member distributions" };
  for (const [k, v] of estimatedByWeek) {
    if (v < 100) continue;
    const [key, w] = k.split("|") as [string, string];
    const win = windows[Number(w)]!;
    const isVar = key.startsWith("variable:");
    lines.push({
      id: `est-${k}`,
      label: isVar ? `${key.slice(9)} (seasonal)` : LABEL[key]!,
      category: key === "grain_sales" ? "grain_sales" : isVar ? "variable" : (key as ForecastLine["category"]),
      direction: key === "grain_sales" ? "in" : "out",
      certainty: "estimated",
      date: addDays(win.start, 3),
      amount: Math.round(v),
      source: hasPriorYear ? `Same weeks last year${key === "grain_sales" ? ` × ${Math.round(grainFactor * 100)}%` : ""}${isVar ? ", net of open bills" : ""}` : "Average of the last 8 weeks",
    });
  }

  const assumptions: Assumption[] = [
    { key: "cash", label: "Starting cash", value: "Operating and savings accounts", basis: `Book balances as of ${prettyDate(d, { year: true })} (QuickBooks)` },
    { key: "collections", label: "Customer collections", value: "Due date + each customer's average days late", basis: "Learned from payment history; invoices more than 90 days past due are excluded" },
    { key: "grain", label: "Seasonal sales", value: hasPriorYear ? `${Math.round(grainFactor * 100)}% of last year's sales in the same weeks` : "Recent 8-week run-rate", basis: hasPriorYear ? "Assumes part of the crop is stored and marketed later; adjust to your marketing plan" : "No prior-year history yet" },
    { key: "bills", label: "Bills", value: "Paid on due date (overdue bills in week 1)", basis: "Approved and upcoming bills from Bills" },
    { key: "recurring", label: "Payroll & debt service", value: "Detected from payment cadence", basis: "Gusto payroll runs and loan payment schedules" },
    { key: "variable", label: "Variable operating spend", value: hasPriorYear ? "Last year's spend in the same weeks" : "Recent 8-week run-rate", basis: "Net of spend already captured in open bills" },
    { key: "buffer", label: "Minimum cash buffer", value: `$${(buffer / 100).toLocaleString("en-US")}`, basis: "Planning threshold — adjust to your comfort level" },
  ];
  const include = opts.includeEstimated ?? true;
  return { input: { today: d, startingCash: cashBalance(data, d), lines: include ? lines : lines.filter((l) => l.certainty === "known"), assumptions, bufferCents: buffer }, excluded };
}

export function getForecast(orgId: ID, opts: ForecastOptions = {}): Forecast {
  const { input, excluded } = forecastInput(orgId, opts);
  return buildForecast(input, excluded);
}

export function scenarioBaseline(orgId: ID): Baseline {
  const d = today();
  const from = addDays(d, -364);
  const data = ledgerDataFor(orgId);
  const pl = plDedup(data, from, d);
  const subs = totalsBySubtype(data, from, d);
  const bal = balances(buildPostings(data), d);
  let debt = 0;
  let assets = 0;
  for (const a of data.accounts) {
    const v = bal.get(a.id) ?? 0;
    if (["operating_loc", "equipment_loan", "mortgage"].includes(a.subtype)) debt += -v;
    if (a.type === "asset") assets += v;
  }
  const debtService = data.transactions.filter((t) => t.date >= from && t.date <= d && t.splits?.length).reduce((s, t) => s - t.amount, 0);
  const profile = db().farmProfiles.find((p) => p.orgId === orgId);
  const byCustomer = new Map<string, number>();
  for (const i of openReceivables(orgId)) byCustomer.set(i.customerId, (byCustomer.get(i.customerId) ?? 0) + i.open);
  const top = [...byCustomer.entries()].sort((a, b) => b[1] - a[1])[0];
  const cust = top ? db().customers.find((c) => c.id === top[0]) : undefined;
  return {
    ttmRevenue: pl.rev,
    ttmExpenses: pl.exp,
    ttmProfit: pl.rev - pl.exp,
    ttmDepreciation: subs.get("depreciation") ?? 0,
    ttmInterest: subs.get("interest") ?? 0,
    annualDebtService: debtService,
    totalDebt: debt,
    totalAssets: assets,
    acresFarmed: (profile?.acresOwned ?? 0) + (profile?.acresRented ?? 0),
    largestCustomer: cust && top ? { id: cust.id, name: cust.name, openAr: top[1], lines: openReceivables(orgId).filter((i) => i.customerId === cust.id).map((i) => `inv-${i.id}`) } : undefined,
  };
}

// ─── Insights (grounded observations) ───────────────────────────────────────

export interface Insight {
  id: string;
  tone: "positive" | "warning" | "info" | "opportunity";
  text: string;
  href: string;
  basis: string;
}

export function financeBrief(orgId: ID, opts: { fundingHighCount?: number } = {}): Insight[] {
  const k = getKpis(orgId);
  const out: Insight[] = [];
  const revPct = k.revenueYtdPrior ? (k.revenueYtd - k.revenueYtdPrior) / k.revenueYtdPrior : 0;
  out.push({ id: "rev", tone: revPct >= 0 ? "positive" : "warning", text: `Revenue ${revPct >= 0 ? "increased" : "decreased"} ${Math.abs(revPct * 100).toFixed(1)}% YTD compared with the same period last year.`, href: "/books?tab=reports", basis: "Profit & Loss, Jan 1 – today vs. prior year" });
  const movers = expenseByCategory(orgId, fyStart(k.asOf), k.asOf)
    .filter((c) => c.amount >= 20_000_00 && !["cash_rent", "interest", "depreciation", "uncategorized_expense"].includes(c.subtype))
    .map((c) => ({ ...c, ch: ytdChange(orgId, c.subtype) }))
    .filter((c) => c.ch.prior > 0)
    .sort((a, b) => b.ch.pct - a.ch.pct);
  const up = movers[0];
  if (up && up.ch.pct > 0.08) out.push({ id: "exp", tone: "warning", text: `${up.name} expenses are ${Math.round(up.ch.pct * 100)}% higher than last year.`, href: `/books?account=${up.accountId}`, basis: `${up.name}: YTD vs. same period last year` });
  if (k.receivablesOver30 > 0) out.push({ id: "ar", tone: "warning", text: `$${Math.round(k.receivablesOver30 / 100).toLocaleString("en-US")} of receivables are more than 30 days old.`, href: "/collect", basis: "Accounts receivable aging" });
  const f = getForecast(orgId);
  out.push(
    f.weeksBelowBuffer.length === 0
      ? { id: "cash", tone: "positive", text: "Current cash position appears sufficient for the next 13 weeks based on known obligations.", href: "/cfo?tab=forecast", basis: `13-week forecast · lowest point $${Math.round(f.minCash / 100_000)}K in week ${f.minWeek}` }
      : { id: "cash", tone: "warning", text: `Cash is projected to dip below your buffer in ${f.weeksBelowBuffer.length} of the next 13 weeks (lowest $${Math.round(f.minCash / 100_000)}K in week ${f.minWeek}).`, href: "/cfo?tab=forecast", basis: "13-week forecast" },
  );
  if (opts.fundingHighCount) out.push({ id: "funding", tone: "opportunity", text: `${opts.fundingHighCount} potential government funding programs identified.`, href: "/funding", basis: "Funding matching against your farm profile" });
  return out;
}

export function cfoInsights(orgId: ID): Insight[] {
  const d = today();
  const k = getKpis(orgId);
  const out: Insight[] = [];
  const revPct = k.revenueYtdPrior ? (k.revenueYtd - k.revenueYtdPrior) / k.revenueYtdPrior : 0;
  out.push({ id: "rev", tone: revPct >= 0 ? "positive" : "warning", text: `Revenue is ${revPct >= 0 ? "up" : "down"} ${Math.abs(revPct * 100).toFixed(1)}% year to date.`, href: "/books?tab=reports", basis: `$${Math.round(k.revenueYtd / 100_000) / 10}M vs. $${Math.round(k.revenueYtdPrior / 100_000) / 10}M` });
  for (const sub of ["equipment_machinery", "fuel"]) {
    const c = ytdChange(orgId, sub);
    if (!c.prior) continue;
    out.push({ id: sub, tone: c.pct > 0.05 ? "warning" : "info", text: sub === "fuel" ? `Fuel expenses are running ${Math.round(c.pct * 100)}% ${c.pct >= 0 ? "above" : "below"} the previous period.` : `Equipment expenditure ${c.pct >= 0 ? "increased" : "decreased"} ${Math.round(Math.abs(c.pct) * 100)}%.`, href: "/books?tab=reports", basis: `YTD $${Math.round(c.cur / 100).toLocaleString("en-US")} vs. $${Math.round(c.prior / 100).toLocaleString("en-US")} last year` });
  }
  // AR over 30 days, now vs 30 days ago.
  const thirtyAgo = addDays(d, -30);
  const over30At = (asOf: ISODate) => db().invoices.filter((i) => i.orgId === orgId && i.issueDate <= asOf && diffDays(asOf, i.dueDate) > 30).reduce((s, i) => s + i.amount - i.amountPaid, 0);
  const delta = over30At(d) - over30At(thirtyAgo);
  if (delta !== 0) out.push({ id: "ar30", tone: delta > 0 ? "warning" : "positive", text: `Accounts receivable over 30 days ${delta > 0 ? "increased" : "decreased"} by $${Math.round(Math.abs(delta) / 100).toLocaleString("en-US")} in the last month.`, href: "/collect", basis: "AR aging today vs. 30 days ago" });
  const ni = netIncome(ledgerDataFor(orgId), fyStart(d), d);
  out.push({ id: "margin", tone: "info", text: `Operating margin is ${(k.operatingMargin * 100).toFixed(1)}% year to date ($${Math.round(ni / 100).toLocaleString("en-US")} net income).`, href: "/books?tab=reports", basis: "Profit & Loss YTD" });
  return out;
}

export function monthRange(period: string) {
  return { from: `${period}-01`, to: monthEnd(period) };
}
