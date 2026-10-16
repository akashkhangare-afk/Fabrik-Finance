import "server-only";
import type { ID, Organization, WorkItem } from "@/lib/types";
import { commit, db } from "@/server/db/store";
import { newId } from "@/server/db/ids";
import { addDays, addMonths, diffDays, monthName, periodOf, today } from "@/lib/dates";
import { bookItems, summarize } from "@/server/engines/reconciliation";
import { closeStatus, ensureClosePeriods, periodRange } from "./close";
import { accessibleOrgs, type Ctx } from "@/server/auth/session";
import { recordAudit } from "./audit";
import { money } from "@/lib/format";
import { NotFoundError } from "./transactions";

export type Health = "current" | "needs_attention" | "at_risk";

function businessDaysBetween(from: string, to: string): number {
  let n = 0;
  for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) n++;
  }
  return n;
}

function recDiffs(orgId: ID, period: string) {
  const data = db();
  const { from, to } = periodRange(period);
  const txns = data.transactions.filter((t) => t.orgId === orgId);
  return data.reconciliations
    .filter((r) => r.orgId === orgId && r.period === period)
    .map((r) => {
      const bank = data.bankAccounts.find((b) => b.id === r.bankAccountId)!;
      return { rec: r, bank, s: summarize(r, bookItems(bank, txns, from, to)) };
    });
}

export function clientHealth(org: Organization) {
  const data = db();
  const prev = addMonths(periodOf(today()), -1);
  ensureClosePeriods(org);
  const cp = data.closePeriods.find((c) => c.orgId === org.id && c.period === prev) ?? data.closePeriods.filter((c) => c.orgId === org.id).sort((a, b) => b.period.localeCompare(a.period))[1];
  const status = cp ? closeStatus(org.id, cp) : undefined;
  const conn = data.connections.find((c) => c.orgId === org.id && c.provider === "quickbooks_online");
  const recs = recDiffs(org.id, prev);
  const bigDiff = recs.some((r) => r.rec.status !== "approved" && Math.abs(r.s.difference) > 5_000_00);
  const late = cp && cp.status !== "closed" ? Math.max(0, diffDays(today(), cp.targetCloseDate)) : 0;
  const reasons: string[] = [];
  if (org.catchUp) reasons.push(`Catch-up: ${org.catchUp.monthsBehind} months behind`);
  if (bigDiff) reasons.push("Reconciliation difference over $5,000");
  if (late > 5) reasons.push(`Close ${late} days past target`);
  if (conn?.status === "error") reasons.push("QuickBooks connection error");
  let health: Health = "current";
  if (org.catchUp || bigDiff || late > 5) health = "at_risk";
  else if (cp?.status !== "closed" || conn?.status === "error") health = "needs_attention";
  return { health, reasons, close: cp, closeStatus: status, connection: conn };
}

