import Link from "next/link";
import { ArrowRight, Building2, Mail, ScrollText, ShieldAlert, ShieldCheck, Users } from "lucide-react";
import { hasPerm, requireCtx } from "@/server/auth/session";
import { adminOverview } from "@/server/services/admin";
import { Avatar, Badge, Card, CardHeader, EmptyState, LinkButton, PageHeader } from "@/components/ui/primitives";
import { OrgAdminControls, ResetDemo, RiskRuleToggle, StaffRoleControl, type OrgAdminRow, type StaffOpt } from "@/components/ops/admin-panels";
import { Restricted, StaffOnly, TableWrap, td, th, tr } from "@/components/ops/shared";
import { prettyDateTime } from "@/lib/dates";
import { count } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata = { title: "Administration" };

export default async function AdminPage() {
  const ctx = await requireCtx();
  if (!ctx.isStaff) return <StaffOnly />;
  if (!hasPerm(ctx, "admin:manage")) return <Restricted />;
  const o = adminOverview();
  const staff: StaffOpt[] = o.staff.filter((u) => u.status === "active").map((u) => ({ id: u.id, name: u.name, role: u.staffRole }));
  const orgs = [...o.orgs].sort((a, b) => (a.org.isDemo === b.org.isDemo ? a.org.name.localeCompare(b.org.name) : a.org.isDemo ? -1 : 1));
  const enabledRules = o.riskRules.filter((r) => r.enabled).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Fabrik Operations"
        title="Administration"
        description="Organizations, staff access, risk policy and the demo environment. Every change here is written to the audit trail."
        badge={<Badge tone="ai">Fabrik Admin</Badge>}
        actions={
          <LinkButton href="/ops/requirements">
            <ScrollText className="size-4" /> Requirements traceability
          </LinkButton>
        }
      />

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3" aria-label="Environment summary">
        {[
          ["Organizations", count(o.orgs.length)],
          ["Fabrik staff", count(o.staff.filter((s) => s.status === "active").length)],
          ["Client users", count(o.clientUsers.length)],
          ["Active sessions", count(o.sessions)],
        ].map(([k, v]) => (
          <div key={k} className="bg-surface border border-line rounded-[var(--radius-card)] shadow-[var(--shadow-card)] px-4 py-3">
            <div className="text-[12.5px] text-muted font-medium">{k}</div>
            <div className="text-[20px] font-semibold tabular mt-0.5">{v}</div>
          </div>
        ))}
      </section>

      <Card>
        <CardHeader title="Organizations" subtitle="Plan, status, assigned team and bookkeeping cadence · changes save immediately" icon={<Building2 className="size-4" />} />
        <TableWrap>
          <thead>
            <tr>
              <th className={th}>Organization</th>
              <th className={th}>Plan</th>
              <th className={th}>Status</th>
              <th className={th}>Bookkeeper</th>
              <th className={th}>Reviewer</th>
              <th className={th}>Dedicated accountant</th>
              <th className={th}>Close</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map(({ org, members, txns }) => {
              const row: OrgAdminRow = { id: org.id, name: org.name, plan: org.plan, status: org.status, closeFrequency: org.closeFrequency, bookkeeperId: org.assignedBookkeeperId, reviewerId: org.assignedReviewerId, accountantId: org.dedicatedAccountantId };
              return (
                <tr key={org.id} className={tr}>
                  <td className={cn(td, "min-w-[180px]")}>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink">{org.name}</span>
                      {org.isDemo && <Badge tone="brand">Demo</Badge>}
                    </div>
                    <div className="text-[12px] text-muted truncate max-w-[220px]">{org.industry} · {org.state}</div>
                    <div className="text-[11.5px] text-subtle tabular">{count(members)} {members === 1 ? "user" : "users"} · {count(txns)} transactions</div>
                  </td>
                  <td className={td}><OrgAdminControls row={row} staff={staff} field="plan" /></td>
                  <td className={td}><OrgAdminControls row={row} staff={staff} field="status" /></td>
                  <td className={td}><OrgAdminControls row={row} staff={staff} field="bookkeeper" /></td>
                  <td className={td}><OrgAdminControls row={row} staff={staff} field="reviewer" /></td>
                  <td className={td}><OrgAdminControls row={row} staff={staff} field="accountant" /></td>
                  <td className={td}><OrgAdminControls row={row} staff={staff} field="frequency" /></td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
        <div className="h-2" />
      </Card>

      <Card>
        <CardHeader title="Fabrik staff" subtitle="Staff see only the clients they're assigned to; admins see all. Disabling ends active sessions." icon={<Users className="size-4" />} />
        <TableWrap>
          <thead>
            <tr>
              <th className={th}>Name</th>
              <th className={th}>Email</th>
              <th className={th}>Role</th>
              <th className={th}>MFA</th>
              <th className={th}>Last sign-in</th>
            </tr>
          </thead>
          <tbody>
            {o.staff.map((u) => (
              <tr key={u.id} className={cn(tr, u.status === "disabled" && "opacity-70")}>
                <td className={cn(td, "whitespace-nowrap")}>
                  <span className="inline-flex items-center gap-2.5">
                    <Avatar name={u.name} hue={u.avatarHue} size={26} />
                    <span>
                      <span className="font-medium text-ink">{u.name}</span>
                      {u.id === ctx.user.id && <Badge tone="brand" className="ml-2 h-5 text-[11px]">You</Badge>}
                      {u.title && <span className="block text-[12px] text-muted">{u.title}</span>}
                    </span>
                  </span>
                </td>
                <td className={cn(td, "text-ink-2 whitespace-nowrap")}>{u.email}</td>
                <td className={td}><StaffRoleControl userId={u.id} name={u.name} role={u.staffRole!} disabled={u.status === "disabled"} self={u.id === ctx.user.id} /></td>
                <td className={td}>{u.mfaEnabled ? <Badge tone="ok" dot>Enabled</Badge> : <Badge tone="warn" dot>Not set up</Badge>}</td>
                <td className={cn(td, "whitespace-nowrap text-muted tabular")}>{u.status === "disabled" ? <Badge>Disabled</Badge> : u.lastLoginAt ? `${prettyDateTime(u.lastLoginAt)} UTC` : "Never"}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        <div className="h-2" />
      </Card>

      <Card>
        <CardHeader title="Risk rules" subtitle={`${enabledRules} of ${o.riskRules.length} enabled · applied to every client`} icon={<ShieldAlert className="size-4" />} />
        <div className="px-5 pb-3">
          <div className="flex items-start gap-2 rounded-lg bg-risk-50 text-risk-600 ring-1 ring-inset ring-[#f1c9b4] px-3 py-2 text-[12.5px]">
            <ShieldCheck className="size-4 shrink-0 mt-px" aria-hidden />
            <span><span className="font-semibold">Risk rules override AI confidence.</span> A flagged transaction always goes to a person, even at 99% confidence. Disabling a rule affects new and reprocessed transactions.</span>
          </div>
        </div>
        <ul className="grid md:grid-cols-2 gap-x-6 px-5 pb-4">
          {o.riskRules.map((r) => (
            <li key={r.key} className="flex items-start gap-3 py-2.5 border-t border-line">
              <RiskRuleToggle ruleKey={r.key} label={r.label} enabled={r.enabled} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn("text-[13.5px] font-medium", r.enabled ? "text-ink" : "text-muted")}>{r.label}</span>
                  <Badge className="h-5 text-[11px] tabular" title="Contribution to the 0–100 risk score">weight {r.weight}</Badge>
                </div>
                <p className="text-[12.5px] text-muted mt-0.5">{r.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-6 items-start">
        <Card>
          <CardHeader title="Development email outbox" subtitle="Emails are captured here instead of being delivered · latest 50" icon={<Mail className="size-4" />} />
          {o.outbox.length === 0 ? (
            <EmptyState title="No emails sent yet" description="Invitations, password resets and notifications will appear here." />
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

        <div className="space-y-6">
          <Card>
            <CardHeader title="Demo environment" subtitle="Restore the seeded Expo demo story" />
            <div className="px-5 pb-5">
              <p className="text-[13px] text-ink-2">Resets all organizations, transactions, decisions, uploads and sessions to the original seed — Smith Family Farms plus the client portfolio. Use it between demos.</p>
              <div className="mt-4">
                <ResetDemo />
              </div>
            </div>
          </Card>
          <Card>
            <Link href="/ops/requirements" className="flex items-center gap-3 px-5 py-4 rounded-[var(--radius-card)] hover:bg-surface-2">
              <span className="size-9 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center shrink-0"><ScrollText className="size-4.5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold">Requirements traceability</span>
                <span className="block text-[12.5px] text-muted">PRD requirements mapped to what&apos;s built</span>
              </span>
              <ArrowRight className="size-4 text-muted" />
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
