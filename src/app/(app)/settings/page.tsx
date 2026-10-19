import Link from "next/link";
import { Bot, ClipboardCheck, Lock, Search, ShieldAlert, ShieldCheck, Sparkles, UserRound, Users } from "lucide-react";
import type { AuditEvent } from "@/lib/types";
import { requireCtx, hasPerm, type Ctx } from "@/server/auth/session";
import { fabrikTeam, teamMembers } from "@/server/services/admin";
import { db } from "@/server/db/store";
import { ROLE_LABELS } from "@/server/auth/permissions";
import { AiBadge, Avatar, Badge, Card, CardHeader, DescList, EmptyState, Input, Notice, PageHeader, buttonClass } from "@/components/ui/primitives";
import { InviteForm, TeamTable, type MemberView } from "@/components/settings/team";
import { MfaCard, ProfileForm } from "@/components/settings/profile";
import { FrequencyForm, RuleToggle, ThresholdsForm } from "@/components/settings/ai";
import { prettyDate, prettyDateTime } from "@/lib/dates";
import { showExtras } from "@/server/config";
import { count, money } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata = { title: "Settings" };

type Tab = "team" | "profile" | "ai" | "bookkeeping" | "audit";
const TAB_LABELS: Record<Tab, string> = { team: "Team", profile: "Profile & security", ai: "AI & rules", bookkeeping: "Bookkeeping", audit: "Audit trail" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; page?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const allowed: Tab[] = [
    ...(hasPerm(ctx, "team:read") ? (["team"] as const) : []),
    "profile",
    ...(hasPerm(ctx, "team:read") ? (["ai"] as const) : []),
    ...(hasPerm(ctx, "team:read") && showExtras() ? (["bookkeeping"] as const) : []),
    ...(hasPerm(ctx, "audit:read") ? (["audit"] as const) : []),
  ];
  const requested = (sp.tab ?? "team") as Tab;
  const tab: Tab = allowed.includes(requested) ? requested : allowed[0]!;

  return (
    <div className="max-w-[1100px]">
      <PageHeader title="Settings" />
      <div className="flex items-center gap-1 border-b border-line mb-5 overflow-x-auto" role="tablist" aria-label="Settings sections">
        {allowed.map((t) => (
          <Link
            key={t}
            href={`/settings?tab=${t}`}
            role="tab"
            aria-selected={tab === t}
            className={cn("relative px-3 h-10 inline-flex items-center gap-2 text-[13.5px] font-medium whitespace-nowrap", tab === t ? "text-ink after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:bg-brand-600 after:rounded" : "text-muted hover:text-ink")}
          >
            {TAB_LABELS[t]}
          </Link>
        ))}
      </div>
      {tab === "team" && <TeamTab ctx={ctx} />}
      {tab === "profile" && <ProfileTab ctx={ctx} />}
      {tab === "ai" && <AiTab ctx={ctx} />}
      {tab === "bookkeeping" && <BookkeepingTab ctx={ctx} />}
      {tab === "audit" && <AuditTab ctx={ctx} q={sp.q ?? ""} page={Number(sp.page) || 1} />}
    </div>
  );
}

// ─── Team ───────────────────────────────────────────────────────────────────

