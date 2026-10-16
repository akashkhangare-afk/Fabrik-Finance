import "server-only";
import type { CategorizationRule, ID, InboxItem, Split, Transaction } from "@/lib/types";
import { commit, db } from "@/server/db/store";
import { newId } from "@/server/db/ids";
import { buildHistory, categorize, type CategorizeContext } from "@/server/engines/categorization";
import { accountingProvider } from "@/server/integrations/accounting";
import { auditFor, recordAudit } from "./audit";
import { refreshInboxNotification } from "./notifications";
import type { Ctx } from "@/server/auth/session";
import { money } from "@/lib/format";
import { prettyDate } from "@/lib/dates";

export class NotFoundError extends Error {}
export class ValidationError extends Error {}

/** Tenant-scoped lookup: a transaction outside the caller's organization is indistinguishable from a missing one. */
export function getTxn(ctx: Ctx, id: ID): Transaction {
  const t = db().transactions.find((x) => x.id === id && x.orgId === ctx.org.id);
  if (!t) throw new NotFoundError("Transaction not found");
  return t;
}

export function accountName(id?: ID): string {
  if (!id) return "Uncategorized";
  return db().glAccounts.find((a) => a.id === id)?.name ?? "Unknown account";
}

export interface TxnFilters {
  q?: string;
  from?: string;
  to?: string;
  bankAccountId?: string;
  accountId?: string;
  status?: string;
  vendorId?: string;
  minAmount?: number;
  maxAmount?: number;
  confidence?: "high" | "medium" | "low";
  page?: number;
  pageSize?: number;
}

export function listTransactions(ctx: Ctx, f: TxnFilters) {
  const data = db();
  const q = f.q?.trim().toUpperCase();
  const { autoApprove, review } = ctx.org.thresholds;
  let rows = data.transactions.filter((t) => t.orgId === ctx.org.id);
  if (f.from) rows = rows.filter((t) => t.date >= f.from!);
  if (f.to) rows = rows.filter((t) => t.date <= f.to!);
  if (f.bankAccountId) rows = rows.filter((t) => t.bankAccountId === f.bankAccountId);
  if (f.accountId) rows = rows.filter((t) => (t.accountId ?? t.ai?.accountId) === f.accountId || t.splits?.some((s) => s.accountId === f.accountId));
  if (f.status) rows = rows.filter((t) => t.status === f.status);
  if (f.vendorId) rows = rows.filter((t) => t.vendorId === f.vendorId);
  if (f.minAmount != null) rows = rows.filter((t) => Math.abs(t.amount) >= f.minAmount! * 100);
  if (f.maxAmount != null) rows = rows.filter((t) => Math.abs(t.amount) <= f.maxAmount! * 100);
  if (f.confidence) rows = rows.filter((t) => {
    const c = t.ai?.confidence ?? 0;
    return f.confidence === "high" ? c >= autoApprove : f.confidence === "medium" ? c >= review && c < autoApprove : c < review;
  });
  if (q) rows = rows.filter((t) => t.description.toUpperCase().includes(q) || t.ai?.normalizedVendor.toUpperCase().includes(q) || money(t.amount, { decimals: true }).includes(q));
  rows.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const pageSize = f.pageSize ?? 50;
  const page = Math.max(1, f.page ?? 1);
  const statusCounts: Record<string, number> = {};
  for (const t of data.transactions) if (t.orgId === ctx.org.id) statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1;
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize, statusCounts };
}

export function transactionDetail(ctx: Ctx, id: ID) {
  const t = getTxn(ctx, id);
  const data = db();
  const bank = data.bankAccounts.find((b) => b.id === t.bankAccountId)!;
  const vendor = data.vendors.find((v) => v.id === t.vendorId);
  const history = t.vendorId
    ? data.transactions.filter((x) => x.orgId === ctx.org.id && x.vendorId === t.vendorId && x.id !== t.id && x.date <= t.date && (x.status === "approved" || x.status === "processed")).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12)
    : [];
  return {
    txn: t,
    bank,
    vendor,
    documents: data.documents.filter((d) => t.documentIds.includes(d.id) || d.id === t.ai?.documentMatch?.documentId),
    audit: auditFor(ctx.org.id, t.id),
    history: history.map((h) => ({ id: h.id, date: h.date, amount: h.amount, account: accountName(h.accountId ?? h.splits?.[0]?.accountId) })),
    duplicateOf: t.ai?.possibleDuplicateOf ? data.transactions.find((x) => x.id === t.ai!.possibleDuplicateOf) : undefined,
    inbox: data.inbox.filter((i) => i.related?.type === "transaction" && i.related.id === t.id),
    rule: t.ai?.evidence.ruleId ? data.rules.find((r) => r.id === t.ai!.evidence.ruleId) : undefined,
  };
}

