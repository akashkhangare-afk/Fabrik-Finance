import type { ReactNode } from "react";
import { Check, Database, FlaskConical, History, Lock, Plug, ShieldCheck } from "lucide-react";
import { requireCtx, hasPerm } from "@/server/auth/session";
import { integrationOverview } from "@/server/services/integrations";
import { db } from "@/server/db/store";
import { Badge, Card, CardHeader, ClassBadge, DescList, EmptyState, Notice, PageHeader, StatusPill, buttonClass } from "@/components/ui/primitives";
import { QboActions, SimulateFailureToggle } from "@/components/integrations/qbo-controls";
import { prettyDate, prettyDateTime } from "@/lib/dates";
import { count, pct } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata = { title: "Integrations" };

const SYNCS = ["Chart of accounts", "Accounts", "Bank transactions", "Vendors", "Customers", "Invoices", "Bills", "Journal entries", "Reports (P&L, balance sheet)"];
const RELIABILITY: [string, string][] = [
  ["Sync status", "Every run is recorded with its outcome and per-entity counts."],
  ["Retry with backoff", "Retryable provider errors are retried up to 3 times with exponential backoff."],
  ["Error logging", "Failures are logged with a code and message, and raise a needs-attention alert."],
  ["Duplicate prevention", "Records are upserted by QuickBooks externalId — re-syncs never create duplicates."],
  ["Idempotency keys", "Each run carries a key so a repeated request can't apply the same changes twice."],
];
const TRIGGER: Record<string, string> = { manual: "Manual", scheduled: "Scheduled", retry: "Retry", writeback: "Write-back", initial: "Initial import" };

