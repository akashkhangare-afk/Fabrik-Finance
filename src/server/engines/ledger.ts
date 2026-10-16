import type { BankAccount, Bill, Cents, GLAccount, ID, ISODate, Invoice, JournalEntry, Transaction } from "@/lib/types";
import { BS_GROUP_ORDER, PNL_GROUP_ORDER, subtypeMeta } from "@/server/domain/coa";
import { addDays } from "@/lib/dates";

/**
 * Double-entry posting model mirroring what the accounting system of record (QuickBooks Online)
 * holds. Every source record produces balanced postings (debit-positive), so the P&L, Balance Sheet
 * and Cash Flow statement always tie out. Reports are served through the AccountingProvider; the
 * synthetic sandbox provider computes them here, the live QBO provider maps QBO's Reports API.
 */

export interface LedgerData {
  accounts: GLAccount[];
  bankAccounts: BankAccount[];
  transactions: Transaction[];
  invoices: Invoice[];
  bills: Bill[];
  journalEntries: JournalEntry[];
}

export interface Posting {
  date: ISODate;
  accountId: ID;
  amount: Cents; // debit-positive
}

export function buildPostings(data: LedgerData): Posting[] {
  const out: Posting[] = [];
  const bankGl = new Map(data.bankAccounts.map((b) => [b.id, b.glAccountId]));
  const bySub = new Map(data.accounts.map((a) => [a.subtype, a.id]));
  const uncatIncome = bySub.get("uncategorized_income")!;
  const uncatExpense = bySub.get("uncategorized_expense")!;

  for (const t of data.transactions) {
    if (t.status === "excluded") continue;
    const gl = bankGl.get(t.bankAccountId);
    if (!gl) continue;
    out.push({ date: t.date, accountId: gl, amount: t.amount });
    const final = t.status === "processed" || t.status === "approved";
    if (final && t.splits?.length) {
      for (const s of t.splits) out.push({ date: t.date, accountId: s.accountId, amount: -s.amount });
    } else if (final && t.accountId) {
      out.push({ date: t.date, accountId: t.accountId, amount: -t.amount });
    } else {
      out.push({ date: t.date, accountId: t.amount > 0 ? uncatIncome : uncatExpense, amount: -t.amount });
    }
  }

  const ar = bySub.get("accounts_receivable")!;
  for (const inv of data.invoices) {
    out.push({ date: inv.issueDate, accountId: ar, amount: inv.amount });
    out.push({ date: inv.issueDate, accountId: inv.accountId, amount: -inv.amount });
  }

  const ap = bySub.get("accounts_payable")!;
  for (const b of data.bills) {
    if (b.status === "rejected") continue;
    if (b.source === "document" && b.status !== "approved" && b.status !== "paid") continue;
    out.push({ date: b.issueDate, accountId: b.accountId, amount: b.amount });
    out.push({ date: b.issueDate, accountId: ap, amount: -b.amount });
  }

  for (const je of data.journalEntries) {
    for (const l of je.lines) out.push({ date: je.date, accountId: l.accountId, amount: l.debit - l.credit });
  }
  return out;
}

export function activity(postings: Posting[], from: ISODate, to: ISODate): Map<ID, Cents> {
  const m = new Map<ID, Cents>();
  for (const p of postings) if (p.date >= from && p.date <= to) m.set(p.accountId, (m.get(p.accountId) ?? 0) + p.amount);
  return m;
}

export function balances(postings: Posting[], asOf: ISODate): Map<ID, Cents> {
  return activity(postings, "0000-01-01", asOf);
}

// ─── Report model ─────────────────────────────────────────────────────────

export interface ReportColumn {
  label: string;
  from: ISODate;
  to: ISODate;
}

export interface ReportLine {
  id: string;
  label: string;
  values: Cents[];
  kind: "header" | "account" | "subtotal" | "total" | "grand" | "spacer";
  depth: number;
  accountId?: ID;
}

export interface FinancialReport {
  kind: "pnl" | "balance_sheet" | "cash_flow";
  title: string;
  subtitle: string;
  basis: "accrual" | "cash";
  columns: ReportColumn[];
  lines: ReportLine[];
  checks: { label: string; ok: boolean; detail?: string }[];
}

