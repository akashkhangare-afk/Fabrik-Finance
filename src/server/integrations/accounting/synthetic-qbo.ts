import "server-only";
import type { ID, ISODate, SyncRun, Transaction } from "@/lib/types";
import { db } from "@/server/db/store";
import { newId } from "@/server/db/ids";
import { balanceSheet, cashFlowStatement, profitAndLoss, type LedgerData, type ReportColumn } from "@/server/engines/ledger";
import type { AccountingProvider } from "./provider";

export function ledgerDataFor(orgId: ID): LedgerData {
  const d = db();
  return {
    accounts: d.glAccounts.filter((a) => a.orgId === orgId),
    bankAccounts: d.bankAccounts.filter((b) => b.orgId === orgId),
    transactions: d.transactions.filter((t) => t.orgId === orgId),
    invoices: d.invoices.filter((i) => i.orgId === orgId),
    bills: d.bills.filter((b) => b.orgId === orgId),
    journalEntries: d.journalEntries.filter((j) => j.orgId === orgId),
  };
}

/**
 * QuickBooks Online — synthetic sandbox. Holds a mirrored ledger for the seeded demo companies and
 * serves reports the way QBO's Reports API would. Sync and write-back follow the same idempotency,
 * retry and error-logging rules as the live adapter so the integration UX is real.
 */
export class SyntheticQuickBooksProvider implements AccountingProvider {
  readonly key = "quickbooks_online" as const;
  readonly label = "QuickBooks Online (synthetic sandbox)";
  readonly mode = "sandbox_synthetic" as const;

  async profitAndLoss(orgId: ID, columns: ReportColumn[], opts?: { includeTotal?: boolean }) {
    return profitAndLoss(ledgerDataFor(orgId), columns, opts);
  }

  async balanceSheet(orgId: ID, asOf: ISODate) {
    const org = db().organizations.find((o) => o.id === orgId)!;
    const fyStart = `${asOf.slice(0, 4)}-${String(org.fiscalYearStartMonth).padStart(2, "0")}-01`;
    return balanceSheet(ledgerDataFor(orgId), asOf, fyStart <= asOf ? fyStart : `${Number(asOf.slice(0, 4)) - 1}${fyStart.slice(4)}`);
  }

  async cashFlow(orgId: ID, from: ISODate, to: ISODate) {
    return cashFlowStatement(ledgerDataFor(orgId), from, to);
  }

  async sync(orgId: ID, opts: { trigger: SyncRun["trigger"]; idempotencyKey: string; attempt: number }): Promise<SyncRun> {
    const data = db();
    const existing = data.syncRuns.find((r) => r.idempotencyKey === opts.idempotencyKey && r.attempt === opts.attempt);
    if (existing) return existing; // idempotent replay
    const conn = data.connections.find((c) => c.orgId === orgId && c.provider === "quickbooks_online")!;
    const started = new Date().toISOString();
    const run: SyncRun = { id: newId("sync"), orgId, connectionId: conn.id, trigger: opts.trigger, idempotencyKey: opts.idempotencyKey, attempt: opts.attempt, startedAt: started, status: "running", entities: [] };
    if (conn.simulateFailure) {
      run.status = "failed";
      run.finishedAt = new Date().toISOString();
      run.error = { code: "QBO_503", message: "QuickBooks Online returned HTTP 503 (service unavailable). Safe to retry.", retryable: true };
      return run;
    }
    // Every record carries its QBO id; re-syncing upserts by externalId, so nothing duplicates.
    const counts = (entity: string, n: number) => ({ entity, fetched: n, created: 0, updated: 0, skipped: n });
    run.entities = [
      counts("Account", data.glAccounts.filter((a) => a.orgId === orgId).length),
      counts("Transaction", data.transactions.filter((t) => t.orgId === orgId && t.date >= started.slice(0, 7)).length),
      counts("Vendor", data.vendors.filter((v) => v.orgId === orgId).length),
      counts("Customer", data.customers.filter((c) => c.orgId === orgId).length),
      counts("Invoice", data.invoices.filter((i) => i.orgId === orgId).length),
      counts("Bill", data.bills.filter((b) => b.orgId === orgId).length),
      counts("JournalEntry", data.journalEntries.filter((j) => j.orgId === orgId).length),
    ];
    const pending = data.transactions.filter((t) => t.orgId === orgId && t.syncState === "pending_writeback");
    if (pending.length) run.entities.push({ entity: "Write-back", fetched: pending.length, created: 0, updated: pending.length, skipped: 0 });
    for (const t of pending) t.syncState = "synced";
    run.status = "success";
    run.finishedAt = new Date().toISOString();
    return run;
  }

  async writeBack(txn: Transaction) {
    const conn = db().connections.find((c) => c.orgId === txn.orgId && c.provider === "quickbooks_online");
    if (!conn || conn.status !== "connected") return { ok: false as const, error: "QuickBooks is not connected", retryable: true };
    return { ok: true as const, externalId: txn.externalId };
  }
}
