import "server-only";
import type { CloseTaskKey, ClosePeriod, ID, ISODate, Organization, Reconciliation, Transaction } from "@/lib/types";
import { commit, db } from "@/server/db/store";
import { newId } from "@/server/db/ids";
import { addDays, addMonths, monthEnd, monthName, periodOf, today } from "@/lib/dates";
import { bookItems, summarize } from "@/server/engines/reconciliation";
import { recordAudit } from "./audit";
import { upsertBundle } from "./notifications";
import { NotFoundError, ValidationError, excludeTransaction, getTxn } from "./transactions";
import type { Ctx } from "@/server/auth/session";
import { money } from "@/lib/format";

// ─── Periods ──────────────────────────────────────────────────────────────────

export function periodRange(period: string): { from: ISODate; to: ISODate } {
  if (/^\d{4}-\d{2}$/.test(period)) return { from: `${period}-01`, to: monthEnd(period) };
  const q = period.match(/^(\d{4})-Q([1-4])$/);
  if (q) {
    const start = `${q[1]}-${String((Number(q[2]) - 1) * 3 + 1).padStart(2, "0")}`;
    return { from: `${start}-01`, to: monthEnd(addMonths(start, 2)) };
  }
  return { from: `${period}-01-01`, to: `${period}-12-31` };
}

export function periodLabel(period: string): string {
  if (/^\d{4}-\d{2}$/.test(period)) return `${monthName(period)} ${period.slice(0, 4)}`;
  if (/Q/.test(period)) return `${period.slice(5)} ${period.slice(0, 4)}`;
  return `Fiscal year ${period}`;
}

export const TASKS: { key: CloseTaskKey; label: string; auto: boolean; owner: "AI" | "Bookkeeper" | "Reviewer" | "Client" }[] = [
  { key: "transactions_categorized", label: "Transactions categorized", auto: true, owner: "AI" },
  { key: "documents_processed", label: "Documents processed", auto: true, owner: "AI" },
  { key: "bank_reconciliation", label: "Bank reconciliation", auto: true, owner: "Bookkeeper" },
  { key: "credit_card_reconciliation", label: "Credit card reconciliation", auto: true, owner: "Bookkeeper" },
  { key: "client_questions_resolved", label: "Client questions resolved", auto: true, owner: "Client" },
  { key: "bookkeeper_review", label: "Bookkeeper review", auto: false, owner: "Bookkeeper" },
  { key: "reviewer_approval", label: "Reviewer approval", auto: false, owner: "Reviewer" },
  { key: "reports_generated", label: "Reports generated", auto: true, owner: "AI" },
];

export interface CloseTask {
  key: CloseTaskKey;
  label: string;
  owner: string;
  auto: boolean;
  state: "done" | "in_progress" | "todo";
  detail: string;
  href?: string;
  by?: string;
  at?: string;
}

function userName(id?: string) {
  if (!id) return undefined;
  if (id === "fabrik-ai") return "Fabrik AI";
  return db().users.find((u) => u.id === id)?.name;
}

