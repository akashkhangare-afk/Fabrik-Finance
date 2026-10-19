import { FlaskConical, History, Lock, Plug } from "lucide-react";
import { requireCtx, hasPerm } from "@/server/auth/session";
import { integrationOverview } from "@/server/services/integrations";
import { db } from "@/server/db/store";
import { demoMode } from "@/server/config";
import { Badge, Card, CardHeader, EmptyState, Notice, PageHeader, StatusPill } from "@/components/ui/primitives";
import { QboActions, SimulateFailureToggle } from "@/components/integrations/qbo-controls";
import { prettyDate, prettyDateTime } from "@/lib/dates";
import { count } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata = { title: "Integrations" };

const TRIGGER: Record<string, string> = { manual: "Manual", scheduled: "Scheduled", retry: "Retry", writeback: "Write-back", initial: "Initial import" };

export default async function IntegrationsPage() {
  const ctx = await requireCtx();
  if (!hasPerm(ctx, "integrations:read")) {
    return (
      <div className="max-w-[1100px]">
        <PageHeader title="Integrations" />
        <Card>
          <EmptyState icon={<Lock className="size-5" />} title="You don't have access to integrations" />
        </Card>
      </div>
    );
  }
  const o = integrationOverview(ctx);
  const canManage = hasPerm(ctx, "integrations:manage");
  const demo = demoMode();
  const qbo = o.connections.find((c) => c.provider === "quickbooks_online");
  const connectedBy = qbo?.connectedBy ? db().users.find((u) => u.id === qbo.connectedBy)?.name : undefined;
  const lastRun = o.runs[0];

  return (
    <div className="max-w-[1100px] space-y-6">
      <PageHeader title="Integrations" />

      <Card className="overflow-hidden">
        <div className="px-5 pt-5 pb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="size-11 rounded-xl bg-[#2ca01c] text-white flex items-center justify-center shrink-0 font-bold text-[15px]" aria-hidden>qb</div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-[17px] font-semibold">QuickBooks Online</h2>
                {qbo ? <StatusPill status={qbo.status} /> : <StatusPill status="disconnected" label="Not connected" />}
                {qbo && demo && qbo.mode !== "live" && <Badge tone="ai">Synthetic sandbox</Badge>}
              </div>
              <p className="text-[13px] text-muted mt-1">Imports accounts, transactions, vendors, customers, invoices, bills, journal entries and reports. Only approved categorizations are written back.</p>
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
              ["Company", qbo.companyName ?? "—", null],
              ["Connected", qbo.connectedAt ? prettyDate(qbo.connectedAt.slice(0, 10), { year: true }) : "—", connectedBy ? `by ${connectedBy}` : null],
              ["Last sync", qbo.lastSyncAt ? prettyDateTime(qbo.lastSyncAt) : "Never", qbo.lastSyncStatus ? <StatusPill status={qbo.lastSyncStatus} /> : null],
              ["Pending write-backs", count(o.pendingWriteback), null],
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
            <EmptyState icon={<Plug className="size-5" />} title="QuickBooks isn't connected" />
          </div>
        )}
      </Card>

      {demo && qbo && canManage && (
        <Card className="border-dashed">
          <CardHeader title="Demo controls" icon={<FlaskConical className="size-4" />} />
          <div className="px-5 pb-4">
            <SimulateFailureToggle on={Boolean(qbo.simulateFailure)} />
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="Sync history" icon={<History className="size-4" />} />
        {o.runs.length === 0 ? (
          <EmptyState title="No syncs yet" />
        ) : (
          <div className="relative overflow-x-auto border-t border-line">
            <table className="w-full text-[13px] min-w-[640px]">
              <thead>
                <tr className="text-left text-[12px] text-muted">
                  <th className="px-5 py-2.5 font-medium">Started</th>
                  <th className="px-3 py-2.5 font-medium">Trigger</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium text-right">Records fetched</th>
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
                      <td className="px-3 py-2.5"><StatusPill status={r.status} /></td>
                      <td className="px-3 py-2.5 text-right tabular">
                        {count(fetched)}
                        {created > 0 && <div className="text-[11.5px] text-muted">{count(created)} new</div>}
                      </td>
                      <td className={cn("px-5 py-2.5 max-w-[260px]", r.error ? "text-crit-600" : "text-subtle")}>
                        {r.error ? (
                          <>
                            <div className="text-[12.5px]">{r.error.message}</div>
                            <div className="font-mono text-[11px] text-muted mt-0.5">{r.error.code}</div>
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
    </div>
  );
}
