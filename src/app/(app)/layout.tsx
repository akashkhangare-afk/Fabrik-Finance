import { cookies } from "next/headers";
import { requireCtx, accessibleOrgs, hasPerm } from "@/server/auth/session";
import { db } from "@/server/db/store";
import { notificationsFor } from "@/server/services/notifications";
import { ROLE_LABELS } from "@/server/auth/permissions";
import { Shell, type NavGroup } from "@/components/shell/shell";
import { prettyDateTime } from "@/lib/dates";
import { demoMode, showExtras } from "@/server/config";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  const data = db();
  const inboxOpen = data.inbox.filter((i) => i.orgId === ctx.org.id && i.status === "open").length;
  const review = data.transactions.filter((t) => t.orgId === ctx.org.id && t.status === "needs_review").length;
  const can = (p: Parameters<typeof hasPerm>[1]) => hasPerm(ctx, p);
  const isAccountant = ctx.role === "external_accountant";
  const extras = showExtras();

  const groups: NavGroup[] = [
    {
      label: "Overview",
      items: [
        { href: "/", label: "Home", icon: "home" },
        ...(can("inbox:read") ? [{ href: "/inbox", label: "Finance Inbox", icon: "inbox", badge: inboxOpen || undefined }] : []),
      ],
    },
    {
      label: "Finance",
      items: [
        { href: "/books", label: "Books", icon: "books", badge: ctx.isStaff && review ? review : undefined },
        ...(ctx.isStaff ? [{ href: "/reconciliation", label: "Reconciliation", icon: "scale" }] : []),
        { href: "/close", label: "Monthly Close", icon: "close" },
        ...(!isAccountant ? [{ href: "/bills", label: "Bills", icon: "bills" }, { href: "/collect", label: "Collect", icon: "collect" }] : []),
      ],
    },
    {
      label: "Intelligence",
      items: [
        ...(!isAccountant ? [{ href: "/funding", label: "Funding", icon: "funding" }, { href: "/cfo", label: "CFO", icon: "cfo" }] : []),
        { href: "/ask", label: "Ask Fabrik", icon: "ask" },
      ],
    },
    {
      label: "Documents",
      items: [
        { href: "/documents", label: "Documents", icon: "documents" },
        ...(extras ? [{ href: "/tax", label: "Tax & Credits", icon: "tax", tag: "Preview" }] : []),
      ],
    },
    {
      label: "Manage",
      items: [
        ...(can("integrations:read") ? [{ href: "/integrations", label: "Integrations", icon: "integrations" }] : []),
        ...(can("team:read") || ctx.isStaff ? [{ href: "/settings", label: "Settings", icon: "settings" }] : []),
      ],
    },
  ];
  if (ctx.isStaff) {
    groups.push({
      label: "Fabrik Operations",
      staff: true,
      items: [
        { href: "/ops", label: "Operations", icon: "ops" },
        { href: "/ops/queue", label: "Work Queue", icon: "queue" },
        { href: "/ops/review", label: "AI Review Queue", icon: "review" },
        { href: "/ops/clients", label: "Clients", icon: "clients" },
        ...(can("admin:manage") ? [{ href: "/ops/admin", label: "Administration", icon: "admin" }] : []),
        ...(extras ? [{ href: "/ops/requirements", label: "Requirements", icon: "requirements" }] : []),
      ],
    });
  }

  const jar = await cookies();
  const conn = data.connections.find((c) => c.orgId === ctx.org.id && c.provider === "quickbooks_online");
  return (
    <Shell
      groups={groups.filter((g) => g.items.length)}
      collapsed={jar.get("fabrik_sidebar")?.value === "collapsed"}
      user={{ name: ctx.user.name, email: ctx.user.email, hue: ctx.user.avatarHue, role: ROLE_LABELS[ctx.role] }}
      org={{ id: ctx.org.id, name: ctx.org.name, isDemo: ctx.org.isDemo && demoMode() }}
      orgs={accessibleOrgs(ctx.user).map((o) => ({ id: o.id, name: o.name }))}
      notifications={notificationsFor(ctx).map((n) => ({ id: n.id, title: n.title, body: n.body, href: n.href, kind: n.kind, read: n.read, at: prettyDateTime(n.updatedAt) }))}
      sync={conn ? { status: conn.status, at: conn.lastSyncAt ? prettyDateTime(conn.lastSyncAt) : undefined } : undefined}
      isStaff={ctx.isStaff}
      search={extras}
    >
      {children}
    </Shell>
  );
}
