import "server-only";
import type { SyncRun } from "@/lib/types";
import { commit, db } from "@/server/db/store";
import { accountingProvider } from "@/server/integrations/accounting";
import { recordAudit } from "./audit";
import { clearBundle, upsertBundle } from "./notifications";
import type { Ctx } from "@/server/auth/session";
import { NotFoundError } from "./transactions";

/** MVP: QuickBooks Online is the only accounting integration (PRD §21). */
export function integrationOverview(ctx: Ctx) {
  const data = db();
  const conns = data.connections.filter((c) => c.orgId === ctx.org.id);
  const runs = data.syncRuns.filter((r) => r.orgId === ctx.org.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 25);
  const pendingWriteback = data.transactions.filter((t) => t.orgId === ctx.org.id && t.syncState === "pending_writeback").length;
  return { connections: conns, runs, pendingWriteback };
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
