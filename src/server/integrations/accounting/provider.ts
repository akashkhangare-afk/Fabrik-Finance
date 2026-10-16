import type { ID, ISODate, SyncRun, Transaction } from "@/lib/types";
import type { FinancialReport, ReportColumn } from "@/server/engines/ledger";

/**
 * Accounting system of record boundary. QuickBooks Online is the only MVP ledger; the product
 * layer depends on this interface, never on QBO payload shapes, so Xero/NetSuite/Sage can be added
 * as further adapters later.
 */
export interface AccountingProvider {
  readonly key: "quickbooks_online";
  readonly label: string;
  readonly mode: "live" | "sandbox_synthetic";
  profitAndLoss(orgId: ID, columns: ReportColumn[], opts?: { includeTotal?: boolean }): Promise<FinancialReport>;
  balanceSheet(orgId: ID, asOf: ISODate): Promise<FinancialReport>;
  cashFlow(orgId: ID, from: ISODate, to: ISODate): Promise<FinancialReport>;
  /** Pulls accounts, transactions, vendors, customers, invoices, bills and journal entries. Idempotent per key. */
  sync(orgId: ID, opts: { trigger: SyncRun["trigger"]; idempotencyKey: string; attempt: number }): Promise<SyncRun>;
  /** Writes an approved categorization back to the ledger. Idempotent per transaction version. */
  writeBack(txn: Transaction): Promise<{ ok: true; externalId: string } | { ok: false; error: string; retryable: boolean }>;
}
