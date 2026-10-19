import "server-only";
import type { ClientRole, ID, Organization, StaffRole, TaxDocumentRequest } from "@/lib/types";
import { commit, db, resetDb } from "@/server/db/store";
import { newId } from "@/server/db/ids";
import { hashPassword } from "@/server/auth/password";
import { randomToken, sha256 } from "@/server/auth/crypto";
import { recordAudit } from "./audit";
import { sendEmail } from "./notifications";
import { NotFoundError, ValidationError, reprocessLive } from "./transactions";
import type { Ctx } from "@/server/auth/session";
import { diffDays, today } from "@/lib/dates";

// ─── Team & settings (client) ────────────────────────────────────────────────

export function teamMembers(ctx: Ctx) {
  const data = db();
  return data.memberships
    .filter((m) => m.orgId === ctx.org.id)
    .map((m) => ({ membership: m, user: data.users.find((u) => u.id === m.userId)! }))
    .filter((x) => x.user);
}

export function fabrikTeam(org: Organization) {
  const u = (id?: ID) => (id ? db().users.find((x) => x.id === id) : undefined);
  return { bookkeeper: u(org.assignedBookkeeperId), reviewer: u(org.assignedReviewerId), accountant: u(org.dedicatedAccountantId) };
}

export function inviteMember(ctx: Ctx, email: string, name: string, role: ClientRole, origin: string) {
  const data = db();
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new ValidationError("Enter a valid email address");
  if (!name.trim()) throw new ValidationError("Enter a name");
  let user = data.users.find((u) => u.email === clean);
  if (user?.staffRole) throw new ValidationError("That address belongs to a Fabrik staff account");
  if (user && data.memberships.some((m) => m.userId === user!.id && m.orgId === ctx.org.id)) throw new ValidationError("Already a member of this organization");
  if (!user) {
    user = { id: newId("usr"), email: clean, name: name.trim().slice(0, 80), passwordHash: hashPassword(randomToken(24)), mfaEnabled: false, status: "invited", avatarHue: Math.floor(Math.random() * 360), createdAt: new Date().toISOString(), notificationPrefs: { email: true, inApp: true, digest: "daily" } };
    data.users.push(user);
  }
  data.memberships.push({ id: newId("mem"), userId: user.id, orgId: ctx.org.id, role, invitedBy: ctx.user.id, createdAt: new Date().toISOString() });
  const token = randomToken(32);
  data.resetTokens.push({ id: newId("rst"), userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString() });
  sendEmail(clean, `${ctx.user.name} invited you to ${ctx.org.name} on Fabrik Finance`, `You've been invited as ${role.replace(/_/g, " ")}.\n\nSet your password: ${origin}/reset-password?token=${token}&invite=1\n\nThis link expires in 7 days.`, ctx.org.id);
  recordAudit(ctx, { orgId: ctx.org.id, action: "team.member_invited", entity: { type: "user", id: user.id, label: clean }, after: { role } });
  commit();
  return user;
}

export function changeMemberRole(ctx: Ctx, membershipId: ID, role: ClientRole) {
  const data = db();
  const m = data.memberships.find((x) => x.id === membershipId && x.orgId === ctx.org.id);
  if (!m) throw new NotFoundError("Member not found");
  if (m.role === "business_owner" && role !== "business_owner" && data.memberships.filter((x) => x.orgId === ctx.org.id && x.role === "business_owner").length === 1) throw new ValidationError("An organization needs at least one Business Owner");
  const before = m.role;
  m.role = role;
  recordAudit(ctx, { orgId: ctx.org.id, action: "team.role_changed", entity: { type: "user", id: m.userId }, before: { role: before }, after: { role } });
  commit();
}

export function removeMember(ctx: Ctx, membershipId: ID) {
  const data = db();
  const m = data.memberships.find((x) => x.id === membershipId && x.orgId === ctx.org.id);
  if (!m) throw new NotFoundError("Member not found");
  if (m.userId === ctx.user.id) throw new ValidationError("You can't remove yourself");
  if (m.role === "business_owner" && data.memberships.filter((x) => x.orgId === ctx.org.id && x.role === "business_owner").length === 1) throw new ValidationError("An organization needs at least one Business Owner");
  data.memberships = data.memberships.filter((x) => x.id !== m.id);
  data.sessions = data.sessions.filter((s) => !(s.userId === m.userId && s.activeOrgId === ctx.org.id));
  recordAudit(ctx, { orgId: ctx.org.id, action: "team.member_removed", entity: { type: "user", id: m.userId } });
  commit();
}

export function updateThresholds(ctx: Ctx, autoApprove: number, review: number, largeDollars: number) {
  if (!(autoApprove > review && review >= 0.5 && autoApprove <= 1)) throw new ValidationError("Auto-processing threshold must be above the review threshold (review ≥ 50%)");
  if (!(largeDollars >= 1000)) throw new ValidationError("Large-transaction threshold must be at least $1,000");
  const before = { ...ctx.org.thresholds, large: ctx.org.largeTransactionThreshold };
  ctx.org.thresholds = { autoApprove, review };
  ctx.org.largeTransactionThreshold = Math.round(largeDollars * 100);
  recordAudit(ctx, { orgId: ctx.org.id, action: "settings.ai_thresholds_changed", entity: { type: "organization", id: ctx.org.id }, before, after: { autoApprove, review, large: ctx.org.largeTransactionThreshold } });
  const { autoProcessed } = reprocessLive(ctx, ctx.org.id);
  commit();
  return autoProcessed.length;
}

