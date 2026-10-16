import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ID, Organization, Role, Session, User } from "@/lib/types";
import { commit, db } from "@/server/db/store";
import { randomToken, signedValue, verifySigned } from "./crypto";
import { can, ForbiddenError, type Permission } from "./permissions";

export const SESSION_COOKIE = "fabrik_session";
const IDLE_MS = 2 * 60 * 60 * 1000; // 2h idle timeout
const ABSOLUTE_MS = 12 * 60 * 60 * 1000; // 12h absolute lifetime

export interface Ctx {
  user: User;
  session: Session;
  org: Organization;
  role: Role;
  isStaff: boolean;
}

/** Tenant isolation: the role a user holds in an organization, or null when they have no access. */
export function roleInOrg(user: User, orgId: ID): Role | null {
  const data = db();
  if (user.status !== "active") return null;
  if (user.staffRole === "fabrik_admin") return data.organizations.some((o) => o.id === orgId) ? "fabrik_admin" : null;
  if (user.staffRole) {
    const org = data.organizations.find((o) => o.id === orgId);
    if (!org) return null;
    const assigned = org.assignedBookkeeperId === user.id || org.assignedReviewerId === user.id || org.dedicatedAccountantId === user.id;
    return assigned ? user.staffRole : null;
  }
  const m = data.memberships.find((x) => x.userId === user.id && x.orgId === orgId);
  return m ? m.role : null;
}

export function accessibleOrgs(user: User): Organization[] {
  return db()
    .organizations.filter((o) => roleInOrg(user, o.id))
    .sort((a, b) => (a.isDemo === b.isDemo ? a.name.localeCompare(b.name) : a.isDemo ? -1 : 1));
}

export async function createSession(user: User, opts: { mfaPending: boolean }): Promise<Session> {
  const data = db();
  const nowMs = Date.now();
  const h = await headers();
  const session: Session = {
    id: randomToken(24),
    userId: user.id,
    activeOrgId: accessibleOrgs(user)[0]?.id,
    mfaPending: opts.mfaPending,
    createdAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + ABSOLUTE_MS).toISOString(),
    lastSeenAt: new Date(nowMs).toISOString(),
    userAgent: h.get("user-agent")?.slice(0, 200) ?? undefined,
  };
  // Session fixation defence: a fresh id on every sign-in; prune this user's expired sessions.
  data.sessions = data.sessions.filter((s) => s.userId !== user.id || Date.parse(s.expiresAt) > nowMs);
  data.sessions.push(session);
  commit();
  const jar = await cookies();
  jar.set(SESSION_COOKIE, signedValue(session.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ABSOLUTE_MS / 1000,
  });
  return session;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const id = verifySigned(jar.get(SESSION_COOKIE)?.value);
  if (id) {
    const data = db();
    data.sessions = data.sessions.filter((s) => s.id !== id);
    commit();
  }
  jar.delete(SESSION_COOKIE);
}

export async function currentSession(): Promise<{ session: Session; user: User } | null> {
  const jar = await cookies();
  const id = verifySigned(jar.get(SESSION_COOKIE)?.value);
  if (!id) return null;
  const data = db();
  const session = data.sessions.find((s) => s.id === id);
  if (!session) return null;
  const nowMs = Date.now();
  if (Date.parse(session.expiresAt) < nowMs || nowMs - Date.parse(session.lastSeenAt) > IDLE_MS) {
    data.sessions = data.sessions.filter((s) => s.id !== id);
    commit();
    return null;
  }
  const user = data.users.find((u) => u.id === session.userId);
  if (!user || user.status !== "active") return null;
  if (nowMs - Date.parse(session.lastSeenAt) > 60_000) {
    session.lastSeenAt = new Date(nowMs).toISOString();
    commit();
  }
  return { session, user };
}

export async function getCtx(): Promise<Ctx | null> {
  const cur = await currentSession();
  if (!cur || cur.session.mfaPending) return null;
  const { session, user } = cur;
  let orgId = session.activeOrgId;
  let role = orgId ? roleInOrg(user, orgId) : null;
  if (!role) {
    orgId = accessibleOrgs(user)[0]?.id;
    role = orgId ? roleInOrg(user, orgId) : null;
    if (!orgId || !role) return null;
    session.activeOrgId = orgId;
    commit();
  }
  const org = db().organizations.find((o) => o.id === orgId)!;
  return { user, session, org, role, isStaff: Boolean(user.staffRole) };
}

/** For pages and layouts: redirects to sign-in when there is no fully authenticated session. */
export async function requireCtx(): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) {
    const cur = await currentSession();
    redirect(cur?.session.mfaPending ? "/login/mfa" : "/login");
  }
  return ctx;
}

/** For server actions and route handlers. Throws instead of redirecting. */
export async function authorize(permission: Permission): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) throw new ForbiddenError("authenticated");
  if (!can(ctx.role, permission)) throw new ForbiddenError(permission);
  return ctx;
}

export function hasPerm(ctx: Ctx, permission: Permission): boolean {
  return can(ctx.role, permission);
}

// ─── Login throttling (per email + IP, in memory) ──────────────────────────────

const attempts = new Map<string, { count: number; first: number }>();
const WINDOW = 15 * 60 * 1000;
const MAX_ATTEMPTS = 6;

export function throttleKey(email: string, ip: string): string {
  return `${email.toLowerCase()}|${ip}`;
}

export function isThrottled(key: string): boolean {
  const a = attempts.get(key);
  if (!a) return false;
  if (Date.now() - a.first > WINDOW) {
    attempts.delete(key);
    return false;
  }
  return a.count >= MAX_ATTEMPTS;
}

export function recordFailure(key: string): void {
  const a = attempts.get(key);
  if (!a || Date.now() - a.first > WINDOW) attempts.set(key, { count: 1, first: Date.now() });
  else a.count += 1;
}

export function clearFailures(key: string): void {
  attempts.delete(key);
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}