const sum = (xs: Cents[]) => xs.reduce((a, b) => a + b, 0);
const add = (a: Cents[], b: Cents[]) => a.map((v, i) => v + (b[i] ?? 0));

export function profitAndLoss(data: LedgerData, columns: ReportColumn[], opts: { includeTotal?: boolean } = {}): FinancialReport {
  const postings = buildPostings(data);
  const acts = columns.map((c) => activity(postings, c.from, c.to));
  const cols = opts.includeTotal && columns.length > 1 ? [...columns, { label: "Total", from: columns[0]!.from, to: columns.at(-1)!.to }] : columns;
  const withTotal = (vals: Cents[]) => (cols.length > columns.length ? [...vals, sum(vals)] : vals);
  const lines: ReportLine[] = [];
  const zero = () => cols.map(() => 0);

  const section = (type: "income" | "expense", title: string) => {
    let sectionTotal = zero();
    lines.push({ id: `h-${type}`, label: title, values: zero(), kind: "header", depth: 0 });
    for (const group of PNL_GROUP_ORDER[type]) {
      const accts = data.accounts.filter((a) => a.type === type && subtypeMeta(a.subtype).group === group);
      const rows = accts
        .map((a) => {
          const vals = withTotal(acts.map((m) => (type === "income" ? -1 : 1) * (m.get(a.id) ?? 0)));
          return { a, vals };
        })
        .filter((r) => r.vals.some((v) => v !== 0));
      if (!rows.length) continue;
      lines.push({ id: `g-${type}-${group}`, label: group, values: zero(), kind: "header", depth: 1 });
      let groupTotal = zero();
      for (const r of rows) {
        lines.push({ id: `a-${r.a.id}`, label: r.a.name, values: r.vals, kind: "account", depth: 2, accountId: r.a.id });
        groupTotal = add(groupTotal, r.vals);
      }
      lines.push({ id: `st-${type}-${group}`, label: `Total ${group.toLowerCase()}`, values: groupTotal, kind: "subtotal", depth: 1 });
      sectionTotal = add(sectionTotal, groupTotal);
    }
    lines.push({ id: `t-${type}`, label: type === "income" ? "Total revenue" : "Total expenses", values: sectionTotal, kind: "total", depth: 0 });
    return sectionTotal;
  };

  const income = section("income", "Revenue");
  lines.push({ id: "sp1", label: "", values: zero(), kind: "spacer", depth: 0 });
  const expense = section("expense", "Expenses");
  const net = income.map((v, i) => v - (expense[i] ?? 0));
  lines.push({ id: "sp2", label: "", values: zero(), kind: "spacer", depth: 0 });
  lines.push({ id: "net", label: "Net income", values: net, kind: "grand", depth: 0 });

  return {
    kind: "pnl",
    title: "Profit & Loss",
    subtitle: columns.length === 1 ? `${columns[0]!.from} to ${columns[0]!.to}` : `${columns[0]!.from} to ${columns.at(-1)!.to}`,
    basis: "accrual",
    columns: cols,
    lines,
    checks: [],
  };
}

export function netIncome(data: LedgerData, from: ISODate, to: ISODate): Cents {
  const acts = activity(buildPostings(data), from, to);
  let n = 0;
  for (const a of data.accounts) if (a.type === "income" || a.type === "expense") n -= acts.get(a.id) ?? 0;
  return n;
}

