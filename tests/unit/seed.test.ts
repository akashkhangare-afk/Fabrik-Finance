import { describe, expect, it } from "vitest";
import { buildSeed } from "@/server/db/seed";
import { balanceSheet, cashBalance, cashFlowStatement, netIncome, profitAndLoss, type LedgerData } from "@/server/engines/ledger";
import type { DB } from "@/lib/types";

const db: DB = buildSeed();
const org = "org_smith";
const data: LedgerData = {
  accounts: db.glAccounts.filter((a) => a.orgId === org),
  bankAccounts: db.bankAccounts.filter((b) => b.orgId === org),
  transactions: db.transactions.filter((t) => t.orgId === org),
  invoices: db.invoices.filter((i) => i.orgId === org),
  bills: db.bills.filter((b) => b.orgId === org),
  journalEntries: db.journalEntries.filter((j) => j.orgId === org),
};
const TODAY = "2026-10-16";

describe("Smith Family Farms seed (Expo PRD §6 / §28 calibration)", () => {
  it("cash is $482,000", () => {
    expect(cashBalance(data, TODAY)).toBe(482_000_00);
  });

  it("revenue YTD $3.8M, expenses YTD $3.18M, net income $620K", () => {
    const pnl = profitAndLoss(data, [{ label: "YTD", from: "2026-01-01", to: TODAY }]);
    const rev = pnl.lines.find((l) => l.id === "t-income")!.values[0]!;
    const exp = pnl.lines.find((l) => l.id === "t-expense")!.values[0]!;
    expect(rev).toBe(3_800_000_00);
    expect(exp).toBe(3_180_000_00);
    expect(netIncome(data, "2026-01-01", TODAY)).toBe(620_000_00);
  });

  it("receivables $310K with PRD aging and upcoming bills $184K", () => {
    const open = data.invoices.reduce((s, i) => s + i.amount - i.amountPaid, 0);
    expect(open).toBe(310_000_00);
    const ap = data.bills.filter((b) => b.status !== "paid" && b.status !== "rejected").reduce((s, b) => s + b.amount, 0);
    expect(ap).toBe(184_000_00);
  });

  it("balance sheet balances and cash flow ties to bank balances", () => {
    const bs = balanceSheet(data, TODAY, "2026-01-01");
    expect(bs.checks.every((c) => c.ok)).toBe(true);
    const cf = cashFlowStatement(data, "2026-01-01", TODAY);
    expect(cf.checks.every((c) => c.ok)).toBe(true);
  });

  it("bank balances never go negative", () => {
    for (const bank of data.bankAccounts.filter((b) => b.kind !== "credit_card")) {
      const opening = data.journalEntries.find((j) => j.id === "je_smith_opening")!.lines.find((l) => l.accountId === bank.glAccountId)!;
      let bal = opening.debit - opening.credit;
      let min = bal;
      const moves = data.transactions
        .filter((t) => t.bankAccountId === bank.id || t.accountId === bank.glAccountId)
        .map((t) => ({ date: t.date, amt: t.bankAccountId === bank.id ? t.amount : -t.amount }))
        .sort((a, b) => a.date.localeCompare(b.date));
      for (const m of moves) {
        bal += m.amt;
        min = Math.min(min, bal);
      }
      expect(min, bank.name).toBeGreaterThanOrEqual(0);
    }
  });

  it("automation rate is in a realistic band and October has a review queue", () => {
    const sep = data.transactions.filter((t) => t.date.startsWith("2026-09"));
    const auto = sep.filter((t) => t.status === "processed").length / sep.length;
    expect(auto).toBeGreaterThan(0.6);
    const oct = data.transactions.filter((t) => t.date.startsWith("2026-10"));
    expect(oct.filter((t) => t.status === "needs_review").length).toBeGreaterThan(5);
  });
});
