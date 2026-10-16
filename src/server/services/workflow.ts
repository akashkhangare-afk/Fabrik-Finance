import "server-only";
import type { Bill, CollectionReminder, ID, InboxItem } from "@/lib/types";
import { commit, db } from "@/server/db/store";
import { newId } from "@/server/db/ids";
import { recordAudit } from "./audit";
import { refreshInboxNotification, sendEmail } from "./notifications";
import { NotFoundError, ValidationError, accountName, getTxn } from "./transactions";
import { openReceivables } from "./finance";
import type { Ctx } from "@/server/auth/session";
import { money } from "@/lib/format";
import { addDays, diffDays, prettyDate, today } from "@/lib/dates";

// ─── Finance Inbox (PRD §6 / Expo §23) ──────────────────────────────────────

export function listInbox(ctx: Ctx, status: "open" | "done" = "open") {
  const items = db()
    .inbox.filter((i) => i.orgId === ctx.org.id && (status === "open" ? i.status === "open" : i.status !== "open"))
    .sort((a, b) => (status === "open" ? (a.priority === "high" ? -1 : 0) - (b.priority === "high" ? -1 : 0) || a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt)));
  return items.map((i) => ({ item: i, context: inboxContext(i) }));
}

function inboxContext(i: InboxItem) {
  const data = db();
  if (i.related?.type === "transaction") {
    const t = data.transactions.find((x) => x.id === i.related!.id);
    if (!t) return undefined;
    const bank = data.bankAccounts.find((b) => b.id === t.bankAccountId);
    return { kind: "transaction" as const, vendor: t.ai?.normalizedVendor ?? t.description, description: t.description, amount: t.amount, date: t.date, account: bank ? `${bank.name} ••••${bank.mask}` : "", txnId: t.id };
  }
  if (i.related?.type === "bill") {
    const b = data.bills.find((x) => x.id === i.related!.id);
    if (!b) return undefined;
    return { kind: "bill" as const, vendor: data.vendors.find((v) => v.id === b.vendorId)?.name ?? "", number: b.number, amount: b.amount, dueDate: b.dueDate, category: accountName(b.accountId), documentId: b.documentId };
  }
  if (i.related?.type === "invoice") {
    const inv = data.invoices.find((x) => x.id === i.related!.id);
    if (!inv) return undefined;
    return { kind: "invoice" as const, customer: data.customers.find((c) => c.id === inv.customerId)?.name ?? "", number: inv.number, amount: inv.amount - inv.amountPaid, dueDate: inv.dueDate, daysOverdue: Math.max(0, diffDays(today(), inv.dueDate)), invoiceId: inv.id };
  }
  if (i.related?.type === "funding") return { kind: "funding" as const, programId: i.related.id };
  return undefined;
}

export function inboxSummary(orgId: ID) {
  const open = db().inbox.filter((i) => i.orgId === orgId && i.status === "open");
  const groups = { transactions: 0, documents: 0, bills: 0, invoices: 0, funding: 0, questions: 0 };
  for (const i of open) {
    if (i.type === "transaction_clarification" || i.type === "vendor_clarification" || i.type === "customer_clarification") groups.transactions++;
    else if (i.type === "missing_document" || i.type === "missing_receipt" || i.type === "tax_document_request") groups.documents++;
    else if (i.type === "bill_approval") groups.bills++;
    else if (i.type === "overdue_invoice") groups.invoices++;
    else if (i.type === "funding_info_request") groups.funding++;
    else groups.questions++;
  }
  return { total: open.length, ...groups };
}