export function opsDashboard(ctx: Ctx) {
  const data = db();
  const orgs = accessibleOrgs(ctx.user).filter((o) => o.status === "active");
  const ids = new Set(orgs.map((o) => o.id));
  const since = addDays(today(), -30);
  const txns = data.transactions.filter((t) => ids.has(t.orgId) && t.date >= since);
  const aiProcessed = txns.filter((t) => t.status === "processed").length;
  const humanReviewed = txns.filter((t) => t.status === "approved").length;
  const pending = txns.filter((t) => t.status === "needs_review" || t.status === "waiting_for_client").length;
  const clientQuestions = data.inbox.filter((i) => ids.has(i.orgId) && i.type === "transaction_clarification" && i.createdAt.slice(0, 10) >= since).length;
  const decided = aiProcessed + humanReviewed + pending;
  const audit30 = data.audit.filter((a) => a.orgId && ids.has(a.orgId) && a.at.slice(0, 10) >= since && a.humanSeconds);
  const humanMinutes = audit30.reduce((s, a) => s + (a.humanSeconds ?? 0), 0) / 60;
  const health = orgs.map((o) => ({ org: o, ...clientHealth(o) }));
  const docsExtracted = data.documents.filter((d) => ids.has(d.orgId) && d.extraction && d.extraction.provider !== "manual").length;
  const docsCorrected = new Set(data.audit.filter((a) => a.action === "document.fields_corrected" && a.orgId && ids.has(a.orgId)).map((a) => a.entity.id)).size;
  const recs = data.reconciliations.filter((r) => ids.has(r.orgId) && r.period >= addMonths(periodOf(today()), -2));
  const syncs = data.syncRuns.filter((r) => ids.has(r.orgId) && r.startedAt.slice(0, 10) >= since);
  const closed = data.closePeriods.filter((c) => ids.has(c.orgId) && c.status === "closed" && c.closedAt && /^\d{4}-\d{2}$/.test(c.period) && c.period >= addMonths(periodOf(today()), -3));
  const closeDays = closed.length ? closed.reduce((s, c) => s + businessDaysBetween(periodRange(c.period).to, c.closedAt!.slice(0, 10)), 0) / closed.length : 0;
  const perClient = health.map((h) => {
    const t = txns.filter((x) => x.orgId === h.org.id);
    const minutes = audit30.filter((a) => a.orgId === h.org.id).reduce((s, a) => s + (a.humanSeconds ?? 0), 0) / 60;
    const auto = t.filter((x) => x.status === "processed").length;
    return {
      org: h.org,
      health: h.health,
      reasons: h.reasons,
      closePeriod: h.close?.period,
      closePct: h.closeStatus?.pct ?? 0,
      closeState: h.close?.status,
      review: data.transactions.filter((x) => x.orgId === h.org.id && x.status === "needs_review").length,
      questions: data.inbox.filter((i) => i.orgId === h.org.id && i.status === "open").length,
      automation: t.length ? auto / t.length : 0,
      minutes,
      per100: t.length ? (minutes / t.length) * 100 : 0,
      bookkeeper: data.users.find((u) => u.id === h.org.assignedBookkeeperId)?.name,
      reviewer: data.users.find((u) => u.id === h.org.assignedReviewerId)?.name,
      volume: t.length,
    };
  });
  const automationRate = decided ? aiProcessed / decided : 0;
  return {
    activeClients: orgs.length,
    booksCurrent: health.filter((h) => h.health === "current").length,
    needsAttention: health.filter((h) => h.health === "needs_attention").length,
    atRisk: health.filter((h) => h.health === "at_risk").length,
    aiProcessed,
    humanReviewed,
    clientQuestions,
    automationRate,
    humanMinutesPerClient: orgs.length ? humanMinutes / orgs.length : 0,
    humanMinutesPer100: txns.length ? (humanMinutes / txns.length) * 100 : 0,
    metrics: [
      { key: "automation", label: "AI transaction automation", value: automationRate, target: "> 80%", ok: automationRate > 0.8, format: "pct" as const },
      { key: "human", label: "Human-reviewed transactions", value: decided ? humanReviewed / decided : 0, target: "< 20%", ok: decided ? humanReviewed / decided < 0.2 : true, format: "pct" as const },
      { key: "clarify", label: "Client clarification", value: decided ? clientQuestions / decided : 0, target: "< 5%", ok: decided ? clientQuestions / decided < 0.05 : true, format: "pct" as const },
      { key: "extraction", label: "Document extraction accuracy", value: docsExtracted ? 1 - docsCorrected / docsExtracted : 1, target: "> 95%", ok: docsExtracted ? 1 - docsCorrected / docsExtracted > 0.95 : true, format: "pct" as const },
      { key: "recon", label: "Reconciliation success", value: recs.length ? recs.filter((r) => r.status === "approved").length / recs.length : 1, target: "> 90%", ok: recs.length ? recs.filter((r) => r.status === "approved").length / recs.length > 0.9 : true, format: "pct" as const },
      { key: "close", label: "Monthly close", value: closeDays, target: "< 10 business days", ok: closeDays < 10, format: "days" as const },
      { key: "sync", label: "QBO sync success", value: syncs.length ? syncs.filter((s) => s.status === "success").length / syncs.length : 1, target: "> 99%", ok: syncs.length ? syncs.filter((s) => s.status === "success").length / syncs.length > 0.99 : true, format: "pct" as const },
    ],
    perClient: perClient.sort((a, b) => ({ at_risk: 0, needs_attention: 1, current: 2 })[a.health] - ({ at_risk: 0, needs_attention: 1, current: 2 })[b.health] || b.review - a.review),
    trend: minutesTrend(ids),
  };
}

function minutesTrend(ids: Set<ID>) {
  const data = db();
  const cur = periodOf(today());
  return [-2, -1, 0].map((o) => {
    const p = addMonths(cur, o);
    const secs = data.audit.filter((a) => a.orgId && ids.has(a.orgId) && a.at.startsWith(p) && a.humanSeconds).reduce((s, a) => s + (a.humanSeconds ?? 0), 0);
    return { period: p, label: monthName(p), minutesPerClient: secs / 60 / Math.max(1, ids.size) };
  });
}

