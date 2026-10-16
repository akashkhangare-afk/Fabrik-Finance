import "server-only";
import type { IntegrationProvider, SyncRun } from "@/lib/types";
import { commit, db } from "@/server/db/store";
import { accountingProvider } from "@/server/integrations/accounting";
import { qboConfigured } from "@/server/integrations/accounting/qbo-live";
import { recordAudit } from "./audit";
import { clearBundle, upsertBundle } from "./notifications";
import type { Ctx } from "@/server/auth/session";
import { NotFoundError } from "./transactions";

export interface CatalogEntry {
  provider: IntegrationProvider;
  name: string;
  category: string;
  description: string;
  classification: "A" | "C";
  phase: string;
  dataUse: string;
}

/** MVP: QuickBooks Online only (PRD §21). Others are listed as roadmap items, clearly classified. */
export const CATALOG: CatalogEntry[] = [
  { provider: "quickbooks_online", name: "QuickBooks Online", category: "Accounting / general ledger", description: "System of record. Imports chart of accounts, transactions, vendors, customers, invoices, bills, journal entries and reports; approved categorizations are written back.", classification: "A", phase: "MVP", dataUse: "Books, reports, forecasting, funding profile" },
  { provider: "mercury", name: "Mercury", category: "Business banking", description: "Direct bank transactions for faster reconciliation.", classification: "C", phase: "Phase 2 (proposed)", dataUse: "Reconciliation, cash position" },
  { provider: "plaid", name: "Plaid", category: "Bank connectivity", description: "Long-tail bank and farm-credit connectivity.", classification: "C", phase: "Phase 2 (proposed)", dataUse: "Reconciliation, cash position" },
  { provider: "ramp", name: "Ramp", category: "Cards & expenses", description: "Card transactions with receipts and memos.", classification: "C", phase: "Phase 2 (proposed)", dataUse: "Categorization, receipts, close" },
  { provider: "gusto", name: "Gusto", category: "Payroll", description: "Payroll journals, taxes and employee counts.", classification: "C", phase: "Phase 2 (proposed)", dataUse: "Payroll accounting, forecast, tax" },
  { provider: "stripe", name: "Stripe", category: "Payments & revenue", description: "Payouts, fees and refunds.", classification: "C", phase: "Phase 2 (proposed)", dataUse: "Revenue recognition, reconciliation" },
  { provider: "xero", name: "Xero", category: "Accounting / general ledger", description: "Alternative ledger. Explicitly out of scope for the Expo MVP.", classification: "C", phase: "Future", dataUse: "Books, reports" },
];

export function integrationOverview(ctx: Ctx) {
  const data = db();
  const conns = data.connections.filter((c) => c.orgId === ctx.org.id);
  const runs = data.syncRuns.filter((r) => r.orgId === ctx.org.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 25);
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const last30 = data.syncRuns.filter((r) => r.orgId === ctx.org.id && r.startedAt.slice(0, 10) >= since);
  const successRate = last30.length ? last30.filter((r) => r.status === "success").length / last30.length : 1;
  const pendingWriteback = data.transactions.filter((t) => t.orgId === ctx.org.id && t.syncState === "pending_writeback").length;
  return { catalog: CATALOG, connections: conns, runs, successRate, pendingWriteback, liveConfigured: qboConfigured() };
}

/** Runs a sync with an idempotency key; retryable failures are retried with exponential backoff. */
export async function runSync(ctx: Ctx, trigger: SyncRun["trigger"] = "manual") {
  const data = db();
  const conn = data.connections.find((c) => c.orgId === ctx.org.id && c.provider === "quickbooks_online");
  if (!conn) throw new NotFoundError("QuickBooks is not connected");
  const provider = accountingProvider(ctx.org.id);
  const minute = new Date().toISOString().slice(0, 16);
  const key = `qbo:${ctx.org.id}:${minute}:${trigger}`;
  let run: SyncRun | undefined;
  for (let attempt = 1; attempt <= 3; attempt++) {
    run = await provider.sync(ctx.org.id, { trigger: attempt === 1 ? trigger : "retry", idempotencyKey: key, attempt });
    if (!data.syncRuns.some((r) => r.id === run!.id)) data.syncRuns.push(run);
    if (run.status !== "failed" || !run.error?.retryable || conn.simulateFailure) break;
    await new Promise((r) => setTimeout(r, 200 * 2 ** attempt));
  }
  conn.lastSyncAt = run!.finishedAt ?? new Date().toISOString();
  conn.lastSyncStatus = run!.status === "running" ? "success" : (run!.status as "success" | "partial" | "failed");
  conn.status = run!.status === "failed" ? "error" : "connected";
  const bundle = `integration:${ctx.org.id}:qbo`;
  if (run!.status === "failed") upsertBundle({ orgId: ctx.org.id, kind: "integration", title: "Your QuickBooks connection needs attention", body: run!.error?.message, href: "/integrations", bundleKey: bundle, count: 1, email: true });
  else clearBundle(bundle);
  recordAudit(ctx, { orgId: ctx.org.id, action: `integration.sync_${run!.status}`, entity: { type: "integration", id: conn.id, label: "QuickBooks Online" }, after: { trigger, attempts: run!.attempt, idempotencyKey: key, error: run!.error?.message } });
  commit();
  return run!;
}

export function setSimulatedFailure(ctx: Ctx, on: boolean) {
  const conn = db().connections.find((c) => c.orgId === ctx.org.id && c.provider === "quickbooks_online");
  if (!conn) throw new NotFoundError("QuickBooks is not connected");
  conn.simulateFailure = on;
  recordAudit(ctx, { orgId: ctx.org.id, action: "integration.demo_failure_toggled", entity: { type: "integration", id: conn.id, label: "QuickBooks Online" }, after: { simulateFailure: on } });
  commit();
}

export function disconnect(ctx: Ctx) {
  const conn = db().connections.find((c) => c.orgId === ctx.org.id && c.provider === "quickbooks_online");
  if (!conn) throw new NotFoundError("QuickBooks is not connected");
  conn.status = "disconnected";
  conn.tokensEnc = undefined;
  recordAudit(ctx, { orgId: ctx.org.id, action: "integration.disconnected", entity: { type: "integration", id: conn.id, label: "QuickBooks Online" } });
  commit();
}

export function reconnectSandbox(ctx: Ctx) {
  const conn = db().connections.find((c) => c.orgId === ctx.org.id && c.provider === "quickbooks_online");
  if (!conn) throw new NotFoundError("QuickBooks is not connected");
  conn.status = "connected";
  conn.simulateFailure = false;
  conn.connectedAt = new Date().toISOString();
  conn.connectedBy = ctx.user.id;
  recordAudit(ctx, { orgId: ctx.org.id, action: "integration.connected", entity: { type: "integration", id: conn.id, label: "QuickBooks Online (synthetic sandbox)" } });
  commit();
}
