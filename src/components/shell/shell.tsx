"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import {
  Bell, BookOpen, Building2, CalendarCheck, Calculator, ChartLine, Check, ChevronsUpDown, ClipboardCheck, FileText, Gauge, HandCoins, House, Inbox, Landmark, ListChecks, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Plug, Receipt, RefreshCw, Scale, ScrollText, Search, Settings, ShieldCheck, Sparkles, SquareKanban, Users, X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Wordmark, LogoMark } from "@/components/brand";
import { Avatar, Badge, Kbd } from "@/components/ui/primitives";
import { Popover, useToast } from "@/components/ui/client";
import { switchOrg, signOut } from "@/app/actions/auth";
import { readNotifications } from "@/app/actions/app";
import { CommandPalette } from "./command-palette";
import { AskLauncher } from "@/components/ask/ask-panel";

const ICONS: Record<string, typeof House> = {
  home: House, inbox: Inbox, books: BookOpen, scale: Scale, close: CalendarCheck, bills: Receipt, collect: HandCoins, funding: Landmark, cfo: ChartLine, ask: Sparkles, documents: FileText, tax: Calculator, integrations: Plug, settings: Settings, ops: Gauge, queue: SquareKanban, review: ListChecks, clients: Building2, admin: ShieldCheck, requirements: ScrollText, team: Users, audit: ClipboardCheck,
};

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  badge?: number;
  tag?: string;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
  staff?: boolean;
}