export function closeStatus(orgId: ID, cp: ClosePeriod) {
  const data = db();
  const { from, to } = periodRange(cp.period);
  const txns = data.transactions.filter((t) => t.orgId === orgId && t.date >= from && t.date <= to);
  const pending = txns.filter((t) => t.status === "needs_review" || t.status === "waiting_for_client");
  const docs = data.documents.filter((d) => d.orgId === orgId && d.uploadedAt.slice(0, 10) >= from && d.uploadedAt.slice(0, 10) <= addDays(to, 10));
  const openDocs = docs.filter((d) => d.status === "processing" || d.status === "needs_review" || (d.status === "extracted" && d.match?.status === "suggested"));
  const banks = data.bankAccounts.filter((b) => b.orgId === orgId);
  const monthKeys = /^\d{4}-\d{2}$/.test(cp.period) ? [cp.period] : Array.from({ length: 12 }, (_, i) => addMonths(`${from.slice(0, 7)}`, i)).filter((p) => p <= to.slice(0, 7));
  const recState = (kind: "bank" | "card") => {
    const relevant = banks.filter((b) => (kind === "card" ? b.kind === "credit_card" : b.kind !== "credit_card"));
    const recs = relevant.flatMap((b) => monthKeys.map((p) => data.reconciliations.find((r) => r.bankAccountId === b.id && r.period === p)));
    const approved = recs.filter((r) => r?.status === "approved").length;
    return { total: recs.length, approved, state: (recs.length && approved === recs.length ? "done" : approved || recs.some((r) => r && r.status !== "not_started") ? "in_progress" : "todo") as CloseTask["state"] };
  };
  const questions = data.inbox.filter((i) => i.orgId === orgId && i.period && i.period >= from.slice(0, 7) && i.period <= to.slice(0, 7) && i.status === "open");
  const bank = recState("bank");
  const card = recState("card");
  const m = cp.manual;
  const tasks: CloseTask[] = TASKS.map((t) => {
    switch (t.key) {
      case "transactions_categorized":
        return { ...t, state: pending.length ? "in_progress" : "done", detail: pending.length ? `${pending.length} of ${txns.length} still need review` : `${txns.length} transactions`, href: "/books?status=needs_review" };
      case "documents_processed":
        return { ...t, state: openDocs.length ? "in_progress" : "done", detail: openDocs.length ? `${openDocs.length} need attention` : `${docs.length} documents`, href: "/documents" };
      case "bank_reconciliation":
        return { ...t, state: bank.state, detail: `${bank.approved} of ${bank.total} accounts approved`, href: `/reconciliation?period=${monthKeys.at(-1)}` };
      case "credit_card_reconciliation":
        return { ...t, state: card.total ? card.state : "done", detail: card.total ? `${card.approved} of ${card.total} cards approved` : "No credit cards", href: `/reconciliation?period=${monthKeys.at(-1)}` };
      case "client_questions_resolved":
        return { ...t, state: questions.length ? "in_progress" : "done", detail: questions.length ? `${questions.length} open` : "None open", href: "/inbox" };
      case "reports_generated":
        return { ...t, state: cp.packageGeneratedAt ? "done" : "todo", detail: cp.packageGeneratedAt ? "Finance package ready" : "Generated when the reviewer approves", href: `/close/${cp.period}/package`, by: userName(m.reports_generated?.by), at: cp.packageGeneratedAt };
      default: {
        const done = m[t.key]?.done;
        return { ...t, state: done ? "done" : "todo", detail: done ? (m[t.key]?.note ?? "Complete") : t.key === "reviewer_approval" ? "Awaiting reviewer" : "Awaiting bookkeeper", by: userName(m[t.key]?.by), at: m[t.key]?.at };
      }
    }
  });
  const done = tasks.filter((t) => t.state === "done").length;
  const blocking = tasks.filter((t) => t.key !== "reviewer_approval" && t.key !== "reports_generated" && t.state !== "done");
  return { tasks, done, total: tasks.length, pct: Math.round((done / tasks.length) * 100), readyForApproval: blocking.length === 0, blocking };
}

export function ensureClosePeriods(org: Organization): ClosePeriod[] {
  const data = db();
  const d = today();
  const cur = periodOf(d);
  const wanted: string[] = [];
  if (org.closeFrequency === "monthly") for (let i = 3; i >= 0; i--) wanted.push(addMonths(cur, -i));
  else if (org.closeFrequency === "quarterly") {
    const q = Math.floor((Number(cur.slice(5, 7)) - 1) / 3) + 1;
    wanted.push(q === 1 ? `${Number(cur.slice(0, 4)) - 1}-Q4` : `${cur.slice(0, 4)}-Q${q - 1}`, `${cur.slice(0, 4)}-Q${q}`);
  } else wanted.push(String(Number(cur.slice(0, 4)) - 1), cur.slice(0, 4));
  for (const p of wanted) {
    if (!data.closePeriods.some((c) => c.orgId === org.id && c.period === p)) {
      data.closePeriods.push({ id: newId("cp"), orgId: org.id, period: p, status: "open", manual: {}, targetCloseDate: addDays(periodRange(p).to, 10) });
    }
  }
  return data.closePeriods.filter((c) => c.orgId === org.id && (org.closeFrequency === "monthly" ? /^\d{4}-\d{2}$/.test(c.period) : org.closeFrequency === "quarterly" ? /Q/.test(c.period) : /^\d{4}$/.test(c.period))).sort((a, b) => b.period.localeCompare(a.period));
}

/** The period the customer is waiting on: earliest not-closed, past period (falls back to the latest). */
export function currentClose(orgId: ID) {
  const org = db().organizations.find((o) => o.id === orgId)!;
  const periods = ensureClosePeriods(org);
  const d = today();
  const pendingPast = periods.filter((p) => p.status !== "closed" && periodRange(p.period).to < d).sort((a, b) => a.period.localeCompare(b.period));
  const cp = pendingPast[0] ?? periods[0]!;
  return { cp, ...closeStatus(orgId, cp) };
}

export function getClosePeriod(ctx: Ctx, period: string): ClosePeriod {
  ensureClosePeriods(ctx.org);
  const cp = db().closePeriods.find((c) => c.orgId === ctx.org.id && c.period === period);
  if (!cp) throw new NotFoundError("Close period not found");
  return cp;
}