export default async function IntegrationsPage() {
  const ctx = await requireCtx();
  if (!hasPerm(ctx, "integrations:read")) {
    return (
      <div className="max-w-[1100px]">
        <PageHeader title="Integrations" />
        <Card>
          <EmptyState icon={<Lock className="size-5" />} title="You don't have access to integrations" description="A Business Owner or your Fabrik team manages the QuickBooks connection." />
        </Card>
      </div>
    );
  }
  const o = integrationOverview(ctx);
  const canManage = hasPerm(ctx, "integrations:manage");
  const qbo = o.connections.find((c) => c.provider === "quickbooks_online");
  const qboEntry = o.catalog.find((c) => c.provider === "quickbooks_online");
  const others = o.catalog.filter((c) => c.provider !== "quickbooks_online");
  const connectedBy = qbo?.connectedBy ? db().users.find((u) => u.id === qbo.connectedBy)?.name : undefined;
  const lastRun = o.runs[0];

  return (
    <div className="max-w-[1100px] space-y-6">
      <PageHeader title="Integrations" description="QuickBooks Online is your system of record. Fabrik syncs from it, works on top of it, and writes approved categorizations back." />

      {/* QuickBooks hero */}
      <Card className="overflow-hidden">
        <div className="px-5 pt-5 pb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="size-11 rounded-xl bg-[#2ca01c] text-white flex items-center justify-center shrink-0 font-bold text-[15px]" aria-hidden>qb</div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-[17px] font-semibold">QuickBooks Online</h2>
                {qbo ? <StatusPill status={qbo.status} /> : <StatusPill status="disconnected" label="Not connected" />}
                {qbo && <Badge tone={qbo.mode === "live" ? "brand" : "ai"}>{qbo.mode === "live" ? "Live" : "Synthetic sandbox"}</Badge>}
                <ClassBadge cls="A" />
              </div>
              <p className="text-[13px] text-muted mt-1 max-w-xl">{qboEntry?.description}</p>
            </div>
          </div>
          {qbo && <QboActions status={qbo.status} canManage={canManage} />}
        </div>

        {qbo?.status === "error" && (
          <div className="px-5 pb-4">
            <Notice tone="crit" title="Your QuickBooks connection needs attention">
              {lastRun?.error?.message ?? "The last sync failed."} {canManage ? "Reconnect to resume syncing — nothing is lost." : "A Business Owner or your Fabrik team can reconnect it."}
            </Notice>
          </div>
        )}

        {qbo ? (
          <div className="grid gap-px bg-line border-t border-line sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Company", qbo.companyName ?? "—", qbo.realmId ? <span className="font-mono text-[11.5px]">Realm {qbo.realmId}</span> : null],
              ["Connected", qbo.connectedAt ? prettyDate(qbo.connectedAt.slice(0, 10), { year: true }) : "—", connectedBy ? `by ${connectedBy}` : null],
              ["Last sync", qbo.lastSyncAt ? `${prettyDateTime(qbo.lastSyncAt)} UTC` : "Never", qbo.lastSyncStatus ? <StatusPill status={qbo.lastSyncStatus} /> : null],
              ["Sync success rate", pct(o.successRate, 1), `${count(o.pendingWriteback)} pending write-back${o.pendingWriteback === 1 ? "" : "s"}`],
            ].map(([k, v, sub], i) => (
              <div key={i} className="bg-surface px-5 py-3.5 min-w-0">
                <div className="text-[12px] text-muted font-medium">{k}</div>
                <div className="text-[14.5px] font-semibold mt-0.5 truncate tabular">{v}</div>
                {sub && <div className="text-[12px] text-muted mt-1">{sub}</div>}
              </div>
            ))}
          </div>
        ) : (
          <div className="border-t border-line">
            <EmptyState icon={<Plug className="size-5" />} title="QuickBooks isn't connected" description="Connect QuickBooks Online to import your books. Fabrik needs it as the system of record." />
          </div>
        )}

        {!o.liveConfigured && (
          <div className="px-5 py-3 border-t border-line bg-surface-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[12.5px] text-muted">
              Live OAuth is ready — set <span className="font-mono text-[11.5px]">QBO_CLIENT_ID</span>/<span className="font-mono text-[11.5px]">SECRET</span>/<span className="font-mono text-[11.5px]">REDIRECT_URI</span> to connect a real QuickBooks company.
            </p>
            <a href="/api/v1/integrations/quickbooks/connect" aria-disabled="true" title="Live credentials aren't configured on this server" className={buttonClass("secondary", "sm", "opacity-55 shrink-0")}>
              Connect live QuickBooks
            </a>
          </div>
        )}
      </Card>

      {/* Demo controls */}
      {qbo && canManage && (
        <Card className="border-dashed">
          <CardHeader title="Demo controls" subtitle="For presenters — exercise the error and retry path without touching a real company." icon={<FlaskConical className="size-4" />} />
          <div className="px-5 pb-4">
            <SimulateFailureToggle on={Boolean(qbo.simulateFailure)} />
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="What syncs" subtitle="Imported from QuickBooks Online" icon={<Database className="size-4" />} />
          <ul className="px-5 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
            {SYNCS.map((s) => (
              <li key={s} className="flex items-center gap-2">
                <Check className="size-3.5 text-ok-600 shrink-0" aria-hidden /> {s}
              </li>
            ))}
          </ul>
          <div className="mx-5 mb-5 rounded-xl border border-line bg-surface-2 px-4 py-3 text-[13px]">
            <div className="font-medium">Write-back of approved categorizations</div>
            <div className="text-[12px] text-muted mt-0.5">Only approved changes are written back to QuickBooks. AI suggestions never write to your books on their own.</div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Reliability" subtitle="Built so your books stay consistent" icon={<ShieldCheck className="size-4" />} />
          <div className="px-5 pb-5">
            <DescList items={RELIABILITY.map(([k, v]): [ReactNode, ReactNode] => [<span key={k} className="font-medium text-ink">{k}</span>, <span key={`${k}-v`} className="text-ink-2">{v}</span>])} />
          </div>
        </Card>
      </div>

      {/* Sync history */}
      <Card>
        <CardHeader title="Sync history" subtitle={`Last ${o.runs.length} runs`} icon={<History className="size-4" />} />
        {o.runs.length === 0 ? (
          <EmptyState title="No syncs yet" description="Runs appear here after the first import." />
        ) : (
          <div className="relative overflow-x-auto border-t border-line">
            <table className="w-full text-[13px] min-w-[820px]">
              <thead>
                <tr className="text-left text-[12px] text-muted">
                  <th className="px-5 py-2.5 font-medium">Started (UTC)</th>
                  <th className="px-3 py-2.5 font-medium">Trigger</th>
                  <th className="px-3 py-2.5 font-medium text-right">Attempt</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium text-right">Records fetched</th>
                  <th className="px-3 py-2.5 font-medium">Idempotency key</th>
                  <th className="px-5 py-2.5 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {o.runs.map((r) => {
                  const fetched = r.entities.reduce((s, e) => s + e.fetched, 0);
                  const created = r.entities.reduce((s, e) => s + e.created, 0);
                  return (
                    <tr key={r.id} className="border-t border-line hover:bg-surface-2 align-top">
                      <td className="px-5 py-2.5 tabular whitespace-nowrap">{prettyDateTime(r.startedAt)}</td>
                      <td className="px-3 py-2.5">{TRIGGER[r.trigger] ?? r.trigger}</td>
                      <td className="px-3 py-2.5 text-right tabular">{r.attempt}</td>
                      <td className="px-3 py-2.5"><StatusPill status={r.status} /></td>
                      <td className="px-3 py-2.5 text-right tabular" title={`${count(created)} created`}>
                        {count(fetched)}
                        {created > 0 && <div className="text-[11.5px] text-muted">{count(created)} new</div>}
                      </td>
                      <td className="px-3 py-2.5"><span className="font-mono text-[11px] text-muted break-all">{r.idempotencyKey}</span></td>
                      <td className={cn("px-5 py-2.5 max-w-[260px]", r.error ? "text-crit-600" : "text-subtle")}>
                        {r.error ? (
                          <>
                            <div className="text-[12.5px]">{r.error.message}</div>
                            <div className="font-mono text-[11px] text-muted mt-0.5">{r.error.code}{r.error.retryable ? " · retryable" : ""}</div>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* More connectors */}
      <section aria-labelledby="more-connectors">
        <div className="flex items-end justify-between mb-3">
          <div>
            <h2 id="more-connectors" className="text-[15px] font-semibold">More connectors</h2>
            <p className="text-[13px] text-muted mt-0.5">Roadmap — not available in the Expo MVP.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {others.map((c) => (
            <Card key={c.provider} className="px-4 py-4 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[14.5px] font-semibold">{c.name}</div>
                  <div className="text-[12px] text-muted">{c.category}</div>
                </div>
                <ClassBadge cls={c.classification} />
              </div>
              <p className="text-[13px] text-ink-2 mt-2.5">{c.description}</p>
              <div className="text-[12px] text-muted mt-2"><span className="font-medium text-ink-2">Data use:</span> {c.dataUse}</div>
              <div className="mt-auto pt-4 flex items-center justify-between gap-2">
                <Badge tone="neutral">{c.phase}</Badge>
                <button type="button" disabled className={buttonClass("secondary", "sm")}>Coming later</button>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <p className="text-[12px] text-muted">QuickBooks Online is the only accounting integration in the Expo MVP (PRD §21). Additional connectors are proposed for Phase 2.</p>
    </div>
  );
}
