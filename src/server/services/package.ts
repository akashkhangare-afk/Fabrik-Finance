import "server-only";
import type { ID } from "@/lib/types";
import { db } from "@/server/db/store";
import { addMonths, monthEnd, monthLabel, monthName } from "@/lib/dates";
import { money, signedPct } from "@/lib/format";
import { cashBalance, monthlyTotals, totalsBySubtype } from "@/server/engines/ledger";
import { subtypeMeta } from "@/server/domain/coa";
import { ledgerDataFor } from "./finance";
import { accountingProvider } from "@/server/integrations/accounting";
import { accountName } from "./transactions";
import { periodLabel } from "./close";

/** Monthly Finance Package (PRD §15) — generated once books are closed (viewable as a draft before). */
export async function financePackage(orgId: ID, period: string) {
  const data = ledgerDataFor(orgId);
  const prev = addMonths(period, -1);
  const from = `${period}-01`;
  const to = monthEnd(period);
  const trendPeriods = Array.from({ length: 6 }, (_, i) => addMonths(period, i - 5));
  const trend = monthlyTotals(data, trendPeriods).map((r) => ({ ...r, label: monthLabel(r.period) }));
  const cur = trend.at(-1)!;
  const before = trend.at(-2)!;
  const subsCur = totalsBySubtype(data, from, to);
  const subsPrev = totalsBySubtype(data, `${prev}-01`, monthEnd(prev));
  const changes = [...new Set([...subsCur.keys(), ...subsPrev.keys()])]
    .filter((s) => subtypeMeta(s).type === "expense")
    .map((s) => ({ sub: s, name: data.accounts.find((a) => a.subtype === s)?.name ?? subtypeMeta(s).name, cur: subsCur.get(s) ?? 0, prev: subsPrev.get(s) ?? 0 }))
    .map((r) => ({ ...r, delta: r.cur - r.prev }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const wages = changes.find((c) => c.sub === "wages");
  const cashEnd = cashBalance(data, to);
  const cashStart = cashBalance(data, monthEnd(prev));
  const pct = (a: number, b: number) => (b ? (a - b) / b : 0);
  const top = changes.filter((c) => c.delta > 0)[0];

  const observations: string[] = [
    `Revenue ${cur.revenue >= before.revenue ? "increased" : "decreased"} ${signedPct(pct(cur.revenue, before.revenue)).replace(/^[+−]/, "")} compared with ${monthName(prev)} (${money(cur.revenue)} vs ${money(before.revenue)}).`,
    `Operating expenses ${cur.expenses >= before.expenses ? "increased" : "decreased"} ${signedPct(pct(cur.expenses, before.expenses)).replace(/^[+−]/, "")}${top && cur.expenses >= before.expenses ? `, primarily due to ${top.name.toLowerCase()} (${money(top.delta, { sign: true })})` : ""}.`,
    wages ? (Math.abs(pct(wages.cur, wages.prev)) < 0.1 ? `Payroll remained stable at ${money(wages.cur)}.` : `Payroll ${wages.cur > wages.prev ? "rose" : "fell"} to ${money(wages.cur)} (${signedPct(pct(wages.cur, wages.prev))}).`) : "No payroll activity this month.",
    `Cash ${cashEnd >= cashStart ? "increased" : "decreased"} by ${money(Math.abs(cashEnd - cashStart))} to ${money(cashEnd)}.`,
  ];

  const txns = data.transactions.filter((t) => t.date >= from && t.date <= to && t.status !== "excluded");
  const largest = [...txns].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 6);
  const unusual = txns.filter((t) => t.ai?.anomaly || t.ai?.possibleDuplicateOf || (t.risk?.reasons.length ?? 0) > 0).slice(0, 6);
  const provider = accountingProvider(orgId);
  const reports = [
    await provider.profitAndLoss(orgId, [{ label: monthLabel(prev), from: `${prev}-01`, to: monthEnd(prev) }, { label: monthLabel(period), from, to }]),
    await provider.balanceSheet(orgId, to),
    await provider.cashFlow(orgId, from, to),
  ];
  const cp = db().closePeriods.find((c) => c.orgId === orgId && c.period === period);
  return {
    title: `${periodLabel(period)} Finance Package`,
    period,
    status: cp?.status ?? "open",
    generatedAt: cp?.packageGeneratedAt,
    summary: { revenue: cur.revenue, expenses: cur.expenses, net: cur.net, cashEnd, cashChange: cashEnd - cashStart, revenueChange: pct(cur.revenue, before.revenue), expenseChange: pct(cur.expenses, before.expenses) },
    observations,
    trend,
    changes: changes.slice(0, 6),
    largest: largest.map((t) => ({ id: t.id, date: t.date, vendor: t.ai?.normalizedVendor ?? t.description, account: t.splits?.length ? "Split" : accountName(t.accountId ?? t.ai?.accountId), amount: t.amount })),
    unusual: unusual.map((t) => ({ id: t.id, date: t.date, vendor: t.ai?.normalizedVendor ?? t.description, amount: t.amount, reason: t.ai?.anomaly?.reason ?? (t.ai?.possibleDuplicateOf ? "Possible duplicate" : t.risk!.reasons.map((r) => r.label).join(", ")) })),
    reports,
  };
}