export function completeManualTask(ctx: Ctx, period: string, key: "bookkeeper_review", note?: string) {
  const cp = getClosePeriod(ctx, period);
  if (cp.status === "closed") throw new ValidationError("Period is already closed");
  cp.manual[key] = { done: true, by: ctx.user.id, at: new Date().toISOString(), note };
  if (cp.status === "open") cp.status = "in_review";
  recordAudit(ctx, { orgId: ctx.org.id, action: "close.bookkeeper_review_completed", entity: { type: "close", id: cp.id, label: periodLabel(period) }, comment: note, humanSeconds: 300 });
  commit();
}

export function approveClose(ctx: Ctx, period: string, note?: string) {
  const cp = getClosePeriod(ctx, period);
  const s = closeStatus(ctx.org.id, cp);
  if (!s.readyForApproval) throw new ValidationError(`Finish first: ${s.blocking.map((b) => b.label.toLowerCase()).join(", ")}`);
  if (ctx.org.assignedBookkeeperId === ctx.user.id && cp.manual.bookkeeper_review?.by === ctx.user.id) throw new ValidationError("Segregation of duties: the reviewer must be different from the bookkeeper who prepared the close");
  const at = new Date().toISOString();
  cp.manual.reviewer_approval = { done: true, by: ctx.user.id, at, note };
  cp.manual.reports_generated = { done: true, by: "fabrik-ai", at };
  cp.status = "closed";
  cp.closedAt = at;
  cp.packageGeneratedAt = at;
  recordAudit(ctx, { orgId: ctx.org.id, action: "close.approved", entity: { type: "close", id: cp.id, label: periodLabel(period) }, comment: note, humanSeconds: 420 });
  upsertBundle({ orgId: ctx.org.id, kind: "books_ready", title: `${periodLabel(period).split(" ")[0]} books are ready`, body: "Your monthly finance package is available.", href: `/close/${period}/package`, bundleKey: `close:${ctx.org.id}:${period}`, count: 1, email: true });
  commit();
}

export function reopenClose(ctx: Ctx, period: string, reason: string) {
  const cp = getClosePeriod(ctx, period);
  cp.status = "in_review";
  delete cp.manual.reviewer_approval;
  delete cp.manual.reports_generated;
  cp.closedAt = undefined;
  cp.packageGeneratedAt = undefined;
  recordAudit(ctx, { orgId: ctx.org.id, action: "close.reopened", entity: { type: "close", id: cp.id, label: periodLabel(period) }, comment: reason });
  commit();
}

export function setCloseFrequency(ctx: Ctx, frequency: Organization["closeFrequency"]) {
  const before = ctx.org.closeFrequency;
  ctx.org.closeFrequency = frequency;
  ensureClosePeriods(ctx.org);
  recordAudit(ctx, { orgId: ctx.org.id, action: "settings.close_frequency_changed", entity: { type: "organization", id: ctx.org.id }, before: { frequency: before }, after: { frequency } });
  commit();
}

// ─── Reconciliation (PRD §11) ────────────────────────────────────────────────

export function getRec(ctx: Ctx, id: ID): Reconciliation {
  const r = db().reconciliations.find((x) => x.id === id && x.orgId === ctx.org.id);
  if (!r) throw new NotFoundError("Reconciliation not found");
  return r;
}

export function recsForPeriod(ctx: Ctx, period: string) {
  const data = db();
  const { from, to } = periodRange(period);
  const txns = data.transactions.filter((t) => t.orgId === ctx.org.id);
  return data.bankAccounts
    .filter((b) => b.orgId === ctx.org.id)
    .map((bank) => {
      const rec = data.reconciliations.find((r) => r.bankAccountId === bank.id && r.period === period);
      return { bank, rec, summary: rec ? summarize(rec, bookItems(bank, txns, from, to)) : undefined };
    });
}

export function recDetail(ctx: Ctx, id: ID) {
  const rec = getRec(ctx, id);
  const data = db();
  const bank = data.bankAccounts.find((b) => b.id === rec.bankAccountId)!;
  const { from, to } = periodRange(rec.period);
  const items = bookItems(bank, data.transactions.filter((t) => t.orgId === ctx.org.id), from, to);
  return { rec, bank, items, summary: summarize(rec, items), statementDoc: data.documents.find((d) => d.id === rec.statementDocumentId), preparedBy: userName(rec.preparedBy), approvedBy: userName(rec.approvedBy) };
}

function touch(ctx: Ctx, rec: Reconciliation, action: string, after: Record<string, unknown>, humanSeconds = 20) {
  if (rec.status === "approved") throw new ValidationError("Reopen the reconciliation before making changes");
  rec.preparedBy = ctx.user.id;
  rec.status = "in_progress";
  recordAudit(ctx, { orgId: ctx.org.id, action: `reconciliation.${action}`, entity: { type: "reconciliation", id: rec.id, label: rec.period }, after, humanSeconds });
}