export function categorizeContext(orgId: ID): CategorizeContext {
  const data = db();
  const txns = data.transactions.filter((t) => t.orgId === orgId);
  return {
    org: data.organizations.find((o) => o.id === orgId)!,
    accounts: data.glAccounts.filter((a) => a.orgId === orgId),
    vendors: data.vendors.filter((v) => v.orgId === orgId),
    rules: data.rules.filter((r) => r.orgId === orgId),
    riskRules: data.riskRules,
    history: buildHistory(txns),
    recent: txns.slice(-400),
    documents: data.documents.filter((d) => d.orgId === orgId && d.extraction && d.match?.status !== "confirmed"),
  };
}

/** Re-runs the Transaction Agent over live items (after a rule, threshold or document change). */
export function reprocessLive(ctx: Ctx | null, orgId: ID, opts: { ids?: ID[] } = {}): { autoProcessed: Transaction[] } {
  const c = categorizeContext(orgId);
  const autoProcessed: Transaction[] = [];
  for (const t of db().transactions) {
    if (t.orgId !== orgId || t.status !== "needs_review") continue;
    if (opts.ids && !opts.ids.includes(t.id)) continue;
    const out = categorize(t, c);
    t.ai = { ...out.suggestion, generatedAt: new Date().toISOString() };
    t.risk = out.risk;
    t.vendorId = out.vendor?.id ?? t.vendorId;
    t.type = out.suggestion.transactionType;
    if (out.suggestion.decision === "auto") {
      t.status = "processed";
      t.accountId = out.suggestion.accountId;
      t.syncState = "pending_writeback";
      t.version += 1;
      autoProcessed.push(t);
      recordAudit(ctx, { orgId, action: "transaction.auto_processed", entity: { type: "transaction", id: t.id, label: t.ai.normalizedVendor }, after: { account: accountName(t.accountId), confidence: t.ai.confidence }, ai: { recommendation: accountName(t.ai.accountId), confidence: t.ai.confidence, model: t.ai.model, modelVersion: t.ai.modelVersion } }, { type: "system", id: "auto-processor", name: "Fabrik automation" });
    }
  }
  return { autoProcessed };
}

function learnRule(ctx: Ctx, t: Transaction, accountId: ID): CategorizationRule | null {
  const data = db();
  if (/^CHECK/i.test(t.description)) return null;
  const label = `${t.ai?.normalizedVendor ?? t.description} → ${accountName(accountId)}`;
  if (t.vendorId) {
    const existing = data.rules.find((r) => r.orgId === ctx.org.id && r.kind === "vendor" && r.match.vendorId === t.vendorId && r.match.amountMin == null);
    if (existing) {
      existing.accountId = accountId;
      existing.label = label;
      existing.createdFrom = "correction";
      return existing;
    }
    const hist = buildHistory(data.transactions.filter((x) => x.orgId === ctx.org.id && x.vendorId === t.vendorId)).byVendor.get(t.vendorId);
    // Only learn a vendor-wide default when history isn't genuinely mixed across accounts.
    if (hist && hist.total >= 4 && Math.max(...hist.counts.values()) / hist.total < 0.75) return null;
    const rule: CategorizationRule = { id: newId("rule"), orgId: ctx.org.id, kind: "vendor", label, match: { vendorId: t.vendorId }, accountId, createdBy: ctx.user.id, createdFrom: "correction", hits: 0, active: true, createdAt: new Date().toISOString() };
    data.rules.push(rule);
    return rule;
  }
  const token = t.description.replace(/[^A-Za-z ]/g, " ").trim().split(/\s+/).filter((w) => w.length > 2).slice(0, 2).join(" ");
  if (token.length < 4) return null;
  const rule: CategorizationRule = { id: newId("rule"), orgId: ctx.org.id, kind: "description", label: `“${token}” → ${accountName(accountId)}`, match: { descriptionContains: token }, accountId, createdBy: ctx.user.id, createdFrom: "correction", hits: 0, active: true, createdAt: new Date().toISOString() };
  data.rules.push(rule);
  return rule;
}

