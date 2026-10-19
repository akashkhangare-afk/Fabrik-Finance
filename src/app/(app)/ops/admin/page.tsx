import { Building2, Mail, ShieldAlert, Users } from "lucide-react";
import { hasPerm, requireCtx } from "@/server/auth/session";
import { adminOverview } from "@/server/services/admin";
import { demoMode, showExtras } from "@/server/config";
import { Avatar, Badge, Card, CardHeader, EmptyState, Notice, PageHeader } from "@/components/ui/primitives";
import { OrgAdminControls, ResetDemo, RiskRuleToggle, StaffRoleControl, type OrgAdminRow, type StaffOpt } from "@/components/ops/admin-panels";
import { Restricted, StaffOnly, TableWrap, td, th, tr } from "@/components/ops/shared";
import { prettyDateTime } from "@/lib/dates";
import { cn } from "@/lib/cn";

export const metadata = { title: "Administration" };

export default async function AdminPage() {
  const ctx = await requireCtx();
  if (!ctx.isStaff) return <StaffOnly />;
  if (!hasPerm(ctx, "admin:manage")) return <Restricted />;
  const o = adminOverview();
  const demo = demoMode();
  const extras = showExtras();
  const staff: StaffOpt[] = o.staff.filter((u) => u.status === "active").map((u) => ({ id: u.id, name: u.name, role: u.staffRole }));
  const orgs = [...o.orgs].sort((a, b) => (a.isDemo === b.isDemo ? a.name.localeCompare(b.name) : a.isDemo ? -1 : 1));
  const enabledRules = o.riskRules.filter((r) => r.enabled).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Administration" />

      <Card>
        <CardHeader title="Organizations" icon={<Building2 className="size-4" />} />
        <TableWrap>
          <thead>
            <tr>
              <th className={th}>Organization</th>
              <th className={th}>Plan</th>
              <th className={th}>Status</th>
              <th className={th}>Bookkeeper</th>
              <th className={th}>Reviewer</th>
              {extras && <th className={th}>Dedicated accountant</th>}
              <th className={th}>Close</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((org) => {
              const row: OrgAdminRow = { id: org.id, name: org.name, plan: org.plan, status: org.status, closeFrequency: org.closeFrequency, bookkeeperId: org.assignedBookkeeperId, reviewerId: org.assignedReviewerId, accountantId: org.dedicatedAccountantId };
              return (
                <tr key={org.id} className={tr}>
                  <td className={cn(td, "min-w-[180px]")}>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink">{org.name}</span>
                      {org.isDemo && demo && <Badge tone="brand">Demo</Badge>}
                    </div>
                  </td>
                  <td className={td}><OrgAdminControls row={row} staff={staff} field="plan" /></td>
                  <td className={td}><OrgAdminControls row={row} staff={staff} field="status" /></td>
                  <td className={td}><OrgAdminControls row={row} staff={staff} field="bookkeeper" /></td>
                  <td className={td}><OrgAdminControls row={row} staff={staff} field="reviewer" /></td>
                  {extras && <td className={td}><OrgAdminControls row={row} staff={staff} field="accountant" /></td>}
                  <td className={td}><OrgAdminControls row={row} staff={staff} field="frequency" /></td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
        <div className="h-2" />
      </Card>

      <Card>
        <CardHeader title="Fabrik staff" icon={<Users className="size-4" />} />
        <TableWrap>
          <thead>
            <tr>
              <th className={th}>Name</th>
              <th className={th}>Email</th>
              <th className={th}>Role</th>
            </tr>
          </thead>
          <tbody>
            {o.staff.map((u) => (
              <tr key={u.id} className={cn(tr, u.status === "disabled" && "opacity-70")}>
                <td className={cn(td, "whitespace-nowrap")}>
                  <span className="inline-flex items-center gap-2.5">
                    <Avatar name={u.name} hue={u.avatarHue} size={26} />
                    <span className="font-medium text-ink">{u.name}</span>
                    {u.id === ctx.user.id && <Badge tone="brand" className="h-5 text-[11px]">You</Badge>}
                  </span>
                </td>
                <td className={cn(td, "text-ink-2 whitespace-nowrap")}>{u.email}</td>
                <td className={td}><StaffRoleControl userId={u.id} name={u.name} role={u.staffRole!} disabled={u.status === "disabled"} self={u.id === ctx.user.id} /></td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        <div className="h-2" />
      </Card>

      <Card>
        <CardHeader title="Risk rules" subtitle={`${enabledRules} of ${o.riskRules.length} enabled`} icon={<ShieldAlert className="size-4" />} />
        <div className="px-5 pb-3">
          <Notice tone="warn">Disabling a rule affects new and reprocessed transactions.</Notice>
        </div>
        <ul className="grid md:grid-cols-2 gap-x-6 px-5 pb-4">
          {o.riskRules.map((r) => (
            <li key={r.key} className="flex items-start gap-3 py-2.5 border-t border-line">
              <RiskRuleToggle ruleKey={r.key} label={r.label} enabled={r.enabled} />
              <div className="min-w-0 flex-1">
                <span className={cn("text-[13.5px] font-medium", r.enabled ? "text-ink" : "text-muted")}>{r.label}</span>
                <p className="text-[12.5px] text-muted mt-0.5">{r.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {demo && (
        <div className="grid xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-6 items-start">
          <Card>
            <CardHeader title="Development email outbox" icon={<Mail className="size-4" />} />
            {o.outbox.length === 0 ? (
              <EmptyState title="No emails sent yet" />
            ) : (
              <ul className="px-2 pb-2">
                {o.outbox.map((m) => (
                  <li key={m.id}>
                    <details className="group rounded-xl hover:bg-surface-2 open:bg-surface-2">
                      <summary className="cursor-pointer list-none flex items-start gap-3 px-3 py-2.5 rounded-xl focus-visible:outline-2 focus-visible:outline-brand-500">
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] font-medium text-ink truncate">{m.subject}</div>
                          <div className="text-[12px] text-muted truncate">To {m.to}</div>
                        </div>
                        <span className="text-[12px] text-muted tabular whitespace-nowrap">{prettyDateTime(m.createdAt)}</span>
                      </summary>
                      <pre className="mx-3 mb-3 whitespace-pre-wrap break-words rounded-lg border border-line bg-surface px-3 py-2.5 text-[12px] leading-relaxed text-ink-2 font-sans">{m.body}</pre>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Demo environment" subtitle="Restore the seeded demo" />
            <div className="px-5 pb-5">
              <ResetDemo />
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
