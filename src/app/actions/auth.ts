"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { commit, db } from "@/server/db/store";
import { newId } from "@/server/db/ids";
import { checkPasswordPolicy, hashPassword, verifyPassword } from "@/server/auth/password";
import { decrypt, encrypt, randomToken, sha256 } from "@/server/auth/crypto";
import { generateSecret, otpauthUri, verifyTotp } from "@/server/auth/totp";
import { clearFailures, clientIp, createSession, currentSession, destroySession, getCtx, isThrottled, recordFailure, roleInOrg, throttleKey } from "@/server/auth/session";
import { recordAudit } from "@/server/services/audit";
import { sendEmail } from "@/server/services/notifications";
import type { ActionResult } from "@/server/action";

const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });
const DUMMY_HASH = "scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export async function signIn(_: unknown, form: FormData): Promise<{ error?: string }> {
  const parsed = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "Enter your email and password." };
  const ip = await clientIp();
  const key = throttleKey(parsed.data.email, ip);
  if (isThrottled(key)) return { error: "Too many attempts. Wait 15 minutes or reset your password." };
  const user = db().users.find((u) => u.email === parsed.data.email);
  // Always run a hash comparison so response time doesn't reveal whether the account exists.
  const ok = verifyPassword(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || user.status !== "active") {
    recordFailure(key);
    recordAudit(null, { action: "auth.login_failed", entity: { type: "user", id: user?.id ?? "unknown", label: parsed.data.email }, ip }, { type: "system", id: "auth", name: "Authentication" });
    commit();
    return { error: "That email and password don't match an active account." };
  }
  clearFailures(key);
  await createSession(user, { mfaPending: user.mfaEnabled });
  user.lastLoginAt = new Date().toISOString();
  recordAudit(null, { action: user.mfaEnabled ? "auth.password_verified" : "auth.login", entity: { type: "user", id: user.id, label: user.email }, ip }, { type: "user", id: user.id, name: user.name });
  commit();
  const next = String(form.get("next") ?? "");
  redirect(user.mfaEnabled ? "/login/mfa" : next.startsWith("/") && !next.startsWith("//") ? next : user.staffRole ? "/ops" : "/");
}

export async function verifyMfa(_: unknown, form: FormData): Promise<{ error?: string }> {
  const cur = await currentSession();
  if (!cur?.session.mfaPending) redirect("/login");
  const code = String(form.get("code") ?? "");
  const ip = await clientIp();
  const key = throttleKey(`${cur.user.email}:mfa`, ip);
  if (isThrottled(key)) return { error: "Too many attempts. Sign in again in 15 minutes." };
  if (!cur.user.mfaSecretEnc || !verifyTotp(decrypt(cur.user.mfaSecretEnc), code)) {
    recordFailure(key);
    return { error: "That code didn't work. Codes refresh every 30 seconds." };
  }
  clearFailures(key);
  cur.session.mfaPending = false;
  recordAudit(null, { action: "auth.mfa_verified", entity: { type: "user", id: cur.user.id, label: cur.user.email }, ip }, { type: "user", id: cur.user.id, name: cur.user.name });
  commit();
  redirect(cur.user.staffRole ? "/ops" : "/");
}

export async function signOut() {
  const cur = await currentSession();
  if (cur) recordAudit(null, { action: "auth.logout", entity: { type: "user", id: cur.user.id, label: cur.user.email } }, { type: "user", id: cur.user.id, name: cur.user.name });
  await destroySession();
  redirect("/login");
}

export async function requestPasswordReset(_: unknown, form: FormData): Promise<{ sent?: boolean; error?: string }> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };
  const user = db().users.find((u) => u.email === email && u.status !== "disabled");
  if (user) {
    const token = randomToken(32);
    db().resetTokens.push({ id: newId("rst"), userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() });
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
    sendEmail(user.email, "Reset your Fabrik Finance password", `Use this link within 1 hour to choose a new password:\n${origin}/reset-password?token=${token}\n\nIf you didn't ask for this, you can ignore this email.`);
    recordAudit(null, { action: "auth.password_reset_requested", entity: { type: "user", id: user.id, label: email } });
    commit();
  }
  // Same response whether or not the account exists.
  return { sent: true };
}