export interface ApproveInput {
  accountId?: ID;
  splits?: Split[];
  comment?: string;
  humanSeconds?: number;
  learn?: boolean;
}

export async function approveTransaction(ctx: Ctx, id: ID, input: ApproveInput = {}) {
  const t = getTxn(ctx, id);
  if (t.status === "approved" || t.status === "processed" || t.status === "excluded") {
    if (!input.accountId || input.accountId === t.accountId) throw new ValidationError("Transaction is already finalized");
  }
  const accounts = db().glAccounts.filter((a) => a.orgId === ctx.org.id);
  const target = input.accountId ?? t.ai?.accountId;
  if (!input.splits && (!target || !accounts.some((a) => a.id === target))) throw new ValidationError("Choose a valid account");
  if (input.splits) {
    const total = input.splits.reduce((s, x) => s + x.amount, 0);
    if (total !== t.amount) throw new ValidationError("Split amounts must add up to the transaction amount");
    if (!input.splits.every((s) => accounts.some((a) => a.id === s.accountId))) throw new ValidationError("Invalid split account");
  }
  const before = { account: t.splits?.length ? "Split" : accountName(t.accountId ?? t.ai?.accountId), status: t.status };
  const suggested = t.ai?.accountId;
  const changed = Boolean(input.splits) || (target !== undefined && target !== suggested);
  const entity = { type: "transaction", id: t.id, label: `${t.ai?.normalizedVendor ?? t.description} · ${money(t.amount, { decimals: true })}` };
  let rule: CategorizationRule | null = null;

  if (changed) {
    recordAudit(ctx, { orgId: ctx.org.id, action: "transaction.category_changed", entity, before, after: { account: input.splits ? "Split" : accountName(target) }, comment: input.comment, humanSeconds: input.humanSeconds, ai: t.ai ? { recommendation: accountName(suggested), confidence: t.ai.confidence, model: t.ai.model, modelVersion: t.ai.modelVersion } : undefined });
    if (!input.splits && target && input.learn !== false) rule = learnRule(ctx, t, target);
    if (rule) recordAudit(ctx, { orgId: ctx.org.id, action: "rule.learned", entity, after: { rule: rule.label } }, { type: "system", id: "rules-engine", name: "Fabrik rules engine" });
  }
  t.splits = input.splits;
  t.accountId = input.splits ? undefined : target;
  t.status = "approved";
  t.reviewedBy = ctx.user.id;
  t.reviewedAt = new Date().toISOString();
  t.syncState = "pending_writeback";
  t.version += 1;
  recordAudit(ctx, { orgId: ctx.org.id, action: "transaction.approved", entity, before, after: { account: input.splits ? "Split" : accountName(target), status: "approved" }, comment: changed ? undefined : input.comment, humanSeconds: changed ? 4 : input.humanSeconds, risk: t.risk?.reasons.length ? { level: t.risk.level, reasons: t.risk.reasons.map((r) => r.label) } : undefined, ai: !changed && t.ai ? { recommendation: accountName(suggested), confidence: t.ai.confidence, model: t.ai.model, modelVersion: t.ai.modelVersion } : undefined });

  for (const i of db().inbox.filter((x) => x.related?.type === "transaction" && x.related.id === t.id && x.status === "open")) {
    i.status = "resolved";
    i.resolvedAt = new Date().toISOString();
  }
  const wb = await accountingProvider(ctx.org.id).writeBack(t);
  if (wb.ok) {
    t.syncState = "synced";
    recordAudit(null, { orgId: ctx.org.id, action: "transaction.written_back", entity, after: { target: "QuickBooks Online", version: t.version } }, { type: "system", id: "qbo-sync", name: "QuickBooks sync" });
  } else recordAudit(null, { orgId: ctx.org.id, action: "transaction.writeback_failed", entity, after: { error: wb.error, retryable: wb.retryable } }, { type: "system", id: "qbo-sync", name: "QuickBooks sync" });

  const reprocessed = rule ? reprocessLive(ctx, ctx.org.id).autoProcessed : [];
  refreshInboxNotification(ctx.org.id);
  commit();
  return { txn: t, rule, autoProcessed: reprocessed.length };
}

