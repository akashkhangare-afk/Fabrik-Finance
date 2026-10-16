import "server-only";
import type { ID, Notification } from "@/lib/types";
import { db } from "@/server/db/store";
import { newId } from "@/server/db/ids";
import type { Ctx } from "@/server/auth/session";

/**
 * Notifications (PRD §22): in-app + email. Bundled by `bundleKey` so the customer gets
 * "Fabrik needs your help with 4 transactions", never one message per transaction.
 * Email goes through an adapter; in this build it lands in the dev outbox (Operations → Admin).
 */

const EMAIL_COOLDOWN_MS = 4 * 60 * 60 * 1000;

export function upsertBundle(n: Omit<Notification, "id" | "createdAt" | "updatedAt" | "readBy"> & { email?: boolean }): Notification {
  const data = db();
  const now = new Date().toISOString();
  const existing = n.bundleKey ? data.notifications.find((x) => x.bundleKey === n.bundleKey) : undefined;
  let note: Notification;
  if (existing) {
    const grew = n.count > existing.count;
    Object.assign(existing, { title: n.title, body: n.body, href: n.href, count: n.count, updatedAt: now });
    if (grew) existing.readBy = [];
    note = existing;
    if (n.email && grew && Date.now() - Date.parse(existing.createdAt) > EMAIL_COOLDOWN_MS) sendEmailToOrg(n.orgId, n.title, n.body ?? "", n.href);
  } else {
    note = { id: newId("ntf"), orgId: n.orgId, userId: n.userId, kind: n.kind, title: n.title, body: n.body, href: n.href, bundleKey: n.bundleKey, count: n.count, readBy: [], createdAt: now, updatedAt: now };
    data.notifications.push(note);
    if (n.email) sendEmailToOrg(n.orgId, n.title, n.body ?? "", n.href);
  }
  return note;
}

export function clearBundle(bundleKey: string): void {
  const data = db();
  data.notifications = data.notifications.filter((n) => n.bundleKey !== bundleKey);
}

export function sendEmail(to: string, subject: string, body: string, orgId?: ID): void {
  db().outbox.push({ id: newId("eml"), orgId, to, subject, body, createdAt: new Date().toISOString(), status: "delivered_dev" });
}

function sendEmailToOrg(orgId: ID | undefined, subject: string, body: string, href?: string): void {
  if (!orgId) return;
  const data = db();
  for (const m of data.memberships.filter((x) => x.orgId === orgId && x.role !== "external_accountant")) {
    const u = data.users.find((x) => x.id === m.userId);
    if (!u?.notificationPrefs.email || u.notificationPrefs.digest !== "realtime") continue;
    sendEmail(u.email, subject, `${body}\n\nOpen Fabrik: ${href ?? "/"}`, orgId);
  }
}

export function notificationsFor(ctx: Ctx): (Notification & { read: boolean })[] {
  const data = db();
  return data.notifications
    .filter((n) => (n.orgId === ctx.org.id || (!n.orgId && ctx.isStaff)) && (!n.userId || n.userId === ctx.user.id))
    .filter((n) => ctx.isStaff || n.kind !== "ops")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 30)
    .map((n) => ({ ...n, read: n.readBy.includes(ctx.user.id) }));
}

export function markRead(ctx: Ctx, ids: ID[] | "all"): void {
  for (const n of notificationsFor(ctx)) {
    if (ids !== "all" && !ids.includes(n.id)) continue;
    const real = db().notifications.find((x) => x.id === n.id)!;
    if (!real.readBy.includes(ctx.user.id)) real.readBy.push(ctx.user.id);
  }
}

/** Keeps the single "Fabrik needs your help" bundle in sync with the open inbox. */
export function refreshInboxNotification(orgId: ID, email = false): void {
  const open = db().inbox.filter((i) => i.orgId === orgId && i.status === "open");
  const key = `inbox:${orgId}`;
  if (!open.length) return clearBundle(key);
  const labels: Record<string, [string, string]> = {
    transaction_clarification: ["transaction", "transactions"],
    missing_document: ["missing document", "missing documents"],
    missing_receipt: ["missing receipt", "missing receipts"],
    bill_approval: ["bill approval", "bill approvals"],
    overdue_invoice: ["overdue invoice", "overdue invoices"],
    funding_info_request: ["funding question", "funding questions"],
  };
  const counts = new Map<string, number>();
  for (const i of open) counts.set(i.type, (counts.get(i.type) ?? 0) + 1);
  const body = [...counts.entries()].map(([t, n]) => `${n} ${labels[t]?.[n === 1 ? 0 : 1] ?? (n === 1 ? "question" : "questions")}`).join(", ");
  upsertBundle({ orgId, kind: "inbox", title: `Fabrik needs your help with ${open.length} item${open.length === 1 ? "" : "s"}`, body: `${body}.`, href: "/inbox", bundleKey: key, count: open.length, email });
}
