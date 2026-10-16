import type { AuditEvent, DB, ID, ISODate, Split, Transaction } from "@/lib/types";
import { buildHistory, categorize, recordHistory, type CategorizeContext } from "@/server/engines/categorization";
import { DEFAULT_RISK_RULES } from "@/server/engines/risk";
import { sid } from "./random";

export interface Truth {
  accountId?: ID;
  splits?: Split[];
}

export interface ProcessOptions {
  orgId: ID;
  /** Transactions on/after this date are still "live" (not yet finalized by a human). */
  liveFrom: ISODate;
  /** Audit events are written for finalized transactions on/after this date. */
  auditFrom: ISODate;
  bookkeeperId: ID;
  bookkeeperName: string;
  rngSeconds: () => number;
  /** Categorization history imported from the ledger before the seeded window (not stored as transactions). */
  priorHistory?: { vendorId: ID; accountId: ID; count: number; amounts: number[] }[];
}

/**
 * Runs every seeded transaction through the real categorizer in date order, so the AI suggestions,
 * confidence scores and automation rate in the demo are genuinely produced by the engine (with
 * history accumulating over time), rather than hand-written.
 */
export function processTransactions(db: DB, truth: Map<ID, Truth>, opts: ProcessOptions): void {
  const txns = db.transactions.filter((t) => t.orgId === opts.orgId).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const ctx: CategorizeContext = {
    org: db.organizations.find((o) => o.id === opts.orgId)!,
    accounts: db.glAccounts.filter((a) => a.orgId === opts.orgId),
    vendors: db.vendors.filter((v) => v.orgId === opts.orgId),
    rules: db.rules.filter((r) => r.orgId === opts.orgId),
    riskRules: DEFAULT_RISK_RULES,
    history: buildHistory([]),
    recent: [],
    documents: [],
  };
  const accountName = new Map(ctx.accounts.map((a) => [a.id, a.name]));
  for (const h of opts.priorHistory ?? []) for (let i = 0; i < h.count; i++) recordHistory(ctx.history, h.vendorId, h.accountId, h.amounts[i % h.amounts.length]!);

  for (const t of txns) {
    const out = categorize(t, ctx);
    t.vendorId = out.vendor?.id;
    t.ai = out.suggestion;
    t.risk = out.risk;
    t.type = out.suggestion.transactionType;
    const tr = truth.get(t.id) ?? {};
    const live = t.date >= opts.liveFrom;

    if (!live) {
      if (tr.splits) t.splits = tr.splits;
      t.accountId = tr.splits ? undefined : (tr.accountId ?? out.suggestion.accountId);
      if (out.suggestion.decision === "auto" && !tr.splits && t.accountId === out.suggestion.accountId) {
        t.status = "processed";
      } else {
        t.status = "approved";
        t.reviewedBy = opts.bookkeeperId;
        t.reviewedAt = `${t.date}T15:${String(10 + (t.id.charCodeAt(t.id.length - 1) % 40)).padStart(2, "0")}:00.000Z`;
      }
    } else if (out.suggestion.decision === "auto") {
      t.status = "processed";
      t.accountId = out.suggestion.accountId;
    } else {
      t.status = "needs_review";
      t.accountId = undefined;
    }

    if (t.vendorId && (t.accountId || t.splits?.length)) {
      const histAccount = t.accountId ?? t.splits!.reduce((a, b) => (Math.abs(b.amount) > Math.abs(a.amount) ? b : a)).accountId;
      recordHistory(ctx.history, t.vendorId, histAccount, t.amount);
    }
    ctx.recent.push(t);
    if (ctx.recent.length > 250) ctx.recent.shift();

    if (t.date >= opts.auditFrom) writeAudit(db, t, opts, accountName);
  }
}

function writeAudit(db: DB, t: Transaction, opts: ProcessOptions, accountName: Map<ID, string>): void {
  const ai = t.ai!;
  const suggested = accountName.get(ai.accountId) ?? "Uncategorized";
  const base = { orgId: t.orgId, entity: { type: "transaction", id: t.id, label: `${ai.normalizedVendor} · ${(Math.abs(t.amount) / 100).toFixed(2)}` } };
  const aiEvent: AuditEvent = {
    id: sid("aud"),
    at: ai.generatedAt,
    actor: { type: "ai", id: ai.model, name: "Fabrik AI" },
    action: "ai.categorization_suggested",
    ...base,
    after: { account: suggested, decision: ai.decision },
    ai: { recommendation: suggested, confidence: ai.confidence, model: ai.model, modelVersion: ai.modelVersion },
    risk: t.risk?.reasons.length ? { level: t.risk.level, reasons: t.risk.reasons.map((r) => r.label) } : undefined,
  };
  db.audit.push(aiEvent);
  if (t.status === "processed") {
    db.audit.push({ id: sid("aud"), at: ai.generatedAt.replace("06:00", "06:01"), actor: { type: "system", id: "auto-processor", name: "Fabrik automation" }, action: "transaction.auto_processed", ...base, after: { account: suggested, status: "processed" } });
  } else if (t.status === "approved" && t.reviewedAt) {
    const final = t.splits?.length ? "Split: " + t.splits.map((s) => accountName.get(s.accountId)).join(" / ") : (accountName.get(t.accountId!) ?? "");
    const changed = final !== suggested;
    if (changed) {
      db.audit.push({ id: sid("aud"), at: t.reviewedAt, actor: { type: "user", id: opts.bookkeeperId, name: opts.bookkeeperName, role: "fabrik_bookkeeper" }, action: "transaction.category_changed", ...base, before: { account: suggested }, after: { account: final }, humanSeconds: 40 + opts.rngSeconds() });
    }
    db.audit.push({ id: sid("aud"), at: t.reviewedAt.replace(/:00\.000Z$/, ":30.000Z"), actor: { type: "user", id: opts.bookkeeperId, name: opts.bookkeeperName, role: "fabrik_bookkeeper" }, action: "transaction.approved", ...base, after: { account: final, status: "approved" }, humanSeconds: changed ? 8 : 12 + opts.rngSeconds() / 2 });
  }
}