export async function bulkApprove(ctx: Ctx, ids: ID[], humanSeconds?: number) {
  let approved = 0;
  const skipped: string[] = [];
  for (const id of ids) {
    const t = getTxn(ctx, id);
    if (t.status !== "needs_review" || !t.ai || t.ai.decision === "clarify") {
      skipped.push(t.ai?.normalizedVendor ?? t.description);
      continue;
    }
    await approveTransaction(ctx, id, { humanSeconds: humanSeconds ? Math.round(humanSeconds / ids.length) : 3 });
    approved++;
  }
  return { approved, skipped };
}

/** "Ask client": Fabrik drafts the question from the AI alternatives; the client answers in Finance Inbox. */
export function draftClientQuestion(t: Transaction): { body: string; options: InboxItem["options"] } {
  const alts = (t.ai?.alternatives ?? []).filter((a) => a.confidence >= 0.05).slice(0, 3);
  const names = alts.map((a) => accountName(a.accountId).toLowerCase());
  const vendor = t.ai?.normalizedVendor ?? t.description;
  const what = t.amount < 0 ? "purchase" : "deposit";
  const body =
    names.length >= 2
      ? `We found a ${money(t.amount < 0 ? -t.amount : t.amount, { decimals: true })} ${vendor} ${what} on ${prettyDate(t.date)}. Was this for ${names.slice(0, -1).join(", ")} or ${names.at(-1)}, or something else?`
      : `We found a ${money(Math.abs(t.amount), { decimals: true })} ${what} (“${t.description}”) on ${prettyDate(t.date)}. What was it for?`;
  return { body, options: [...alts.map((a) => ({ label: accountName(a.accountId), value: a.accountId, confidence: a.confidence })), { label: "Something else", value: "other" }] };
}

export function askClient(ctx: Ctx, id: ID, input: { body?: string; humanSeconds?: number }) {
  const t = getTxn(ctx, id);
  const draft = draftClientQuestion(t);
  const item: InboxItem = {
    id: newId("inb"),
    orgId: ctx.org.id,
    type: "transaction_clarification",
    title: "We need help categorizing this transaction",
    body: input.body?.trim() || draft.body,
    status: "open",
    priority: "normal",
    related: { type: "transaction", id: t.id },
    options: draft.options,
    createdBy: ctx.user.id,
    createdAt: new Date().toISOString(),
    period: t.date.slice(0, 7),
  };
  db().inbox.push(item);
  t.status = "waiting_for_client";
  recordAudit(ctx, { orgId: ctx.org.id, action: "transaction.client_question_sent", entity: { type: "transaction", id: t.id, label: t.ai?.normalizedVendor }, after: { question: item.body }, humanSeconds: input.humanSeconds });
  refreshInboxNotification(ctx.org.id, true);
  commit();
  return item;
}

export function escalate(ctx: Ctx, id: ID, note: string) {
  const t = getTxn(ctx, id);
  const reviewer = ctx.org.assignedReviewerId;
  db().workItems.push({ id: newId("wrk"), key: `escalation:${t.id}`, auto: false, orgId: ctx.org.id, type: "review_transactions", title: `Escalated: ${t.ai?.normalizedVendor ?? t.description} ${money(t.amount, { decimals: true })} — ${note || "needs reviewer decision"}`, priority: "high", status: "open", assigneeId: reviewer, period: t.date.slice(0, 7), createdAt: new Date().toISOString(), href: `/books?txn=${t.id}` });
  t.memo = `Escalated: ${note}`;
  recordAudit(ctx, { orgId: ctx.org.id, action: "transaction.escalated", entity: { type: "transaction", id: t.id, label: t.ai?.normalizedVendor }, comment: note });
  commit();
}

export function excludeTransaction(ctx: Ctx, id: ID, reason: string) {
  const t = getTxn(ctx, id);
  const before = t.status;
  t.status = "excluded";
  t.version += 1;
  t.syncState = "pending_writeback";
  recordAudit(ctx, { orgId: ctx.org.id, action: "transaction.excluded", entity: { type: "transaction", id: t.id, label: t.ai?.normalizedVendor }, before: { status: before }, after: { status: "excluded" }, comment: reason });
  commit();
}

export function reviewQueue(orgId: ID) {
  return db()
    .transactions.filter((t) => t.orgId === orgId && t.status === "needs_review")
    .sort((a, b) => (b.risk?.score ?? 0) - (a.risk?.score ?? 0) || (a.ai?.confidence ?? 0) - (b.ai?.confidence ?? 0));
}
