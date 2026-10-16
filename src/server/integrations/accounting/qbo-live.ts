import "server-only";
import type { ID, ISODate, SyncRun, Transaction } from "@/lib/types";
import { db } from "@/server/db/store";
import { decrypt, encrypt } from "@/server/auth/crypto";
import type { FinancialReport, ReportColumn, ReportLine } from "@/server/engines/ledger";
import type { AccountingProvider } from "./provider";

/**
 * QuickBooks Online — live adapter (OAuth 2.0 + Accounting API v3).
 *
 * Implemented against Intuit's documented endpoints but not exercised against a live sandbox in
 * this build (no credentials). Enable by setting QBO_CLIENT_ID / QBO_CLIENT_SECRET / QBO_REDIRECT_URI.
 * Tokens are stored encrypted (AES-256-GCM) on the connection record — never in logs or the client.
 */

const AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const SCOPE = "com.intuit.quickbooks.accounting";

function apiBase(): string {
  return process.env.QBO_ENVIRONMENT === "production" ? "https://quickbooks.api.intuit.com" : "https://sandbox-quickbooks.api.intuit.com";
}

export function qboConfigured(): boolean {
  return Boolean(process.env.QBO_CLIENT_ID && process.env.QBO_CLIENT_SECRET && process.env.QBO_REDIRECT_URI);
}

export function authorizeUrl(state: string): string {
  const p = new URLSearchParams({ client_id: process.env.QBO_CLIENT_ID!, response_type: "code", scope: SCOPE, redirect_uri: process.env.QBO_REDIRECT_URI!, state });
  return `${AUTH_URL}?${p}`;
}

interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