export async function respondToInbox(ctx: Ctx, id: ID, input: { value?: string; label?: string; comment?: string }) {
  const data = db();
  const item = data.inbox.find((i) => i.id === id && i.orgId === ctx.org.id);
  if (!item) throw new NotFoundError("Item not found");
  if (item.status !== "open") throw new ValidationError("This item has already been answered");
  const at = new Date().toISOString();
  item.response = { value: input.value, label: input.label, comment: input.comment?.slice(0, 2000), userId: ctx.user.id, at };

  if (item.type === "transaction_clarification" && item.related?.type === "transaction") {
    const t = getTxn(ctx, item.related.id);
    const accountOk = input.value && data.glAccounts.some((a) => a.id === input.value && a.orgId === ctx.org.id);
    if (!accountOk && !input.comment?.trim()) throw new ValidationError("Pick a category or tell us what it was for");
    // Structured answer → bookkeeping information; the transaction returns to processing automatically.
    // The client's answer explains an unknown payee or unusual amount; other risk rules still need a bookkeeper.
    if (t.risk) {
      const remaining = t.risk.reasons.filter((r) => r.ruleKey !== "unknown_vendor" && r.ruleKey !== "anomaly");
      t.risk = { ...t.risk, reasons: remaining, forcesReview: remaining.length > 0 };
    }
    if (accountOk && t.ai) {
      t.ai = { ...t.ai, accountId: input.value!, confidence: 0.99, decision: t.risk?.forcesReview ? "review" : "auto", explanation: `Confirmed by ${ctx.user.name} in Finance Inbox${input.comment ? `: “${input.comment}”` : "."}`, evidence: { ...t.ai.evidence, basis: "rule" } };
    }
    if (accountOk && !t.risk?.forcesReview) {
      t.status = "processed";
      t.accountId = input.value;
      t.syncState = "pending_writeback";
      t.version += 1;
    } else t.status = "needs_review";
    if (input.comment) t.memo = input.comment;
    item.status = "resolved";
    recordAudit(ctx, { orgId: ctx.org.id, action: "inbox.client_answered", entity: { type: "transaction", id: t.id, label: t.ai?.normalizedVendor }, after: { answer: input.label ?? input.comment, status: t.status }, comment: input.comment });
  } else if (item.type === "bill_approval" && item.related?.type === "bill") {
    const action = input.value === "reject" ? "reject" : input.value === "request_review" ? "request_review" : "approve";
    decideBill(ctx, item.related.id, action, input.comment);
    item.status = "resolved";
  } else if (item.type === "funding_info_request") {
    const p = data.farmProfiles.find((x) => x.orgId === ctx.org.id);
    const n = Number(String(input.value ?? input.comment ?? "").replace(/[^\d.]/g, ""));
    if (p && n > 0) {
      p.baseAcres = n;
      p.updatedAt = at;
      p.updatedBy = ctx.user.id;
    }
    item.status = "resolved";
    recordAudit(ctx, { orgId: ctx.org.id, action: "funding.profile_updated", entity: { type: "farm_profile", id: ctx.org.id }, after: { baseAcres: n || input.comment } });
  } else {
    item.status = "answered";
    recordAudit(ctx, { orgId: ctx.org.id, action: "inbox.answered", entity: { type: "inbox", id: item.id, label: item.title }, comment: input.comment });
  }
  item.resolvedAt = at;
  refreshInboxNotification(ctx.org.id);
  commit();
  return item;
}

export function dismissInbox(ctx: Ctx, id: ID) {
  const item = db().inbox.find((i) => i.id === id && i.orgId === ctx.org.id);
  if (!item) throw new NotFoundError("Item not found");
  item.status = "dismissed";
  item.resolvedAt = new Date().toISOString();
  recordAudit(ctx, { orgId: ctx.org.id, action: "inbox.dismissed", entity: { type: "inbox", id, label: item.title } });
  refreshInboxNotification(ctx.org.id);
  commit();
}

export function createInboxItem(ctx: Ctx | null, item: Omit<InboxItem, "id" | "createdAt" | "status">) {
  const full: InboxItem = { ...item, id: newId("inb"), status: "open", createdAt: new Date().toISOString() };
  db().inbox.push(full);
  refreshInboxNotification(item.orgId, true);
  if (ctx) recordAudit(ctx, { orgId: item.orgId, action: "inbox.created", entity: { type: "inbox", id: full.id, label: full.title } });
  return full;
}

// ─── Bills Lite (Expo §10) — visibility and approval, no payment execution ──

export function listBills(ctx: Ctx) {
  const d = today();
  const data = db();
  const bills = data.bills.filter((b) => b.orgId === ctx.org.id).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const open = bills.filter((b) => b.status !== "paid" && b.status !== "rejected");
  return {
    bills: bills.map((b) => ({ ...b, vendor: data.vendors.find((v) => v.id === b.vendorId)?.name ?? "", category: accountName(b.accountId), overdue: b.dueDate < d && b.status !== "paid" && b.status !== "rejected", document: data.documents.find((x) => x.id === b.documentId) })),
    summary: {
      outstanding: open.reduce((s, b) => s + b.amount, 0),
      dueThisWeek: open.filter((b) => b.dueDate >= d && b.dueDate <= addDays(d, 6)).reduce((s, b) => s + b.amount, 0),
      overdue: open.filter((b) => b.dueDate < d).reduce((s, b) => s + b.amount, 0),
      needsApproval: open.filter((b) => b.status === "needs_review" || b.status === "received").length,
    },
  };
}

export function decideBill(ctx: Ctx, id: ID, action: "approve" | "reject" | "request_review", comment?: string): Bill {
  const b = db().bills.find((x) => x.id === id && x.orgId === ctx.org.id);
  if (!b) throw new NotFoundError("Bill not found");
  if (b.status === "paid") throw new ValidationError("Paid bills can't be changed");
  const before = b.status;
  b.status = action === "approve" ? "approved" : action === "reject" ? "rejected" : "needs_review";
  b.history.push({ userId: ctx.user.id, action, at: new Date().toISOString(), comment });
  recordAudit(ctx, { orgId: ctx.org.id, action: `bill.${action}`, entity: { type: "bill", id: b.id, label: `${b.number} · ${money(b.amount)}` }, before: { status: before }, after: { status: b.status }, comment });
  for (const i of db().inbox.filter((x) => x.related?.type === "bill" && x.related.id === b.id && x.status === "open")) {
    i.status = "resolved";
    i.resolvedAt = new Date().toISOString();
    i.response = { value: action, userId: ctx.user.id, at: new Date().toISOString(), comment };
  }
  refreshInboxNotification(ctx.org.id);
  commit();
  return b;
}