export function balanceSheet(data: LedgerData, asOf: ISODate, fiscalYearStart: ISODate): FinancialReport {
  const postings = buildPostings(data);
  const bal = balances(postings, asOf);
  const priorPL = activity(postings, "0000-01-01", addDays(fiscalYearStart, -1));
  const currentPL = activity(postings, fiscalYearStart, asOf);
  const plSum = (m: Map<ID, Cents>) => {
    let n = 0;
    for (const a of data.accounts) if (a.type === "income" || a.type === "expense") n -= m.get(a.id) ?? 0;
    return n;
  };
  const lines: ReportLine[] = [];
  const block = (type: "asset" | "liability" | "equity", title: string, extra: { label: string; value: Cents }[] = []) => {
    lines.push({ id: `h-${type}`, label: title, values: [0], kind: "header", depth: 0 });
    let total = 0;
    for (const group of BS_GROUP_ORDER[type]) {
      const rows = data.accounts
        .filter((a) => a.type === type && subtypeMeta(a.subtype).group === group)
        .map((a) => ({ a, v: (type === "asset" ? 1 : -1) * (bal.get(a.id) ?? 0) }))
        .filter((r) => r.v !== 0 || r.a.subtype === "bank");
      const extras = group === "Equity" ? extra : [];
      if (!rows.length && !extras.length) continue;
      lines.push({ id: `g-${group}`, label: group, values: [0], kind: "header", depth: 1 });
      let g = 0;
      for (const r of rows) {
        lines.push({ id: `a-${r.a.id}`, label: r.a.name, values: [r.v], kind: "account", depth: 2, accountId: r.a.id });
        g += r.v;
      }
      for (const e of extras) {
        lines.push({ id: `x-${e.label}`, label: e.label, values: [e.value], kind: "account", depth: 2 });
        g += e.value;
      }
      lines.push({ id: `st-${group}`, label: `Total ${group.toLowerCase()}`, values: [g], kind: "subtotal", depth: 1 });
      total += g;
    }
    lines.push({ id: `t-${type}`, label: `Total ${title.toLowerCase()}`, values: [total], kind: "total", depth: 0 });
    return total;
  };
  const assets = block("asset", "Assets");
  lines.push({ id: "sp1", label: "", values: [0], kind: "spacer", depth: 0 });
  const liabilities = block("liability", "Liabilities");
  lines.push({ id: "sp2", label: "", values: [0], kind: "spacer", depth: 0 });
  const equity = block("equity", "Equity", [
    { label: "Retained earnings (prior years)", value: plSum(priorPL) },
    { label: "Net income (current year)", value: plSum(currentPL) },
  ]);
  lines.push({ id: "sp3", label: "", values: [0], kind: "spacer", depth: 0 });
  lines.push({ id: "le", label: "Total liabilities & equity", values: [liabilities + equity], kind: "grand", depth: 0 });
  const diff = assets - (liabilities + equity);
  return {
    kind: "balance_sheet",
    title: "Balance Sheet",
    subtitle: `As of ${asOf}`,
    basis: "accrual",
    columns: [{ label: asOf, from: asOf, to: asOf }],
    lines,
    checks: [{ label: "Assets = Liabilities + Equity", ok: diff === 0, detail: diff === 0 ? "Balanced" : `Out of balance by ${diff / 100}` }],
  };
}