async function tokenRequest(body: Record<string, string>): Promise<Tokens> {
  const basic = Buffer.from(`${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(body),
  });
  if (!res.ok) throw new Error(`QBO token endpoint returned ${res.status}`);
  const json = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  return { access_token: json.access_token, refresh_token: json.refresh_token, expires_at: Date.now() + json.expires_in * 1000 };
}

export async function exchangeCode(code: string): Promise<string> {
  return encrypt(JSON.stringify(await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: process.env.QBO_REDIRECT_URI! })));
}

async function accessToken(orgId: ID): Promise<{ token: string; realmId: string }> {
  const conn = db().connections.find((c) => c.orgId === orgId && c.provider === "quickbooks_online" && c.mode === "live");
  if (!conn?.tokensEnc || !conn.realmId) throw new Error("QuickBooks is not connected");
  let tokens = JSON.parse(decrypt(conn.tokensEnc)) as Tokens;
  if (tokens.expires_at - Date.now() < 60_000) {
    tokens = await tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refresh_token });
    conn.tokensEnc = encrypt(JSON.stringify(tokens));
  }
  return { token: tokens.access_token, realmId: conn.realmId };
}

async function qbo<T>(orgId: ID, path: string, init?: RequestInit): Promise<T> {
  const { token, realmId } = await accessToken(orgId);
  const res = await fetch(`${apiBase()}/v3/company/${realmId}${path}${path.includes("?") ? "&" : "?"}minorversion=75`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 429 || res.status >= 500) throw Object.assign(new Error(`QBO ${res.status}`), { retryable: true });
  if (!res.ok) throw Object.assign(new Error(`QBO ${res.status}: ${await res.text()}`), { retryable: false });
  return (await res.json()) as T;
}

interface QboReportRow {
  ColData?: { value: string }[];
  Header?: { ColData: { value: string }[] };
  Summary?: { ColData: { value: string }[] };
  Rows?: { Row: QboReportRow[] };
  type?: string;
}

/** Maps a QBO Reports API payload (nested Rows/Header/Summary) to Fabrik's provider-neutral report model. */
export function mapQboReport(kind: FinancialReport["kind"], title: string, payload: { Columns: { Column: { ColTitle: string }[] }; Rows: { Row: QboReportRow[] } }): FinancialReport {
  const lines: ReportLine[] = [];
  const cents = (v?: string) => (v ? Math.round(parseFloat(v) * 100) : 0);
  const walk = (rows: QboReportRow[], depth: number) => {
    rows.forEach((r, i) => {
      if (r.Header) lines.push({ id: `h${depth}-${lines.length}-${i}`, label: r.Header.ColData[0]?.value ?? "", values: [], kind: "header", depth });
      if (r.Rows) walk(r.Rows.Row, depth + 1);
      if (r.ColData) lines.push({ id: `a${depth}-${lines.length}`, label: r.ColData[0]?.value ?? "", values: r.ColData.slice(1).map((c) => cents(c.value)), kind: "account", depth: depth + 1 });
      if (r.Summary) lines.push({ id: `s${depth}-${lines.length}`, label: r.Summary.ColData[0]?.value ?? "", values: r.Summary.ColData.slice(1).map((c) => cents(c.value)), kind: depth === 0 ? "total" : "subtotal", depth });
    });
  };
  walk(payload.Rows.Row, 0);
  const columns = payload.Columns.Column.slice(1).map((c) => ({ label: c.ColTitle, from: "", to: "" }));
  return { kind, title, subtitle: "QuickBooks Online", basis: "accrual", columns, lines, checks: [] };
}

export class LiveQuickBooksProvider implements AccountingProvider {
  readonly key = "quickbooks_online" as const;
  readonly label = "QuickBooks Online";
  readonly mode = "live" as const;

  async profitAndLoss(orgId: ID, columns: ReportColumn[]) {
    const from = columns[0]!.from;
    const to = columns.at(-1)!.to;
    const summarize = columns.length > 1 ? "&summarize_column_by=Month" : "";
    return mapQboReport("pnl", "Profit & Loss", await qbo(orgId, `/reports/ProfitAndLoss?start_date=${from}&end_date=${to}${summarize}`));
  }

  async balanceSheet(orgId: ID, asOf: ISODate) {
    return mapQboReport("balance_sheet", "Balance Sheet", await qbo(orgId, `/reports/BalanceSheet?start_date=${asOf}&end_date=${asOf}`));
  }

  async cashFlow(orgId: ID, from: ISODate, to: ISODate) {
    return mapQboReport("cash_flow", "Statement of Cash Flows", await qbo(orgId, `/reports/CashFlow?start_date=${from}&end_date=${to}`));
  }

  async sync(orgId: ID, opts: { trigger: SyncRun["trigger"]; idempotencyKey: string; attempt: number }): Promise<SyncRun> {
    const run: SyncRun = { id: `sync_${Date.now()}`, orgId, connectionId: "", trigger: opts.trigger, idempotencyKey: opts.idempotencyKey, attempt: opts.attempt, startedAt: new Date().toISOString(), status: "running", entities: [] };
    try {
      for (const entity of ["Account", "Vendor", "Customer", "Invoice", "Bill", "Purchase", "Deposit", "JournalEntry"]) {
        const res = await qbo<{ QueryResponse: Record<string, unknown[]> }>(orgId, `/query?query=${encodeURIComponent(`select * from ${entity} maxresults 1000`)}`);
        const rows = res.QueryResponse[entity] ?? [];
        // Upsert by QBO Id (externalId) — mapping into Fabrik's model happens in the sync worker.
        run.entities.push({ entity, fetched: rows.length, created: 0, updated: 0, skipped: 0 });
      }
      run.status = "success";
    } catch (e) {
      run.status = "failed";
      run.error = { code: "QBO_ERROR", message: (e as Error).message, retryable: Boolean((e as { retryable?: boolean }).retryable) };
    }
    run.finishedAt = new Date().toISOString();
    return run;
  }

  async writeBack(txn: Transaction) {
    try {
      // Purchase/Deposit update with the approved AccountRef; Request-Id makes the call idempotent.
      await qbo(txn.orgId, `/purchase?operation=update`, {
        method: "POST",
        headers: { "Request-Id": `${txn.id}-v${txn.version}` },
        body: JSON.stringify({ Id: txn.externalId.replace(/^qbo-txn-/, ""), sparse: true, Line: [{ AccountBasedExpenseLineDetail: { AccountRef: { value: txn.accountId } }, Amount: Math.abs(txn.amount) / 100, DetailType: "AccountBasedExpenseLineDetail" }] }),
      });
      return { ok: true as const, externalId: txn.externalId };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message, retryable: Boolean((e as { retryable?: boolean }).retryable) };
    }
  }
}