interface Props {
  children: ReactNode;
  groups: NavGroup[];
  collapsed: boolean;
  user: { name: string; email: string; hue: number; role: string };
  org: { id: string; name: string; isDemo: boolean };
  orgs: { id: string; name: string }[];
  notifications: { id: string; title: string; body?: string; href?: string; kind: string; read: boolean; at: string }[];
  sync?: { status: string; at?: string };
  isStaff: boolean;
  /** Global search and the Ctrl K palette (SHOW_EXTRAS). */
  search: boolean;
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/ops") return pathname === "/ops";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Shell({ children, groups, collapsed: initialCollapsed, user, org, orgs, notifications, sync, isStaff, search }: Props) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    if (!search) return;
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [search]);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `fabrik_sidebar=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
  };

  const nav = (compact: boolean) => (
    <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-4">
      {groups.map((g) => (
        <div key={g.label} className={cn("mt-5 first:mt-2", g.staff && "pt-4 border-t border-line")}>
          {!compact && <div className={cn("px-2.5 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.09em]", g.staff ? "text-ai-600" : "text-subtle")}>{g.label}</div>}
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const Icon = ICONS[it.icon] ?? House;
              const active = isActive(pathname, it.href);
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    title={compact ? it.label : undefined}
                    aria-current={active ? "page" : undefined}
                    className={cn("group flex items-center gap-2.5 rounded-lg h-9 text-[13.5px] transition-colors", compact ? "justify-center px-0" : "px-2.5", active ? "bg-brand-50 text-brand-800 font-medium" : "text-ink-2 hover:bg-sunken hover:text-ink")}
                  >
                    <Icon className={cn("size-[18px] shrink-0", active ? "text-brand-600" : "text-muted group-hover:text-ink-2")} />
                    {!compact && <span className="truncate flex-1">{it.label}</span>}
                    {!compact && it.tag && <span className="text-[10px] font-semibold uppercase tracking-wide text-ai-600 bg-ai-50 rounded px-1.5 py-0.5">{it.tag}</span>}
                    {it.badge ? (
                      compact ? (
                        <span className="absolute ml-5 -mt-5 size-2 rounded-full bg-risk-600" />
                      ) : (
                        <span className="min-w-5 h-5 px-1.5 rounded-full bg-risk-600 text-white text-[11px] font-semibold flex items-center justify-center tabular">{it.badge}</span>
                      )
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <aside className={cn("no-print hidden lg:flex fixed inset-y-0 left-0 z-40 flex-col bg-surface border-r border-line transition-[width] duration-200", collapsed ? "w-[68px]" : "w-[248px]")}>
        <div className={cn("h-16 flex items-center shrink-0", collapsed ? "justify-center" : "px-5")}>
          <Link href="/" aria-label="Fabrik Finance home">{collapsed ? <LogoMark /> : <Wordmark />}</Link>
        </div>
        {nav(collapsed)}
        <div className="border-t border-line p-3">
          <button onClick={toggle} className={cn("flex items-center gap-2 w-full h-9 rounded-lg text-[13px] text-muted hover:bg-sunken hover:text-ink", collapsed ? "justify-center" : "px-2.5")} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
            {!collapsed && "Collapse"}
          </button>
        </div>
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-[65]">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setMobileOpen(false)} />
          <aside className="animate-in absolute inset-y-0 left-0 w-[280px] bg-surface flex flex-col shadow-[var(--shadow-pop)]">
            <div className="h-16 flex items-center justify-between px-5">
              <Wordmark />
              <button onClick={() => setMobileOpen(false)} className="size-9 rounded-lg hover:bg-sunken flex items-center justify-center" aria-label="Close menu">
                <X className="size-5" />
              </button>
            </div>
            {nav(false)}
          </aside>
        </div>
      )}

      <div className={cn("transition-[padding] duration-200", collapsed ? "lg:pl-[68px]" : "lg:pl-[248px]")}>
        <header className="no-print sticky top-0 z-30 h-16 bg-canvas/85 backdrop-blur-md border-b border-line/70">
          <div className="h-full flex items-center gap-2 px-4 sm:px-6 lg:px-8">
            <button onClick={() => setMobileOpen(true)} className="lg:hidden size-9 -ml-1 rounded-lg hover:bg-sunken flex items-center justify-center" aria-label="Open menu">
              <Menu className="size-5" />
            </button>
            <OrgSwitcher org={org} orgs={orgs} />
            {search && <button onClick={() => setPaletteOpen(true)} className="ml-1 hidden md:flex items-center gap-2 h-9 w-[min(34vw,360px)] rounded-lg border border-line bg-surface px-3 text-[13px] text-subtle hover:border-line-strong transition" aria-label="Search">
              <Search className="size-4" />
              <span className="flex-1 text-left truncate">Search everything…</span>
              <Kbd>Ctrl K</Kbd>
            </button>}
            <div className="flex-1" />
            {sync && (
              <Link href="/integrations" className={cn("hidden xl:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[12px]", sync.status === "connected" ? "text-muted hover:bg-sunken" : "text-crit-600 bg-crit-50")} title="QuickBooks Online sync">
                <RefreshCw className="size-3.5" />
                {sync.status === "connected" ? `QuickBooks synced ${sync.at ?? ""}` : "QuickBooks needs attention"}
              </Link>
            )}
            {search && (
              <button onClick={() => setPaletteOpen(true)} className="md:hidden size-9 rounded-lg hover:bg-sunken flex items-center justify-center" aria-label="Search">
                <Search className="size-[18px]" />
              </button>
            )}
            <Notifications items={notifications} />
            <UserMenu user={user} isStaff={isStaff} />
          </div>
        </header>
        <main id="main" className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-[1440px] mx-auto">{children}</main>
      </div>
      {search && <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />}
      {pathname !== "/ask" && <AskLauncher />}
    </div>
  );
}

function OrgSwitcher({ org, orgs }: { org: Props["org"]; orgs: Props["orgs"] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  if (orgs.length <= 1)
    return (
      <div className="flex items-center gap-2 h-9 px-2.5 rounded-lg text-[13.5px] font-medium min-w-0">
        <Building2 className="size-4 text-muted shrink-0" />
        <span className="truncate">{org.name}</span>
        {org.isDemo && <Badge tone="brand">Demo</Badge>}
      </div>
    );
  const list = orgs.filter((o) => o.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Popover
      align="left"
      width={320}
      label="Switch organization"
      trigger={({ toggle, open }) => (
        <button onClick={toggle} aria-expanded={open} className="flex items-center gap-2 h-9 pl-2.5 pr-2 rounded-lg text-[13.5px] font-medium hover:bg-sunken min-w-0 max-w-[50vw] md:max-w-[260px]">
          <Building2 className="size-4 text-muted shrink-0" />
          <span className="truncate">{org.name}</span>
          {org.isDemo && <Badge tone="brand" className="hidden sm:inline-flex">Demo</Badge>}
          <ChevronsUpDown className={cn("size-3.5 text-muted shrink-0", pending && "animate-pulse")} />
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="p-2 border-b border-line">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${orgs.length} organizations`} className="w-full h-8 px-2.5 rounded-md bg-sunken text-[13px] outline-none" />
          </div>
          <div className="max-h-80 overflow-y-auto p-1">
            {list.map((o) => (
              <button
                key={o.id}
                role="menuitem"
                onClick={() =>
                  start(async () => {
                    const r = await switchOrg(o.id);
                    close();
                    if (!r.ok) toast({ tone: "error", title: r.error });
                    else router.refresh();
                  })
                }
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-sunken"
              >
                <div className="min-w-0 flex-1 text-[13px] font-medium truncate">{o.name}</div>
                {o.id === org.id && <Check className="size-4 text-brand-600" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </Popover>
  );
}

function Notifications({ items }: { items: Props["notifications"] }) {
  const router = useRouter();
  const unread = items.filter((n) => !n.read).length;
  return (
    <Popover
      width={380}
      label="Notifications"
      trigger={({ toggle, open }) => (
        <button onClick={toggle} aria-expanded={open} className="relative size-9 rounded-lg hover:bg-sunken flex items-center justify-center" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
          <Bell className="size-[18px] text-ink-2" />
          {unread > 0 && <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 rounded-full bg-risk-600 text-white text-[10px] font-semibold flex items-center justify-center">{unread}</span>}
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between px-4 py-3 border-b border-line">
            <div className="text-[14px] font-semibold">Notifications</div>
            {unread > 0 && (
              <button className="text-[12px] text-brand-700 hover:underline" onClick={async () => { await readNotifications("all"); router.refresh(); }}>
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {items.length === 0 && <div className="px-4 py-10 text-center text-[13px] text-muted">You&apos;re all caught up.</div>}
            {items.map((n) => (
              <Link
                key={n.id}
                href={n.href ?? "#"}
                onClick={() => {
                  close();
                  if (!n.read) void readNotifications([n.id]);
                }}
                className="flex gap-3 px-4 py-3 border-b border-line last:border-0 hover:bg-surface-2"
              >
                <span className={cn("mt-1.5 size-2 rounded-full shrink-0", n.read ? "bg-transparent" : "bg-brand-500")} />
                <div className="min-w-0">
                  <div className={cn("text-[13px]", n.read ? "text-ink-2" : "font-semibold text-ink")}>{n.title}</div>
                  {n.body && <div className="text-[12.5px] text-muted mt-0.5 line-clamp-2">{n.body}</div>}
                  <div className="text-[11.5px] text-subtle mt-1">{n.at} UTC</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </Popover>
  );
}

function UserMenu({ user, isStaff }: { user: Props["user"]; isStaff: boolean }) {
  return (
    <Popover
      width={260}
      label="Account"
      trigger={({ toggle, open }) => (
        <button onClick={toggle} aria-expanded={open} className="flex items-center gap-2 h-9 pl-1 pr-2 rounded-lg hover:bg-sunken" aria-label="Account menu">
          <Avatar name={user.name} hue={user.hue} />
          <span className="hidden sm:block text-left leading-tight">
            <span className="block text-[13px] font-medium max-w-[140px] truncate">{user.name}</span>
            <span className="block text-[11px] text-muted max-w-[140px] truncate">{user.role}</span>
          </span>
        </button>
      )}
    >
      {() => (
        <div>
          <div className="px-4 py-3 border-b border-line">
            <div className="text-[13.5px] font-semibold">{user.name}</div>
            <div className="text-[12px] text-muted">{user.email}</div>
            <Badge tone={isStaff ? "ai" : "brand"} className="mt-2">{user.role}</Badge>
          </div>
          <div className="p-1">
            <Link href="/settings?tab=profile" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] hover:bg-sunken">
              <Settings className="size-4 text-muted" /> Profile & security
            </Link>
            <form action={signOut}>
              <button type="submit" className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] hover:bg-sunken text-left">
                <LogOut className="size-4 text-muted" /> Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </Popover>
  );
}