export function cashFlowStatement(data: LedgerData, from: ISODate, to: ISODate): FinancialReport {
  const postings = buildPostings(data);
  const acts = activity(postings, from, to);
  const ni = netIncome(data, from, to);
  const lines: ReportLine[] = [];
  const row = (id: string, label: string, v: Cents, kind: ReportLine["kind"] = "account", depth = 2) => lines.push({ id, label, values: [v], kind, depth });

  row("h-op", "Operating activities", 0, "header", 0);
  row("ni", "Net income", ni);
  let op = ni;
  for (const a of data.accounts) {
    const delta = acts.get(a.id) ?? 0;
    if (!delta || a.type === "income" || a.type === "expense" || a.subtype === "bank") continue;
    if (a.cashFlowSection !== "operating") continue;
    const impact = -delta;
    const grew = a.type === "asset" ? delta > 0 : delta < 0;
    const label = a.subtype === "accum_depreciation" ? "Depreciation (non-cash)" : `${grew ? "Increase" : "Decrease"} in ${a.name}`;
    row(`op-${a.id}`, label, impact);
    op += impact;
  }
  row("t-op", "Net cash from operating activities", op, "subtotal", 1);

  const sectionRows = (section: "investing" | "financing", title: string) => {
    row(`h-${section}`, title, 0, "header", 0);
    let total = 0;
    for (const a of data.accounts) {
      if (a.cashFlowSection !== section) continue;
      const delta = acts.get(a.id) ?? 0;
      if (!delta) continue;
      const impact = -delta;
      const verb =
        section === "investing"
          ? impact < 0
            ? `Purchase of ${a.name.toLowerCase()}`
            : `Sale of ${a.name.toLowerCase()}`
          : a.type === "liability"
            ? impact < 0
              ? `Repayment – ${a.name}`
              : `Proceeds – ${a.name}`
            : a.name;
      row(`${section}-${a.id}`, verb, impact);
      total += impact;
    }
    row(`t-${section}`, `Net cash from ${section} activities`, total, "subtotal", 1);
    return total;
  };
  lines.push({ id: "sp1", label: "", values: [0], kind: "spacer", depth: 0 });
  const inv = sectionRows("investing", "Investing activities");
  lines.push({ id: "sp2", label: "", values: [0], kind: "spacer", depth: 0 });
  const fin = sectionRows("financing", "Financing activities");

  const cashIds = new Set(data.bankAccounts.filter((b) => data.accounts.find((a) => a.id === b.glAccountId)?.type === "asset").map((b) => b.glAccountId));
  const begin = sumWhere(balances(postings, addDays(from, -1)), cashIds);
  const end = sumWhere(balances(postings, to), cashIds);
  const net = op + inv + fin;
  lines.push({ id: "sp3", label: "", values: [0], kind: "spacer", depth: 0 });
  row("net", "Net change in cash", net, "total", 0);
  row("begin", "Cash at beginning of period", begin, "account", 1);
  row("end", "Cash at end of period", end, "grand", 0);
  return {
    kind: "cash_flow",
    title: "Statement of Cash Flows",
    subtitle: `${from} to ${to}`,
    basis: "accrual",
    columns: [{ label: `${from} – ${to}`, from, to }],
    lines,
    checks: [{ label: "Net change ties to bank balances", ok: begin + net === end, detail: begin + net === end ? "Reconciled" : `Difference ${(begin + net - end) / 100}` }],
  };
}

function sumWhere(m: Map<ID, Cents>, ids: Set<ID>): Cents {
  let n = 0;
  for (const id of ids) n += m.get(id) ?? 0;
  return n;
}

/** Cash across operating bank accounts (excludes credit cards) as of a date. */
export function cashBalance(data: LedgerData, asOf: ISODate): Cents {
  const postings = buildPostings(data);
  const bal = balances(postings, asOf);
  let n = 0;
  for (const b of data.bankAccounts) if (b.kind !== "credit_card") n += bal.get(b.glAccountId) ?? 0;
  return n;
}

/** Monthly revenue and expense totals (accrual) for charting. */
export function monthlyTotals(data: LedgerData, periods: string[]): { period: string; revenue: Cents; expenses: Cents; net: Cents }[] {
  const postings = buildPostings(data);
  const types = new Map(data.accounts.map((a) => [a.id, a.type]));
  const res = new Map(periods.map((p) => [p, { revenue: 0, expenses: 0 }]));
  for (const p of postings) {
    const r = res.get(p.date.slice(0, 7));
    if (!r) continue;
    const t = types.get(p.accountId);
    if (t === "income") r.revenue -= p.amount;
    else if (t === "expense") r.expenses += p.amount;
  }
  return periods.map((p) => ({ period: p, revenue: res.get(p)!.revenue, expenses: res.get(p)!.expenses, net: res.get(p)!.revenue - res.get(p)!.expenses }));
}

/** Activity by account subtype for a range — powers insights and Ask Fabrik. */
export function totalsBySubtype(data: LedgerData, from: ISODate, to: ISODate): Map<string, Cents> {
  const acts = activity(buildPostings(data), from, to);
  const out = new Map<string, Cents>();
  for (const a of data.accounts) {
    const v = acts.get(a.id) ?? 0;
    if (!v) continue;
    const signed = a.type === "income" || a.type === "liability" || a.type === "equity" ? -v : v;
    out.set(a.subtype, (out.get(a.subtype) ?? 0) + signed);
  }
  return out;
}