function TeamTab({ ctx }: { ctx: Ctx }) {
  const canManage = hasPerm(ctx, "team:manage");
  const members: MemberView[] = teamMembers(ctx).map(({ membership: m, user: u }) => ({
    membershipId: m.id,
    userId: u.id,
    name: u.name,
    email: u.email,
    title: u.title,
    hue: u.avatarHue,
    role: m.role,
    roleLabel: ROLE_LABELS[m.role],
    status: u.status,
    mfa: u.mfaEnabled,
    isSelf: u.id === ctx.user.id,
  }));
  const team = fabrikTeam(ctx.org);
  const fabrik = [
    { label: "Bookkeeper", user: team.bookkeeper, note: "Day-to-day categorization, questions and close prep" },
    { label: "Reviewer", user: team.reviewer, note: "Approves reconciliations and the monthly close" },
  ];
  return (
    <div className="space-y-6">
      {ctx.isStaff && !canManage && (
        <Notice tone="info" icon={<Lock className="size-4" />}>Read-only for Fabrik staff.</Notice>
      )}
      <Card>
        <CardHeader title="Members" subtitle={`${count(members.length)} people with access to ${ctx.org.name}`} icon={<Users className="size-4" />} />
        <TeamTable members={members} canManage={canManage} />
      </Card>
      {canManage && (
        <Card>
          <CardHeader title="Invite someone" />
          <div className="px-5 pb-5">
            <InviteForm />
          </div>
        </Card>
      )}
      <Card>
        <CardHeader title="Your Fabrik team" icon={<UserRound className="size-4" />} />
        <ul className="border-t border-line">
          {fabrik.map((f) => (
            <li key={f.label} className="px-5 py-3 border-t border-line first:border-t-0 flex items-center gap-3">
              {f.user ? <Avatar name={f.user.name} hue={f.user.avatarHue} size={34} /> : <span className="size-[34px] rounded-full bg-sunken shrink-0" aria-hidden />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13.5px] font-semibold">{f.user?.name ?? "Not assigned yet"}</span>
                  <span className="text-[12px] text-muted" title={f.note}>{f.label}</span>
                </div>
                <div className="text-[12px] text-muted truncate">{f.user ? `${f.user.title ?? ""}${f.user.title ? " · " : ""}${f.user.email}` : f.note}</div>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

// ─── Profile ────────────────────────────────────────────────────────────────

function ProfileTab({ ctx }: { ctx: Ctx }) {
  const u = ctx.user;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader title="Your profile" subtitle={u.email} icon={<UserRound className="size-4" />} />
        <div className="px-5 pb-5">
          <ProfileForm name={u.name} title={u.title ?? ""} prefs={u.notificationPrefs} showDigest={showExtras()} />
        </div>
      </Card>
      <div className="space-y-6">
        <Card>
          <CardHeader title="Security" icon={<ShieldCheck className="size-4" />} />
          <div className="px-5 pb-5 space-y-4">
            <MfaCard enabled={u.mfaEnabled} />
            <div className="border-t border-line pt-4 text-[13px] text-muted">
              Need a new password? <Link href="/forgot-password" className="text-brand-700 hover:underline">Send a reset link</Link> to {u.email}.
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Access" />
          <div className="px-5 pb-5">
            <DescList
              items={[
                ["Organization", ctx.org.name],
                ["Active role", <Badge key="r" tone={ctx.isStaff ? "ai" : "brand"}>{ROLE_LABELS[ctx.role]}</Badge>],
              ]}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── AI & rules ─────────────────────────────────────────────────────────────

function AiTab({ ctx }: { ctx: Ctx }) {
  const data = db();
  const canEdit = hasPerm(ctx, "settings:manage");
  const canRules = hasPerm(ctx, "rules:manage");
  const t = ctx.org.thresholds;
  const rules = data.rules.filter((r) => r.orgId === ctx.org.id).sort((a, b) => b.hits - a.hits);
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="AI confidence thresholds" icon={<Sparkles className="size-4" />} />
        <div className="px-5 pb-5 space-y-5">
          <ThresholdsForm autoApprove={t.autoApprove} review={t.review} largeDollars={Math.round(ctx.org.largeTransactionThreshold / 100)} canEdit={canEdit} />
          <Notice tone="neutral" icon={<ShieldAlert className="size-4" />}>Risk rules override confidence: flagged items and anything {money(ctx.org.largeTransactionThreshold)} or more always go to a person.</Notice>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Risk rules" icon={<ShieldAlert className="size-4" />} />
          <ul className="border-t border-line">
            {data.riskRules.map((r) => (
              <li key={r.key} className="px-5 py-2.5 border-t border-line first:border-t-0 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13.5px] font-medium">{r.label}</div>
                  <div className="text-[12px] text-muted">{r.description}</div>
                </div>
                {r.enabled ? <Badge tone="ok" dot>On</Badge> : <Badge tone="neutral" dot>Off</Badge>}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Learned rules" icon={<Bot className="size-4" />} />
          {rules.length === 0 ? (
            <EmptyState title="No learned rules yet" />
          ) : (
            <ul className="border-t border-line">
              {rules.map((r) => (
                <li key={r.id} className={cn("px-5 py-2.5 border-t border-line first:border-t-0 flex items-center justify-between gap-3", !r.active && "opacity-60")}>
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium truncate">{r.label}</div>
                    <div className="text-[12px] text-muted"><span className="capitalize">{r.kind}</span> · {prettyDate(r.createdAt.slice(0, 10), { year: true })}</div>
                  </div>
                  {canRules ? <RuleToggle id={r.id} active={r.active} label={r.label} /> : r.active ? <Badge tone="ok" dot>Active</Badge> : <Badge tone="neutral" dot>Off</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

// ─── Bookkeeping ────────────────────────────────────────────────────────────

function BookkeepingTab({ ctx }: { ctx: Ctx }) {
  const canEdit = hasPerm(ctx, "settings:manage");
  const fyStart = new Date(Date.UTC(2026, ctx.org.fiscalYearStartMonth - 1, 1)).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  const FREQ = { monthly: "Monthly", quarterly: "Quarterly", annual: "Annual" } as const;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2 flex-wrap">
              Close frequency
            </span>
          }
          subtitle="How often Fabrik closes your books and delivers a finance package."
        />
        <div className="px-5 pb-5 space-y-3">
          {canEdit ? <FrequencyForm value={ctx.org.closeFrequency} /> : <Badge tone="brand">{FREQ[ctx.org.closeFrequency]}</Badge>}
        </div>
      </Card>
      <Card>
        <CardHeader title="Accounting setup" subtitle="Set during onboarding — ask your Fabrik team to change these." />
        <div className="px-5 pb-5">
          <DescList
            items={[
              ["Reporting basis", <span key="b" className="capitalize">{ctx.org.reportingBasis}</span>],
              ["Fiscal year starts", fyStart],
              ["Plan", <span key="p" className="capitalize">{ctx.org.plan}</span>],
              ["Legal name", ctx.org.legalName],
              ["State", ctx.org.state],
            ]}
          />
        </div>
      </Card>
    </div>
  );
}

// ─── Audit ──────────────────────────────────────────────────────────────────

function humanAction(a: string) {
  const [domain, ...rest] = a.split(".");
  const d = (domain ?? "").replace(/_/g, " ");
  const verb = rest.join(" ").replace(/[._]/g, " ");
  return { domain: d.charAt(0).toUpperCase() + d.slice(1), verb: verb || d };
}

function fmtVal(v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
  if (typeof v === "boolean") return v ? "yes" : "no";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 40 ? `${s.slice(0, 39)}…` : s;
}

function changeSummary(e: AuditEvent) {
  const keys = [...new Set([...Object.keys(e.before ?? {}), ...Object.keys(e.after ?? {})])];
  return keys.slice(0, 4).map((k) => {
    const b = e.before?.[k];
    const a = e.after?.[k];
    return e.before && k in e.before ? `${k}: ${fmtVal(b)} → ${fmtVal(a)}` : `${k}: ${fmtVal(a)}`;
  });
}

const AUDIT_PAGE = 50;

function AuditTab({ ctx, q, page: p0 }: { ctx: Ctx; q: string; page: number }) {
  const s = q.trim().toLowerCase();
  const all = db().audit.filter((e) => e.orgId === ctx.org.id);
  const matched = s ? all.filter((e) => [e.action, e.actor.name, e.entity.label, e.entity.type, e.comment].some((x) => x?.toLowerCase().includes(s))) : all;
  const recent = [...matched].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 200);
  const pages = Math.max(1, Math.ceil(recent.length / AUDIT_PAGE));
  const page = Math.min(Math.max(1, Math.floor(p0)), pages);
  const events = recent.slice((page - 1) * AUDIT_PAGE, page * AUDIT_PAGE);
  const href = (n: number) => `/settings?tab=audit${q ? `&q=${encodeURIComponent(q)}` : ""}${n > 1 ? `&page=${n}` : ""}`;
  return (
    <Card>
      <CardHeader
        title="Audit trail"
        icon={<ClipboardCheck className="size-4" />}
        action={<span className="text-[12px] text-muted tabular">{recent.length ? `${count((page - 1) * AUDIT_PAGE + 1)}–${count((page - 1) * AUDIT_PAGE + events.length)} of ` : ""}{count(recent.length)} {matched.length > recent.length ? `latest (${count(matched.length)} total)` : "events"}</span>}
      />
      <form method="get" action="/settings" className="px-5 pb-4 flex gap-2" role="search">
        <input type="hidden" name="tab" value="audit" />
        <div className="relative flex-1 max-w-md">
          <Search className="size-4 text-subtle absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
          <Input name="q" defaultValue={q} placeholder="Filter by action, person or record…" aria-label="Filter audit events" className="pl-9" />
        </div>
        <button type="submit" className={buttonClass("secondary")}>Filter</button>
        {q && (
          <Link href="/settings?tab=audit" className={buttonClass("ghost")}>
            Clear
          </Link>
        )}
      </form>
      {events.length === 0 ? (
        <div className="border-t border-line">
          <EmptyState title={q ? "No matching events" : "No events yet"} />
        </div>
      ) : (
        <div className="relative overflow-x-auto border-t border-line">
          <table className="w-full text-[13px] min-w-[900px]">
            <thead>
              <tr className="text-left text-[12px] text-muted">
                <th className="px-5 py-2.5 font-medium whitespace-nowrap">Time</th>
                <th className="px-3 py-2.5 font-medium">Actor</th>
                <th className="px-3 py-2.5 font-medium">Action</th>
                <th className="px-3 py-2.5 font-medium">Record</th>
                <th className="px-3 py-2.5 font-medium">Change</th>
                <th className="px-5 py-2.5 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const act = humanAction(e.action);
                const changes = changeSummary(e);
                return (
                  <tr key={e.id} className="border-t border-line hover:bg-surface-2 align-top">
                    <td className="px-5 py-2.5 tabular whitespace-nowrap text-ink-2">{prettyDateTime(e.at)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col items-start gap-1">
                        <span className="text-ink font-medium">{e.actor.name}</span>
                        {e.actor.type === "ai" ? <AiBadge label="AI" /> : e.actor.type === "system" ? <Badge tone="neutral">System</Badge> : e.actor.role ? <Badge tone={e.actor.role.startsWith("fabrik_") ? "info" : "brand"}>{ROLE_LABELS[e.actor.role]}</Badge> : null}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-[11.5px] uppercase tracking-[0.06em] text-muted font-medium">{act.domain}</div>
                      <div className="text-ink">{act.verb}</div>
                    </td>
                    <td className="px-3 py-2.5 max-w-[220px]">
                      <div className="text-ink-2 truncate" title={e.entity.label}>{e.entity.label ?? "—"}</div>
                      <div className="text-[11.5px] text-muted">{e.entity.type.replace(/_/g, " ")}</div>
                    </td>
                    <td className="px-3 py-2.5 max-w-[260px]">
                      {changes.length ? (
                        <ul className="space-y-0.5">
                          {changes.map((c, i) => (
                            <li key={i} className="font-mono text-[11.5px] text-ink-2 break-words">{c}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                      {e.comment && <div className="text-[12px] text-muted mt-1">“{e.comment}”</div>}
                    </td>
                    <td className="px-5 py-2.5">
                      <div className="flex flex-col items-start gap-1 text-[12px] text-muted">
                        {e.ai && (
                          <span className="inline-flex items-center gap-1.5 flex-wrap">
                            <Badge tone="ai" className="tabular">{Math.round(e.ai.confidence * 100)}%</Badge>
                            <span className="font-mono text-[11px]">{e.ai.model}</span>
                          </span>
                        )}
                        {e.risk && e.risk.reasons.length > 0 && <Badge tone="risk" title={e.risk.reasons.join(", ")}>Risk · {e.risk.level}</Badge>}
                        {!e.ai && !e.risk && <span className="text-subtle">—</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {pages > 1 && (
            <nav aria-label="Audit pages" className="flex items-center justify-between gap-3 px-5 py-3 border-t border-line text-[12.5px]">
              <span className="text-muted tabular">Page {page} of {pages}</span>
              <div className="flex items-center gap-2">
                {page > 1 ? <Link href={href(page - 1)} className={buttonClass("secondary", "sm")}>Newer</Link> : <span className={buttonClass("secondary", "sm", "opacity-50 pointer-events-none")} aria-disabled="true">Newer</span>}
                {page < pages ? <Link href={href(page + 1)} className={buttonClass("secondary", "sm")}>Older</Link> : <span className={buttonClass("secondary", "sm", "opacity-50 pointer-events-none")} aria-disabled="true">Older</span>}
              </div>
            </nav>
          )}
        </div>
      )}
    </Card>
  );
}
