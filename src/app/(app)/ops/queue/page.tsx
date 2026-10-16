import { Suspense } from "react";
import { SquareKanban } from "lucide-react";
import type { WorkItem, WorkItemType } from "@/lib/types";
import { accessibleOrgs, hasPerm, requireCtx } from "@/server/auth/session";
import { ROLE_LABELS } from "@/server/auth/permissions";
import { syncWorkQueue } from "@/server/services/ops";
import { db } from "@/server/db/store";
import { Avatar, Badge, Card, EmptyState, PageHeader, StatusPill } from "@/components/ui/primitives";
import { OrgLink } from "@/components/ops/org-nav";
import { QueueFilters, WorkAssignSelect, WorkStatusSelect, type FilterDef } from "@/components/ops/queue-controls";
import { PRIORITY_RANK, PriorityBadge, StaffOnly, TableWrap, WORK_STATUS_LABEL, WORK_TYPE_LABEL, td, th, thNum, tr, tdNum } from "@/components/ops/shared";
import { monthLabel, monthName, prettyDateTime, relativeAge } from "@/lib/dates";
import { count, plural } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata = { title: "Work Queue" };

type SP = { client?: string; bookkeeper?: string; type?: string; priority?: string; period?: string; status?: string };

export default async function WorkQueuePage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireCtx();
  if (!ctx.isStaff) return <StaffOnly />;
  const sp = await searchParams;
  const data = db();
  const all = syncWorkQueue(ctx);
  const orgs = accessibleOrgs(ctx.user);
  const orgById = new Map(orgs.map((o) => [o.id, o]));
  const users = new Map(data.users.map((u) => [u.id, u]));
  const staff = data.users.filter((u) => u.staffRole && u.status === "active").sort((a, b) => a.name.localeCompare(b.name));
  const canAssign = hasPerm(ctx, "ops:assign") && (ctx.role === "fabrik_reviewer" || ctx.role === "fabrik_admin");

  const statusOk = (w: WorkItem) => (sp.status === "all" ? true : sp.status ? w.status === sp.status : w.status !== "done");
  const rows = all
    .filter((w) => orgById.has(w.orgId))
    .filter((w) => !sp.client || w.orgId === sp.client)
    .filter((w) => !sp.bookkeeper || w.assigneeId === sp.bookkeeper || orgById.get(w.orgId)?.assignedBookkeeperId === sp.bookkeeper)
    .filter((w) => !sp.type || w.type === sp.type)
    .filter((w) => !sp.priority || w.priority === sp.priority)
    .filter((w) => !sp.period || w.period === sp.period)
    .filter(statusOk)
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.createdAt.localeCompare(b.createdAt));

  const activeAll = all.filter((w) => w.status !== "done" && orgById.has(w.orgId));
  const byPriority = (p: WorkItem["priority"]) => activeAll.filter((w) => w.priority === p).length;
  const mine = activeAll.filter((w) => w.assigneeId === ctx.user.id).length;
  const periods = [...new Set(all.map((w) => w.period))].sort().reverse();
  const bookkeeperIds = [...new Set(orgs.map((o) => o.assignedBookkeeperId).filter(Boolean) as string[])];
  const fmtPeriod = (p: string) => (/^\d{4}-\d{2}$/.test(p) ? `${monthName(p)} ${p.slice(0, 4)}` : p);

  const filters: FilterDef[] = [
    { key: "client", label: "Client", allLabel: "All clients", options: orgs.map((o) => ({ value: o.id, label: o.name })) },
    { key: "bookkeeper", label: "Bookkeeper", allLabel: "Everyone", options: [...new Set([...bookkeeperIds, ...staff.map((s) => s.id)])].map((id) => users.get(id)).filter((u) => u?.staffRole).map((u) => ({ value: u!.id, label: u!.id === ctx.user.id ? `${u!.name} (me)` : u!.name })) },
    { key: "type", label: "Task type", allLabel: "All types", options: (Object.keys(WORK_TYPE_LABEL) as WorkItemType[]).map((t) => ({ value: t, label: WORK_TYPE_LABEL[t] })) },
    { key: "priority", label: "Priority", allLabel: "Any priority", options: (["critical", "high", "medium", "low"] as const).map((p) => ({ value: p, label: p[0]!.toUpperCase() + p.slice(1) })) },
    { key: "period", label: "Month", allLabel: "Any month", options: periods.map((p) => ({ value: p, label: fmtPeriod(p) })) },
    { key: "status", label: "Status", allLabel: "Active (not done)", options: [...(Object.keys(WORK_STATUS_LABEL) as WorkItem["status"][]).map((s) => ({ value: s, label: WORK_STATUS_LABEL[s] })), { value: "all", label: "All, including done" }] },
  ];
  const staffOpts = staff.map((u) => ({ id: u.id, name: u.name, role: ROLE_LABELS[u.staffRole!].replace("Fabrik ", "") }));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Fabrik Operations"
        title="Work Queue"
        description="Everything that needs a person, across every client you serve — generated from live books, reconciliations, close and integrations."
        badge={<Badge tone={activeAll.length ? "warn" : "ok"}>{activeAll.length ? `${count(activeAll.length)} active` : "All clear"}</Badge>}
      />

      <div className="flex flex-wrap gap-2 text-[12.5px]">
        <Badge tone="crit" dot>{byPriority("critical")} critical</Badge>
        <Badge tone="risk" dot>{byPriority("high")} high</Badge>
        <Badge tone="warn" dot>{byPriority("medium")} medium</Badge>
        <Badge tone="neutral" dot>{byPriority("low")} low</Badge>
        <span className="text-muted self-center ml-1">· {plural(mine, "item")} assigned to you</span>
      </div>

      <Card>
        <div className="px-5 pt-4 pb-4 border-b border-line">
          <Suspense fallback={<div className="h-[52px]" />}>
            <QueueFilters filters={filters} />
          </Suspense>
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={<SquareKanban className="size-5" />} title="No work items match" description={sp.status || sp.client || sp.type || sp.priority || sp.period || sp.bookkeeper ? "Try clearing a filter." : "Every client is current — automation is handling the routine work."} />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <th className={th}>Priority</th>
                <th className={th}>Client</th>
                <th className={th}>Task</th>
                <th className={th}>Type</th>
                <th className={thNum}>Age</th>
                <th className={th}>Assigned</th>
                <th className={th}>Status</th>
                <th className={th}>Update</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => {
                const org = orgById.get(w.orgId)!;
                const assignee = w.assigneeId ? users.get(w.assigneeId) : undefined;
                return (
                  <tr key={w.id} className={cn(tr, w.status === "done" && "opacity-70")}>
                    <td className={td}><PriorityBadge priority={w.priority} /></td>
                    <td className={cn(td, "min-w-[140px]")}>
                      <div className="font-medium text-ink leading-snug">{org.name}</div>
                      {org.id === ctx.org.id && <div className="text-[11.5px] text-brand-700">Active workspace</div>}
                    </td>
                    <td className={cn(td, "min-w-[240px] max-w-[400px]")}>
                      {w.href ? (
                        <OrgLink orgId={w.orgId} href={w.href} activeOrgId={ctx.org.id} className="font-medium leading-snug" title={`Open in ${org.name}`}>
                          {w.title}
                        </OrgLink>
                      ) : (
                        <span className="font-medium leading-snug">{w.title}</span>
                      )}
                      <div className="text-[11.5px] text-muted mt-0.5">{/^\d{4}-\d{2}$/.test(w.period) ? monthLabel(w.period, "long") : w.period}{w.auto ? " · auto-generated" : " · manual"}</div>
                    </td>
                    <td className={cn(td, "whitespace-nowrap text-ink-2")}>{WORK_TYPE_LABEL[w.type]}</td>
                    <td className={cn(tdNum, "text-ink-2")} title={`Created ${prettyDateTime(w.createdAt)} UTC`}>{relativeAge(w.createdAt)}</td>
                    <td className={cn(td, "whitespace-nowrap")}>
                      {canAssign ? (
                        <WorkAssignSelect id={w.id} title={w.title} assigneeId={w.assigneeId} staff={staffOpts} />
                      ) : assignee ? (
                        <span className="inline-flex items-center gap-2">
                          <Avatar name={assignee.name} hue={assignee.avatarHue} size={22} />
                          <span className="text-ink-2">{assignee.name}</span>
                        </span>
                      ) : (
                        <span className="text-muted">Unassigned</span>
                      )}
                    </td>
                    <td className={cn(td, "whitespace-nowrap")}><StatusPill status={w.status} /></td>
                    <td className={cn(td, "whitespace-nowrap")}>
                      <WorkStatusSelect id={w.id} title={w.title} status={w.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
        <div className="px-5 py-3 border-t border-line text-[12px] text-muted flex flex-wrap gap-x-4 gap-y-1">
          <span>{plural(rows.length, "item")} shown</span>
          <span>Sorted by priority, then oldest first</span>
          {!canAssign && <span>Reassignment is available to reviewers and admins</span>}
        </div>
      </Card>
    </div>
  );
}