export function toggleRule(ctx: Ctx, ruleId: ID, active: boolean) {
  const r = db().rules.find((x) => x.id === ruleId && x.orgId === ctx.org.id);
  if (!r) throw new NotFoundError("Rule not found");
  r.active = active;
  recordAudit(ctx, { orgId: ctx.org.id, action: active ? "rule.enabled" : "rule.disabled", entity: { type: "rule", id: r.id, label: r.label } });
  commit();
}

// ─── Fabrik admin ────────────────────────────────────────────────────────────

export function adminOverview() {
  const data = db();
  return {
    orgs: data.organizations,
    staff: data.users.filter((u) => u.staffRole),
    riskRules: data.riskRules,
    outbox: [...data.outbox].reverse().slice(0, 50),
  };
}

export function adminUpdateOrg(ctx: Ctx, orgId: ID, patch: Partial<Pick<Organization, "plan" | "status" | "assignedBookkeeperId" | "assignedReviewerId" | "dedicatedAccountantId" | "closeFrequency">>) {
  const org = db().organizations.find((o) => o.id === orgId);
  if (!org) throw new NotFoundError("Organization not found");
  const before = { plan: org.plan, status: org.status, bookkeeper: org.assignedBookkeeperId, reviewer: org.assignedReviewerId, accountant: org.dedicatedAccountantId, frequency: org.closeFrequency };
  Object.assign(org, patch);
  recordAudit(ctx, { orgId, action: "admin.organization_updated", entity: { type: "organization", id: orgId, label: org.name }, before, after: patch });
  commit();
}

export function adminSetStaffRole(ctx: Ctx, userId: ID, role: StaffRole | "disabled") {
  const u = db().users.find((x) => x.id === userId && x.staffRole);
  if (!u) throw new NotFoundError("Staff user not found");
  if (u.id === ctx.user.id) throw new ValidationError("You can't change your own role");
  const before = { role: u.staffRole, status: u.status };
  if (role === "disabled") {
    u.status = "disabled";
    db().sessions = db().sessions.filter((s) => s.userId !== u.id);
  } else {
    u.staffRole = role;
    u.status = "active";
  }
  recordAudit(ctx, { action: "admin.staff_role_changed", entity: { type: "user", id: u.id, label: u.email }, before, after: { role } });
  commit();
}

export function adminToggleRiskRule(ctx: Ctx, key: string, enabled: boolean) {
  const r = db().riskRules.find((x) => x.key === key);
  if (!r) throw new NotFoundError("Risk rule not found");
  r.enabled = enabled;
  recordAudit(ctx, { action: enabled ? "admin.risk_rule_enabled" : "admin.risk_rule_disabled", entity: { type: "risk_rule", id: key, label: r.label } });
  commit();
}

export function adminResetDemo(ctx: Ctx) {
  const actor = { id: ctx.user.id, name: ctx.user.name };
  resetDb();
  recordAudit(null, { action: "admin.demo_reset", entity: { type: "system", id: "demo" } }, { type: "user", id: actor.id, name: actor.name, role: "fabrik_admin" });
  commit();
}

// ─── Tax & Credits (Proposed — Fondo-inspired; tracking only, no filing) ────

export function taxWorkspace(ctx: Ctx) {
  const data = db();
  const d = today();
  const deadlines = data.taxDeadlines.filter((t) => t.orgId === ctx.org.id).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((t) => ({ ...t, daysUntil: diffDays(t.dueDate, d) }));
  const requests = data.taxRequests.filter((t) => t.orgId === ctx.org.id).map((r) => ({ ...r, document: data.documents.find((x) => x.id === r.documentId) }));
  const order: TaxDocumentRequest["status"][] = ["requested", "received", "cpa_reviewed", "client_approved", "filed"];
  const progress = requests.length ? requests.reduce((s, r) => s + order.indexOf(r.status), 0) / (requests.length * (order.length - 1)) : 0;
  return { deadlines, requests, readiness: Math.min(1, progress), cpa: data.memberships.filter((m) => m.orgId === ctx.org.id && m.role === "external_accountant").map((m) => data.users.find((u) => u.id === m.userId)!) };
}

