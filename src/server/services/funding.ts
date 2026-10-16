import "server-only";
import type { FarmProfile, FundingProgram, FundingWatch, ID } from "@/lib/types";
import { commit, db } from "@/server/db/store";
import { newId } from "@/server/db/ids";
import { matchProgram, readiness, type FundingMatch, type MatchLevel } from "@/server/engines/funding-match";
import { recordAudit } from "./audit";
import { getKpis, ledgerDataFor } from "./finance";
import { NotFoundError } from "./transactions";
import type { Ctx } from "@/server/auth/session";
import { balances, buildPostings } from "@/server/engines/ledger";
import { today } from "@/lib/dates";

export function emptyProfile(orgId: ID, legalName: string, state: string): FarmProfile {
  return { orgId, legalName, entityType: "llc", state, county: "", owners: [], crops: [], livestock: [], properties: [], equipment: [], plannedInvestments: [], activities: [], conservationPractices: [], updatedAt: new Date().toISOString() };
}

/** Financial fields are pre-populated from the accounting system; agricultural fields are entered by the user. */
export function getProfile(orgId: ID): FarmProfile {
  const data = db();
  let p = data.farmProfiles.find((x) => x.orgId === orgId);
  if (!p) {
    const org = data.organizations.find((o) => o.id === orgId)!;
    p = emptyProfile(orgId, org.legalName, org.state);
    data.farmProfiles.push(p);
  }
  const k = getKpis(orgId);
  const ld = ledgerDataFor(orgId);
  const bal = balances(buildPostings(ld), today());
  let assets = 0;
  let debt = 0;
  for (const a of ld.accounts) {
    const v = bal.get(a.id) ?? 0;
    if (a.type === "asset") assets += v;
    if (a.type === "liability") debt -= v;
  }
  Object.assign(p, { revenue: k.revenueYtd, expenses: k.expensesYtd, assets, debt, financialsSyncedAt: data.connections.find((c) => c.orgId === orgId)?.lastSyncAt ?? p.financialsSyncedAt });
  return p;
}

export function profileCompleteness(p: FarmProfile): { pct: number; missing: string[] } {
  const checks: [boolean, string][] = [
    [Boolean(p.legalName && p.entityType && p.state && p.county), "Entity & location"],
    [p.owners.length > 0 && Math.round(p.owners.reduce((s, o) => s + o.pct, 0)) === 100, "Owners totalling 100%"],
    [p.employees != null, "Employees"],
    [(p.acresOwned ?? 0) + (p.acresRented ?? 0) > 0, "Farm acreage"],
    [p.crops.length > 0 || p.livestock.length > 0, "Crops or livestock"],
    [p.properties.length > 0, "Properties"],
    [p.equipment.length > 0, "Equipment"],
    [p.plannedInvestments.length > 0, "Planned investments"],
    [Boolean(p.projectDescription?.trim()), "Project description"],
    [p.yearsFarming != null && p.beginningFarmer != null, "Farming experience"],
  ];
  return { pct: Math.round((checks.filter(([ok]) => ok).length / checks.length) * 100), missing: checks.filter(([ok]) => !ok).map(([, l]) => l) };
}

export function updateProfile(ctx: Ctx, patch: Partial<FarmProfile>) {
  const p = getProfile(ctx.org.id);
  const before = structuredClone(p);
  // Accounting-derived fields are not user-editable here.
  const editable: Partial<FarmProfile> = { ...patch };
  for (const k of ["revenue", "expenses", "assets", "debt", "financialsSyncedAt", "orgId"] as const) delete editable[k];
  Object.assign(p, editable, { updatedAt: new Date().toISOString(), updatedBy: ctx.user.id });
  const changed = Object.keys(editable).filter((k) => JSON.stringify((before as unknown as Record<string, unknown>)[k]) !== JSON.stringify((p as unknown as Record<string, unknown>)[k]));
  recordAudit(ctx, { orgId: ctx.org.id, action: "funding.profile_updated", entity: { type: "farm_profile", id: ctx.org.id, label: p.legalName }, after: { fields: changed } });
  commit();
  return p;
}

export interface ProgramMatch {
  program: FundingProgram;
  match: FundingMatch;
  watch?: FundingWatch;
}

export function fundingMatches(orgId: ID): ProgramMatch[] {
  const data = db();
  const p = getProfile(orgId);
  const order: Record<MatchLevel, number> = { high: 0, possible: 1, more_info: 2, unlikely: 3 };
  return data.fundingPrograms
    .map((program) => ({ program, match: matchProgram(program, p), watch: data.fundingWatches.find((w) => w.orgId === orgId && w.programId === program.id) }))
    .sort((a, b) => order[a.match.level] - order[b.match.level] || b.match.score - a.match.score);
}

export function fundingSummary(orgId: ID) {
  const m = fundingMatches(orgId);
  const count = (l: MatchLevel) => m.filter((x) => x.match.level === l).length;
  return { identified: m.filter((x) => x.match.level !== "unlikely").length, high: count("high"), possible: count("possible"), moreInfo: count("more_info"), unlikely: count("unlikely") };
}

export function readinessContext(orgId: ID) {
  const data = db();
  const closed = data.closePeriods.filter((c) => c.orgId === orgId && c.status === "closed").sort((a, b) => b.period.localeCompare(a.period))[0];
  return { booksClosedThrough: closed?.period, documentTags: new Set(data.documents.filter((d) => d.orgId === orgId).flatMap((d) => d.tags)) };
}

export function programDetail(orgId: ID, programId: ID) {
  const data = db();
  const program = data.fundingPrograms.find((p) => p.id === programId);
  if (!program) throw new NotFoundError("Program not found");
  const profile = getProfile(orgId);
  const rctx = readinessContext(orgId);
  const r = readiness(program, profile, rctx);
  const docs = data.documents.filter((d) => d.orgId === orgId && d.tags.some((t) => t.startsWith("funding:")));
  return { program, match: matchProgram(program, profile), readiness: r, documents: docs, watch: data.fundingWatches.find((w) => w.orgId === orgId && w.programId === programId), booksClosedThrough: rctx.booksClosedThrough };
}

export function setWatch(ctx: Ctx, programId: ID, status: FundingWatch["status"], note?: string) {
  const data = db();
  let w = data.fundingWatches.find((x) => x.orgId === ctx.org.id && x.programId === programId);
  if (!w) {
    w = { id: newId("fw"), orgId: ctx.org.id, programId, status, updatedAt: new Date().toISOString(), updatedBy: ctx.user.id };
    data.fundingWatches.push(w);
  }
  Object.assign(w, { status, note: note ?? w.note, updatedAt: new Date().toISOString(), updatedBy: ctx.user.id });
  recordAudit(ctx, { orgId: ctx.org.id, action: `funding.${status}`, entity: { type: "funding_program", id: programId, label: data.fundingPrograms.find((p) => p.id === programId)?.name }, comment: note });
  commit();
  return w;
}
