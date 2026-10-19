"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ComponentProps, type ReactNode } from "react";
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

/**
 * Prefetches the full page (data and code) once the pointer or focus shows intent, so the click
 * renders without waiting for the server. Before that, Link prefetches only the loading state.
 */
function IntentLink(props: ComponentProps<typeof Link>) {
  const [intent, setIntent] = useState(false);
  const show = () => setIntent(true);
  return <Link {...props} prefetch={intent ? true : null} onMouseEnter={show} onFocus={show} onTouchStart={show} />;
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
    <nav aria-label="Main" className="flex-1 overflow-y-auto no-scrollbar px-3 pb-4">
      {groups.map((g) => (
        <div key={g.label} className={cn("mt-5 first:mt-1", g.staff && "mt-6 pt-5 border-t border-dashed border-line-strong")}>
          {!compact && (
            <div className={cn("px-3 mb-1.5 h-6 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em]", g.staff ? "text-ai-600" : "text-subtle")}>
              {g.staff && <span className="size-1.5 rounded-full bg-ai-500" aria-hidden />}
              {g.label}
            </div>
          )}
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const Icon = ICONS[it.icon] ?? House;
              const active = isActive(pathname, it.href);
              return (
                <li key={it.href}>
                  <IntentLink
                    href={it.href}
                    title={compact ? it.label : undefined}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-full h-10 text-[13.5px] transition-[background-color,color,box-shadow] duration-150",
                      compact ? "justify-center px-0" : "px-3.5",
                      active ? "bg-brand-700 text-white font-medium shadow-[0_6px_16px_-6px_rgba(28,34,48,.45)]" : "text-ink-2 hover:bg-surface/80 hover:text-ink",
                    )}
                  >
                    <Icon className={cn("size-[18px] shrink-0 transition-colors", active ? "text-white" : "text-muted group-hover:text-ink")} />
                    {!compact && <span className="truncate flex-1">{it.label}</span>}
                    {!compact && it.tag && <span className="text-[10px] font-semibold uppercase tracking-wide text-ai-600 bg-ai-50 rounded-full px-2 py-0.5">{it.tag}</span>}
                    {it.badge ? (
                      compact ? (
                        <span className="absolute top-2 right-3 size-2 rounded-full bg-accent-600 ring-2 ring-canvas" />
                      ) : (
                        <span className="min-w-5 h-5 px-1.5 rounded-full text-[11px] font-semibold flex items-center justify-center tabular bg-accent-600 text-white">{it.badge}</span>
                      )
                    ) : null}
                  </IntentLink>
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
      <aside className={cn("no-print hidden lg:flex fixed inset-y-0 left-0 z-40 flex-col bg-canvas transition-[width] duration-200", collapsed ? "w-[72px]" : "w-[260px]")}>
        <div className={cn("h-[72px] flex items-center shrink-0", collapsed ? "justify-center" : "px-6")}>
          <Link href="/" aria-label="Fabrik Finance home" className="rounded-lg">{collapsed ? <LogoMark /> : <Wordmark />}</Link>
        </div>
        {nav(collapsed)}
        <div className="p-3">
          <button onClick={toggle} className={cn("flex items-center gap-2 w-full h-10 rounded-full text-[13px] text-muted hover:bg-surface/80 hover:text-ink transition-colors", collapsed ? "justify-center" : "px-3.5")} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
            {!collapsed && "Collapse"}
          </button>
        </div>
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-[65]">
          <div className="animate-backdrop absolute inset-0 bg-brand-900/30 backdrop-blur-[3px]" onClick={() => setMobileOpen(false)} />
          <aside className="animate-in absolute inset-y-0 left-0 w-[288px] max-w-[85vw] bg-canvas flex flex-col shadow-[var(--shadow-pop)] rounded-r-[28px]">
            <div className="h-16 flex items-center justify-between px-5">
              <Wordmark />
              <button onClick={() => setMobileOpen(false)} className="size-10 rounded-full bg-surface/80 hover:bg-surface flex items-center justify-center" aria-label="Close menu">
                <X className="size-5" />
              </button>
            </div>
            {nav(false)}
          </aside>
        </div>
      )}

      <div className={cn("transition-[padding] duration-200", collapsed ? "lg:pl-[72px]" : "lg:pl-[260px]")}>
        <header className="no-print sticky top-0 z-30 h-[72px] bg-canvas/85 backdrop-blur-xl backdrop-saturate-150">
          <div className="h-full flex items-center gap-2 px-4 sm:px-6 lg:px-8">
            <button onClick={() => setMobileOpen(true)} className="lg:hidden size-10 -ml-1 rounded-full bg-surface/80 hover:bg-surface flex items-center justify-center" aria-label="Open menu">
              <Menu className="size-5" />
            </button>
            <OrgSwitcher org={org} orgs={orgs} />
            {search && <button onClick={() => setPaletteOpen(true)} className="ml-1 hidden md:flex items-center gap-2 h-10 w-[min(34vw,380px)] rounded-full border border-line-strong/70 bg-surface/70 pl-4 pr-3 text-[13px] text-subtle hover:bg-surface hover:border-line-strong transition" aria-label="Search">
              <span className="flex-1 text-left truncate">Search everything…</span>
              <Kbd>Ctrl K</Kbd>
              <Search className="size-4 text-ink-2" />
            </button>}
            <div className="flex-1" />
            {sync && (
              <Link href="/integrations" className={cn("hidden xl:inline-flex items-center gap-2 h-10 px-4 rounded-full text-[12.5px] transition-colors", sync.status === "connected" ? "text-ink-2 bg-surface/70 border border-line-strong/70 hover:bg-surface" : "text-crit-600 bg-crit-50 ring-1 ring-inset ring-crit-100")} title="QuickBooks Online sync">
                {sync.status === "connected" ? <span className="relative flex size-2"><span className="absolute inset-0 rounded-full bg-ok-600/40 animate-ping [animation-duration:2.5s]" /><span className="relative size-2 rounded-full bg-ok-600" /></span> : <RefreshCw className="size-3.5" />}
                {sync.status === "connected" ? `QuickBooks synced ${sync.at ?? ""}` : "QuickBooks needs attention"}
              </Link>
            )}
            {search && (
              <button onClick={() => setPaletteOpen(true)} className="md:hidden size-10 rounded-full bg-surface/70 border border-line-strong/70 hover:bg-surface flex items-center justify-center" aria-label="Search">
                <Search className="size-[18px]" />
              </button>
            )}
            <Notifications items={notifications} />
            <UserMenu user={user} isStaff={isStaff} />
          </div>
        </header>
        {/* Extra bottom space keeps the floating Ask Fabrik button from covering the last row of content. */}
        <main id="main" key={pathname} className="animate-page px-4 sm:px-6 lg:px-8 pt-4 lg:pt-6 pb-28 max-w-[1440px] mx-auto">{children}</main>
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
      <div className="flex items-center gap-2 h-10 px-4 rounded-full bg-surface/70 border border-line-strong/70 text-[13.5px] font-medium min-w-0">
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
        <button onClick={toggle} aria-expanded={open} className="flex items-center gap-2 h-10 pl-4 pr-3 rounded-full bg-surface/70 border border-line-strong/70 text-[13.5px] font-medium hover:bg-surface min-w-0 max-w-[50vw] md:max-w-[280px] transition-colors">
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
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${orgs.length} organizations`} className="w-full h-9 px-3.5 rounded-full bg-sunken text-[13px] outline-none focus:ring-2 focus:ring-brand-200" />
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
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left hover:bg-sunken"
              >
                <div className="min-w-0 flex-1 text-[13px] font-medium truncate">{o.name}</div>
                {o.id === org.id && <Check className="size-4 text-accent-600" />}
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
        <button onClick={toggle} aria-expanded={open} className="relative size-10 rounded-full bg-surface/70 border border-line-strong/70 hover:bg-surface flex items-center justify-center transition-colors" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
          <Bell className="size-[18px] text-ink-2" />
          {unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-accent-600 text-white text-[10px] font-semibold flex items-center justify-center ring-2 ring-canvas">{unread}</span>}
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
                <span className={cn("mt-1.5 size-2 rounded-full shrink-0", n.read ? "bg-transparent" : "bg-accent-600")} />
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
        <button onClick={toggle} aria-expanded={open} className="flex items-center gap-2.5 h-10 pl-1 pr-1 sm:pr-4 rounded-full hover:bg-surface/80 transition-colors" aria-label="Account menu">
          <Avatar name={user.name} hue={user.hue} size={36} />
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
            <Link href="/settings?tab=profile" className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] hover:bg-sunken">
              <Settings className="size-4 text-muted" /> Profile & security
            </Link>
            <form action={signOut}>
              <button type="submit" className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] hover:bg-sunken text-left">
                <LogOut className="size-4 text-muted" /> Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </Popover>
  );
}