export function updateTaxRequest(ctx: Ctx, id: ID, status: TaxDocumentRequest["status"], comment?: string, documentId?: ID) {
  const r = db().taxRequests.find((x) => x.id === id && x.orgId === ctx.org.id);
  if (!r) throw new NotFoundError("Request not found");
  const order: TaxDocumentRequest["status"][] = ["requested", "received", "cpa_reviewed", "client_approved", "filed"];
  const from = order.indexOf(r.status);
  const to = order.indexOf(status);
  // Steps move forward one at a time; staff may step back one to correct a mistake.
  if (!(to === from + 1 || (ctx.isStaff && to === from - 1))) throw new ValidationError("Tax items move one step at a time");
  const cpaOrStaff = ctx.role === "external_accountant" || ctx.isStaff;
  const client = ctx.role === "business_owner" || ctx.role === "client_finance_user";
  if ((status === "cpa_reviewed" || status === "filed") && !cpaOrStaff) throw new ValidationError("Only the CPA or Fabrik staff can do that");
  if (status === "client_approved" && !client) throw new ValidationError("A Business Owner or Client Finance User approves tax documents");
  if (documentId && !db().documents.some((d) => d.id === documentId && d.orgId === ctx.org.id)) throw new ValidationError("Invalid document");
  r.status = status;
  if (documentId) r.documentId = documentId;
  r.history.push({ status, userId: ctx.user.id, at: new Date().toISOString(), comment });
  recordAudit(ctx, { orgId: ctx.org.id, action: `tax.request_${status}`, entity: { type: "tax_request", id: r.id, label: r.title }, comment });
  commit();
}

export interface RdAnswers {
  newProcess: boolean;
  technicalUncertainty: boolean;
  experimentation: boolean;
  scienceBased: boolean;
  qualifiedSpend: boolean;
}

/** R&D credit screener: surfaces *indicators* only. Calculation and filing are a restricted future capability. */
export function rdScreener(a: RdAnswers) {
  const tests = [
    { key: "newProcess", label: "Developing a new or improved product, process or technique (permitted purpose)", met: a.newProcess },
    { key: "technicalUncertainty", label: "Uncertainty about capability, method or design at the outset", met: a.technicalUncertainty },
    { key: "experimentation", label: "A process of experimentation (trials, test plots, iterations)", met: a.experimentation },
    { key: "scienceBased", label: "Relies on principles of engineering, biology, agronomy or computer science", met: a.scienceBased },
  ];
  const met = tests.filter((t) => t.met).length;
  return { tests, met, indicator: met === 4 && a.qualifiedSpend ? "strong" : met >= 3 ? "possible" : "unlikely", note: "Fabrik does not calculate or file R&D credits. A specialist must confirm eligibility and qualified research expenses." };
}

// ─── Global search ───────────────────────────────────────────────────────────

const PAGES = [
  ["Home", "/"], ["Finance Inbox", "/inbox"], ["Books", "/books"], ["Reports", "/books?tab=reports"], ["Reconciliation", "/reconciliation"], ["Monthly Close", "/close"], ["Bills", "/bills"], ["Collect", "/collect"], ["Funding", "/funding"], ["Farm profile", "/funding/profile"], ["CFO", "/cfo"], ["13-week forecast", "/cfo?tab=forecast"], ["Scenarios", "/cfo?tab=scenarios"], ["Ask Fabrik", "/ask"], ["Documents", "/documents"], ["Tax & Credits", "/tax"], ["Integrations", "/integrations"], ["Team & Settings", "/settings"],
] as const;

export function search(ctx: Ctx, q: string) {
  const data = db();
  const s = q.trim().toLowerCase();
  if (s.length < 2) return [];
  const out: { kind: string; title: string; subtitle?: string; href: string }[] = [];
  for (const [title, href] of PAGES) if (title.toLowerCase().includes(s)) out.push({ kind: "Page", title, href });
  for (const v of data.vendors.filter((v) => v.orgId === ctx.org.id && v.name.toLowerCase().includes(s)).slice(0, 5)) out.push({ kind: "Vendor", title: v.name, subtitle: "Transactions", href: `/books?vendor=${v.id}` });
  for (const t of data.transactions.filter((t) => t.orgId === ctx.org.id && (t.description.toLowerCase().includes(s) || t.ai?.normalizedVendor.toLowerCase().includes(s))).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6)) out.push({ kind: "Transaction", title: t.ai?.normalizedVendor ?? t.description, subtitle: `${t.date} · $${(Math.abs(t.amount) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`, href: `/books?txn=${t.id}` });
  for (const d of data.documents.filter((d) => d.orgId === ctx.org.id && (d.filename.toLowerCase().includes(s) || d.extraction?.vendor?.toLowerCase().includes(s))).slice(0, 4)) out.push({ kind: "Document", title: d.filename, subtitle: d.kind.replace(/_/g, " "), href: `/documents?doc=${d.id}` });
  for (const b of data.bills.filter((b) => b.orgId === ctx.org.id && b.number.toLowerCase().includes(s)).slice(0, 3)) out.push({ kind: "Bill", title: b.number, href: "/bills" });
  for (const i of data.invoices.filter((i) => i.orgId === ctx.org.id && i.number.toLowerCase().includes(s)).slice(0, 3)) out.push({ kind: "Invoice", title: i.number, href: "/collect" });
  for (const p of data.fundingPrograms.filter((p) => p.name.toLowerCase().includes(s) || p.agency.toLowerCase().includes(s)).slice(0, 4)) out.push({ kind: "Funding program", title: p.name, subtitle: p.agency, href: `/funding/${p.id}` });
  return out.slice(0, 24);
}