/** Generates the global work queue from live state (PRD §17: staff shouldn't hunt client by client). */
export function syncWorkQueue(ctx: Ctx): WorkItem[] {
  const data = db();
  const orgs = accessibleOrgs(ctx.user);
  const nowIso = new Date().toISOString();
  const prev = addMonths(periodOf(today()), -1);
  const seen = new Set<string>();
  const upsert = (w: Omit<WorkItem, "id" | "status" | "createdAt" | "auto"> & { createdAt: string }) => {
    seen.add(w.key);
    const existing = data.workItems.find((x) => x.key === w.key);
    if (existing) {
      Object.assign(existing, { title: w.title, priority: w.priority, count: w.count, href: w.href });
      if (existing.status === "done") existing.status = "open";
    } else data.workItems.push({ ...w, id: newId("wrk"), status: "open", auto: true, assigneeId: w.assigneeId });
  };
  for (const org of orgs) {
    const review = data.transactions.filter((t) => t.orgId === org.id && t.status === "needs_review");
    if (review.length) {
      const oldest = review.reduce((m, t) => (t.date < m ? t.date : m), review[0]!.date);
      const age = diffDays(today(), oldest);
      upsert({ key: `review:${org.id}`, orgId: org.id, type: "review_transactions", title: `${review.length} transaction${review.length === 1 ? "" : "s"} to review`, priority: review.length >= 20 || age > 5 ? "high" : review.length >= 5 ? "medium" : "low", assigneeId: org.assignedBookkeeperId, period: periodOf(today()), count: review.length, createdAt: `${oldest}T12:00:00.000Z`, href: `/ops/review?org=${org.id}` });
    }
    for (const r of recDiffs(org.id, prev)) {
      if (r.rec.status === "approved") continue;
      if (r.rec.status === "not_started") {
        upsert({ key: `stmt:${r.rec.id}`, orgId: org.id, type: "missing_statement", title: `Missing statement — ${r.bank.name} ••••${r.bank.mask} (${monthName(prev)})`, priority: "medium", assigneeId: org.assignedBookkeeperId, period: prev, createdAt: `${addDays(periodRange(prev).to, 3)}T12:00:00.000Z`, href: `/reconciliation?period=${prev}` });
      } else if (r.s.difference !== 0 || !r.s.canApprove) {
        const big = Math.abs(r.s.difference) > 5_000_00;
        upsert({ key: `recdiff:${r.rec.id}`, orgId: org.id, type: "reconciliation_difference", title: r.s.difference ? `Reconciliation difference ${money(r.s.difference, { decimals: true })} — ${r.bank.name} ••••${r.bank.mask}` : `Reconciliation ready to finish — ${r.bank.name} ••••${r.bank.mask}`, priority: big ? "critical" : "high", assigneeId: org.assignedBookkeeperId, period: prev, createdAt: `${addDays(today(), big ? -2 : -1)}T09:00:00.000Z`, href: `/reconciliation/${r.rec.id}` });
      }
    }
    const stale = data.inbox.filter((i) => i.orgId === org.id && i.status === "open" && diffDays(today(), i.createdAt.slice(0, 10)) >= 3);
    if (stale.length) upsert({ key: `followup:${org.id}`, orgId: org.id, type: "client_question_followup", title: `Client hasn't answered ${stale.length} item${stale.length === 1 ? "" : "s"} (3+ days)`, priority: "low", assigneeId: org.assignedBookkeeperId, period: periodOf(today()), count: stale.length, createdAt: stale[0]!.createdAt, href: "/inbox" });
    for (const cp of data.closePeriods.filter((c) => c.orgId === org.id && c.status !== "closed" && periodRange(c.period).to < today())) {
      const s = closeStatus(org.id, cp);
      if (s.readyForApproval) upsert({ key: `close:${cp.id}`, orgId: org.id, type: "close_review", title: `${cp.period} close ready for reviewer approval`, priority: "high", assigneeId: org.assignedReviewerId, period: cp.period, createdAt: cp.manual.bookkeeper_review?.at ?? nowIso, href: `/close?period=${cp.period}` });
    }
    const conn = data.connections.find((c) => c.orgId === org.id && c.status === "error");
    if (conn) upsert({ key: `int:${conn.id}`, orgId: org.id, type: "integration_error", title: "QuickBooks connection error — client must reconnect", priority: "high", assigneeId: org.assignedBookkeeperId, period: periodOf(today()), createdAt: conn.lastSyncAt ?? nowIso, href: "/integrations" });
    if (org.catchUp) upsert({ key: `catchup:${org.id}`, orgId: org.id, type: "catch_up", title: `Catch-up bookkeeping — ${monthName(org.catchUp.fromPeriod)}–${monthName(org.catchUp.toPeriod)} (${org.catchUp.monthsBehind} months)`, priority: "medium", assigneeId: org.assignedBookkeeperId, period: org.catchUp.toPeriod, createdAt: org.catchUp.startedAt ?? nowIso, href: "/close" });
    const docs = data.documents.filter((d) => d.orgId === org.id && d.status === "needs_review");
    if (docs.length) upsert({ key: `docs:${org.id}`, orgId: org.id, type: "document_review", title: `${docs.length} document${docs.length === 1 ? "" : "s"} need field review`, priority: "low", assigneeId: org.assignedBookkeeperId, period: periodOf(today()), count: docs.length, createdAt: docs[0]!.uploadedAt, href: "/documents" });
  }
  const orgIds = new Set(orgs.map((o) => o.id));
  for (const w of data.workItems) if (w.auto && orgIds.has(w.orgId) && !seen.has(w.key) && w.status !== "done") w.status = "done";
  commit();
  return data.workItems.filter((w) => orgIds.has(w.orgId));
}

export function updateWorkItem(ctx: Ctx, id: ID, patch: { status?: WorkItem["status"]; assigneeId?: ID }) {
  const w = db().workItems.find((x) => x.id === id);
  if (!w || !accessibleOrgs(ctx.user).some((o) => o.id === w.orgId)) throw new NotFoundError("Work item not found");
  const before = { status: w.status, assignee: w.assigneeId };
  Object.assign(w, patch);
  recordAudit(ctx, { orgId: w.orgId, action: "ops.work_item_updated", entity: { type: "work_item", id: w.id, label: w.title }, before, after: patch });
  commit();
  return w;
}