export async function resetPassword(_: unknown, form: FormData): Promise<{ error?: string; problems?: string[] }> {
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const data = db();
  const rec = data.resetTokens.find((t) => t.tokenHash === sha256(token) && !t.usedAt && Date.parse(t.expiresAt) > Date.now());
  if (!rec) return { error: "This link has expired or was already used. Request a new one." };
  if (password !== confirm) return { error: "The passwords don't match." };
  const policy = checkPasswordPolicy(password);
  if (!policy.ok) return { error: "Choose a stronger password.", problems: policy.problems };
  const user = data.users.find((u) => u.id === rec.userId)!;
  user.passwordHash = hashPassword(password);
  if (user.status === "invited") user.status = "active";
  rec.usedAt = new Date().toISOString();
  data.sessions = data.sessions.filter((s) => s.userId !== user.id);
  recordAudit(null, { action: "auth.password_reset", entity: { type: "user", id: user.id, label: user.email } }, { type: "user", id: user.id, name: user.name });
  commit();
  redirect("/login?reset=1");
}

export async function switchOrg(orgId: string): Promise<ActionResult> {
  const ctx = await getCtx();
  if (!ctx) return { ok: false, error: "Sign in again." };
  if (!roleInOrg(ctx.user, orgId)) return { ok: false, error: "You don't have access to that organization." };
  ctx.session.activeOrgId = orgId;
  recordAudit(ctx, { orgId, action: "auth.organization_switched", entity: { type: "organization", id: orgId } });
  commit();
  return { ok: true };
}

export async function beginMfaEnrollment(): Promise<ActionResult<{ secret: string; qr: string }>> {
  const ctx = await getCtx();
  if (!ctx) return { ok: false, error: "Sign in again." };
  if (ctx.user.mfaEnabled) return { ok: false, error: "Two-factor authentication is already on." };
  const secret = generateSecret();
  const QR = await import("qrcode");
  const qr = await QR.toDataURL(otpauthUri(secret, ctx.user.email), { margin: 1, width: 192, color: { dark: "#161a17", light: "#ffffff" } });
  ctx.user.mfaSecretEnc = encrypt(secret);
  commit();
  return { ok: true, data: { secret, qr } };
}

export async function confirmMfaEnrollment(code: string): Promise<ActionResult> {
  const ctx = await getCtx();
  if (!ctx?.user.mfaSecretEnc) return { ok: false, error: "Start setup again." };
  if (!verifyTotp(decrypt(ctx.user.mfaSecretEnc), code)) return { ok: false, error: "That code didn't match. Check your authenticator app's clock." };
  ctx.user.mfaEnabled = true;
  recordAudit(ctx, { orgId: ctx.org.id, action: "auth.mfa_enabled", entity: { type: "user", id: ctx.user.id, label: ctx.user.email } });
  commit();
  return { ok: true, message: "Two-factor authentication is on." };
}

export async function disableMfa(code: string): Promise<ActionResult> {
  const ctx = await getCtx();
  if (!ctx?.user.mfaEnabled || !ctx.user.mfaSecretEnc) return { ok: false, error: "MFA isn't enabled." };
  if (!verifyTotp(decrypt(ctx.user.mfaSecretEnc), code)) return { ok: false, error: "Enter a current code to turn MFA off." };
  ctx.user.mfaEnabled = false;
  ctx.user.mfaSecretEnc = undefined;
  recordAudit(ctx, { orgId: ctx.org.id, action: "auth.mfa_disabled", entity: { type: "user", id: ctx.user.id, label: ctx.user.email } });
  commit();
  return { ok: true, message: "Two-factor authentication is off." };
}

export async function updateMyProfile(name: string, title: string, prefs: { email: boolean; inApp: boolean; digest: "realtime" | "daily" | "weekly" }): Promise<ActionResult> {
  const ctx = await getCtx();
  if (!ctx) return { ok: false, error: "Sign in again." };
  if (!name.trim()) return { ok: false, error: "Name is required." };
  ctx.user.name = name.trim().slice(0, 80);
  ctx.user.title = title.trim().slice(0, 80);
  ctx.user.notificationPrefs = prefs;
  commit();
  revalidatePath("/", "layout");
  return { ok: true, message: "Profile saved." };
}