export function acceptLine(ctx: Ctx, recId: ID, lineId: ID) {
  const rec = getRec(ctx, recId);
  const l = rec.lines.find((x) => x.id === lineId);
  if (!l?.transactionId) throw new ValidationError("No suggestion to accept");
  touch(ctx, rec, "match_accepted", { line: l.description });
  l.state = "matched";
  commit();
}

export function matchLine(ctx: Ctx, recId: ID, lineId: ID, txnId: ID) {
  const rec = getRec(ctx, recId);
  const l = rec.lines.find((x) => x.id === lineId);
  if (!l) throw new NotFoundError("Line not found");
  const t = getTxn(ctx, txnId);
  touch(ctx, rec, "matched_manually", { line: l.description, transaction: t.description });
  Object.assign(l, { state: "matched", transactionId: t.id, confidence: 1 });
  commit();
}

export function unmatchLine(ctx: Ctx, recId: ID, lineId: ID) {
  const rec = getRec(ctx, recId);
  const l = rec.lines.find((x) => x.id === lineId);
  if (!l) throw new NotFoundError("Line not found");
  touch(ctx, rec, "unmatched", { line: l.description });
  Object.assign(l, { state: "unmatched", transactionId: undefined, confidence: undefined });
  commit();
}

/** Records a statement-only item (bank fee, interest) in the books, then matches it. */
export function createFromLine(ctx: Ctx, recId: ID, lineId: ID, accountId: ID) {
  const rec = getRec(ctx, recId);
  const l = rec.lines.find((x) => x.id === lineId);
  if (!l || l.state !== "unmatched") throw new ValidationError("Line is not unmatched");
  if (!db().glAccounts.some((a) => a.id === accountId && a.orgId === ctx.org.id)) throw new ValidationError("Invalid account");
  const t: Transaction = { id: newId("txn"), orgId: ctx.org.id, externalId: `fabrik-${newId("x")}`, bankAccountId: rec.bankAccountId, date: l.date, description: l.description, amount: l.amount, accountId, type: l.amount > 0 ? "income" : "expense", status: "approved", documentIds: rec.statementDocumentId ? [rec.statementDocumentId] : [], reviewedBy: ctx.user.id, reviewedAt: new Date().toISOString(), syncState: "pending_writeback", version: 1, createdAt: new Date().toISOString(), memo: "Recorded from bank statement during reconciliation" };
  db().transactions.push(t);
  touch(ctx, rec, "transaction_created_from_statement", { description: l.description, amount: money(l.amount, { decimals: true }) });
  Object.assign(l, { state: "matched", transactionId: t.id, confidence: 1 });
  commit();
  return t;
}

export function resolveBookItem(ctx: Ctx, recId: ID, txnId: ID, action: "duplicate" | "outstanding" | "clear") {
  const rec = getRec(ctx, recId);
  if (action === "duplicate") {
    excludeTransaction(ctx, txnId, `Duplicate found during ${rec.period} reconciliation`);
    touch(ctx, rec, "duplicate_excluded", { transactionId: txnId });
  } else if (action === "outstanding") {
    if (!rec.outstandingTxnIds.includes(txnId)) rec.outstandingTxnIds.push(txnId);
    touch(ctx, rec, "marked_outstanding", { transactionId: txnId });
  } else {
    rec.outstandingTxnIds = rec.outstandingTxnIds.filter((x) => x !== txnId);
    touch(ctx, rec, "outstanding_cleared", { transactionId: txnId });
  }
  commit();
}

export function approveRec(ctx: Ctx, recId: ID) {
  const d = recDetail(ctx, recId);
  if (!d.summary.canApprove) throw new ValidationError(d.summary.difference !== 0 ? `Difference of ${money(d.summary.difference, { decimals: true })} must be resolved` : "Resolve every unmatched line and book item first");
  d.rec.status = "approved";
  d.rec.approvedBy = ctx.user.id;
  d.rec.approvedAt = new Date().toISOString();
  recordAudit(ctx, { orgId: ctx.org.id, action: "reconciliation.approved", entity: { type: "reconciliation", id: d.rec.id, label: `${d.bank.name} ••••${d.bank.mask} · ${d.rec.period}` }, after: { statementBalance: money(d.summary.statementBalance, { decimals: true }), difference: 0 }, humanSeconds: 90 });
  commit();
}

export function reopenRec(ctx: Ctx, recId: ID) {
  const rec = getRec(ctx, recId);
  rec.status = "in_progress";
  rec.approvedAt = undefined;
  rec.approvedBy = undefined;
  recordAudit(ctx, { orgId: ctx.org.id, action: "reconciliation.reopened", entity: { type: "reconciliation", id: rec.id, label: rec.period } });
  commit();
}
