import type { BankAccount, Cents, ID, ISODate, Reconciliation, StatementLine, Transaction } from "@/lib/types";
import { scoreStatementMatch } from "./matching";
import { diffDays } from "@/lib/dates";

/**
 * Reconciliation Agent (PRD §11). AI assists matching statement lines to book transactions;
 * a human approves the final reconciliation. Balances are in the bank account's GL debit sign
 * (credit cards are negative when money is owed).
 */

export interface BookItem {
  transactionId: ID;
  date: ISODate;
  description: string;
  /** Effect on this account's balance. */
  amount: Cents;
  status: Transaction["status"];
}

/** Every book entry that moves this bank account: its own feed plus transfers posted into it from other accounts. */
export function bookItems(bank: BankAccount, txns: Transaction[], from: ISODate, to: ISODate): BookItem[] {
  const items: BookItem[] = [];
  for (const t of txns) {
    if (t.date < from || t.date > to || t.status === "excluded") continue;
    if (t.bankAccountId === bank.id) items.push({ transactionId: t.id, date: t.date, description: t.description, amount: t.amount, status: t.status });
    else if (t.accountId === bank.glAccountId) items.push({ transactionId: t.id, date: t.date, description: t.description, amount: -t.amount, status: t.status });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

export interface RecSummary {
  statementBalance: Cents;
  bookBalance: Cents;
  outstanding: Cents;
  adjustedBookBalance: Cents;
  difference: Cents;
  matched: number;
  suggested: number;
  unmatched: number;
  duplicates: number;
  unreconciledBook: BookItem[];
  duplicateBook: BookItem[];
  canApprove: boolean;
  status: Reconciliation["status"];
}

/**
 * bookBalance = start + all book items in the period.
 * adjusted = bookBalance − outstanding items (in books, not yet on the statement).
 * difference = statement end − adjusted. Approve requires difference 0 and every line resolved.
 */
export function summarize(rec: Reconciliation, items: BookItem[]): RecSummary {
  const matchedIds = new Set(rec.lines.filter((l) => (l.state === "matched" || l.state === "suggested") && l.transactionId).map((l) => l.transactionId!));
  const outstandingIds = new Set(rec.outstandingTxnIds);
  const bookBalance = rec.statementStartBalance + items.reduce((s, i) => s + i.amount, 0);
  const outstandingItems = items.filter((i) => outstandingIds.has(i.transactionId));
  const outstanding = outstandingItems.reduce((s, i) => s + i.amount, 0);
  const loose = items.filter((i) => !matchedIds.has(i.transactionId) && !outstandingIds.has(i.transactionId));
  const matchedItems = items.filter((i) => matchedIds.has(i.transactionId));
  const duplicateBook = loose.filter((i) => matchedItems.some((m) => m.amount === i.amount && m.description === i.description && Math.abs(diffDays(m.date, i.date)) <= 3));
  const unreconciledBook = loose.filter((i) => !duplicateBook.includes(i));
  const adjusted = bookBalance - outstanding;
  const difference = rec.statementEndBalance - adjusted;
  const counts = { matched: 0, suggested: 0, unmatched: 0 };
  for (const l of rec.lines) {
    if (l.state === "matched") counts.matched++;
    else if (l.state === "suggested") counts.suggested++;
    else if (l.state === "unmatched") counts.unmatched++;
  }
  const canApprove = difference === 0 && counts.unmatched === 0 && counts.suggested === 0 && duplicateBook.length === 0 && unreconciledBook.length === 0;
  return {
    statementBalance: rec.statementEndBalance,
    bookBalance,
    outstanding,
    adjustedBookBalance: adjusted,
    difference,
    ...counts,
    duplicates: duplicateBook.length,
    unreconciledBook,
    duplicateBook,
    canApprove,
    status: rec.status === "approved" ? "approved" : canApprove ? "ready_for_review" : "in_progress",
  };
}

/** AI-assisted matching of unmatched statement lines against loose book items. */
export function autoMatch(lines: StatementLine[], items: BookItem[]): StatementLine[] {
  const taken = new Set(lines.filter((l) => l.transactionId).map((l) => l.transactionId!));
  return lines.map((l) => {
    if (l.state !== "unmatched") return l;
    let best: { item: BookItem; score: number } | undefined;
    for (const i of items) {
      if (taken.has(i.transactionId)) continue;
      const score = scoreStatementMatch(l, i);
      if (score > 0 && (!best || score > best.score)) best = { item: i, score };
    }
    if (!best) return l;
    taken.add(best.item.transactionId);
    return { ...l, state: best.score >= 0.95 ? "matched" : "suggested", transactionId: best.item.transactionId, confidence: best.score };
  });
}