// ─── Collect Lite (Expo §11) — AR visibility and AI-drafted reminders ─────

export function listReceivables(ctx: Ctx) {
  const data = db();
  return openReceivables(ctx.org.id)
    .map((i) => {
      const c = data.customers.find((x) => x.id === i.customerId);
      const status = i.daysOverdue === 0 ? "current" : i.daysOverdue <= 30 ? "overdue_1_30" : i.daysOverdue <= 60 ? "overdue_31_60" : "overdue_60_plus";
      return { ...i, customer: c?.name ?? "", contact: c?.contactName, email: c?.email, status };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}

export function draftReminder(ctx: Ctx, invoiceId: ID): CollectionReminder {
  const data = db();
  const inv = data.invoices.find((i) => i.id === invoiceId && i.orgId === ctx.org.id);
  if (!inv) throw new NotFoundError("Invoice not found");
  const c = data.customers.find((x) => x.id === inv.customerId)!;
  const days = Math.max(0, diffDays(today(), inv.dueDate));
  const open = inv.amount - inv.amountPaid;
  const tone: CollectionReminder["tone"] = days > 120 ? "final" : days > 45 ? "firm" : "friendly";
  const greeting = c.contactName ? c.contactName.split(" ")[0] : "there";
  const signer = ctx.isStaff ? `${ctx.user.name}\non behalf of ${ctx.org.legalName}` : `${ctx.user.name}\n${ctx.org.legalName}`;
  const body =
    tone === "friendly"
      ? `Hi ${greeting},\n\nI hope the season is going well. This is a friendly reminder that invoice ${inv.number} for ${money(open, { decimals: true })} (${inv.memo ?? "services"}) was due on ${prettyDate(inv.dueDate, { year: true })}.\n\nIf payment is already on the way, thank you — please disregard this note. Otherwise, could you let me know when we can expect it?\n\nThanks,\n${signer}`
      : `Hi ${greeting},\n\nI'm following up on invoice ${inv.number} for ${money(open, { decimals: true })} (${inv.memo ?? "services"}), which was due on ${prettyDate(inv.dueDate, { year: true })} and is now ${days} days past due.\n\nCould you confirm a payment date this week? If there's an issue with the invoice, or if a payment plan would help, I'm happy to talk it through.\n\nThank you,\n${signer}`;
  const r: CollectionReminder = { id: newId("rem"), subject: `${days > 0 ? "Past due: " : ""}Invoice ${inv.number} — ${money(open)}`, body, tone, status: "draft", createdBy: ctx.user.id, createdAt: new Date().toISOString() };
  inv.reminders.push(r);
  recordAudit(ctx, { orgId: ctx.org.id, action: "collect.reminder_drafted", entity: { type: "invoice", id: inv.id, label: inv.number }, after: { tone } }, { type: "ai", id: "fabrik-collections", name: "Fabrik AI" });
  commit();
  return r;
}

/** Human approval is mandatory; "send" places the email in the outbox (no automated collection workflow). */
export function approveReminder(ctx: Ctx, invoiceId: ID, reminderId: ID, edits: { subject: string; body: string }) {
  const data = db();
  const inv = data.invoices.find((i) => i.id === invoiceId && i.orgId === ctx.org.id);
  const r = inv?.reminders.find((x) => x.id === reminderId);
  if (!inv || !r) throw new NotFoundError("Reminder not found");
  if (r.status !== "draft") throw new ValidationError("Reminder already handled");
  if (!edits.subject.trim() || !edits.body.trim()) throw new ValidationError("Subject and message are required");
  const c = data.customers.find((x) => x.id === inv.customerId)!;
  const at = new Date().toISOString();
  Object.assign(r, { subject: edits.subject.slice(0, 200), body: edits.body.slice(0, 5000), status: "sent", approvedBy: ctx.user.id, approvedAt: at, sentAt: at });
  if (c.email) sendEmail(c.email, r.subject, r.body, ctx.org.id);
  recordAudit(ctx, { orgId: ctx.org.id, action: "collect.reminder_approved_and_sent", entity: { type: "invoice", id: inv.id, label: inv.number }, after: { to: c.email, subject: r.subject } });
  for (const i of data.inbox.filter((x) => x.related?.type === "invoice" && x.related.id === inv.id && x.status === "open")) {
    i.status = "resolved";
    i.resolvedAt = at;
  }
  refreshInboxNotification(ctx.org.id);
  commit();
  return r;
}

export function discardReminder(ctx: Ctx, invoiceId: ID, reminderId: ID) {
  const inv = db().invoices.find((i) => i.id === invoiceId && i.orgId === ctx.org.id);
  const r = inv?.reminders.find((x) => x.id === reminderId);
  if (!inv || !r) throw new NotFoundError("Reminder not found");
  r.status = "discarded";
  commit();
}
