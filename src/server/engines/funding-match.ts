import type { EligibilityRule, FarmProfile, FundingProgram, PurposeTag } from "@/lib/types";

/**
 * Funding matching engine (Expo PRD §15). Compares the farm/business profile against each
 * program's published criteria. Output is a *potential* match with reasons — Fabrik never states
 * that a business qualifies; eligibility is confirmed only by the agency or lender.
 */

export type MatchLevel = "high" | "possible" | "more_info" | "unlikely";

export const MATCH_LABELS: Record<MatchLevel, string> = {
  high: "High potential match",
  possible: "Possible match",
  more_info: "More information required",
  unlikely: "Unlikely match",
};

export interface RuleOutcome {
  label: string;
  outcome: "pass" | "concern" | "fail" | "unknown";
  detail?: string;
  weight: number;
  informational?: boolean;
}

export interface FundingMatch {
  programId: string;
  score: number; // 0–100
  level: MatchLevel;
  qualifying: string[];
  missing: string[];
  disqualifiers: string[];
  explanation: string;
  outcomes: RuleOutcome[];
}

/** Programs whose awards are competitive or ranked — a strong profile still can't exceed "possible". */
const COMPETITIVE = new Set(["nrcs-eqip", "nrcs-csp", "rd-reap", "rd-value-added-producer-grants"]);

function plannedTags(p: FarmProfile): Set<PurposeTag> {
  const s = new Set<PurposeTag>(p.plannedInvestments.map((i) => i.purpose));
  if (p.plannedInvestments.some((i) => i.purpose === "land_purchase" || i.purpose === "equipment")) s.add("expansion");
  if (p.conservationPractices.length) s.add("water_quality");
  return s;
}

function evaluate(rule: EligibilityRule, p: FarmProfile): RuleOutcome {
  const base = { label: rule.label, weight: 1 };
  switch (rule.kind) {
    case "agricultural_operation":
      return p.crops.length || p.livestock.length ? { ...base, outcome: "pass" } : { ...base, outcome: "unknown", detail: "Add crops or livestock to your profile" };
    case "entity_type":
      return rule.allowed.includes(p.entityType) ? { ...base, outcome: "pass" } : { ...base, outcome: "fail", detail: `Entity type ${p.entityType.toUpperCase()} isn't listed`, weight: 2 };
    case "state":
      return rule.allowed.includes(p.state) ? { ...base, outcome: "pass" } : { ...base, outcome: "fail", detail: `Program is limited to ${rule.allowed.join(", ")}`, weight: 2 };
    case "crops_any": {
      const hit = p.crops.find((c) => rule.crops.includes(c.crop.toLowerCase()));
      return hit ? { ...base, outcome: "pass", detail: `${hit.crop} (${hit.acres.toLocaleString("en-US")} ac)` } : p.crops.length ? { ...base, outcome: "fail", weight: 2 } : { ...base, outcome: "unknown" };
    }
    case "purpose_overlap": {
      const tags = plannedTags(p);
      const hit = rule.tags.find((t) => tags.has(t));
      if (hit) {
        const inv = p.plannedInvestments.find((i) => i.purpose === hit);
        return { ...base, outcome: "pass", detail: inv ? `${inv.description} (${inv.timeframe})` : undefined };
      }
      return { ...base, outcome: "unknown", detail: "Confirm whether a planned project fits this program's purpose" };
    }
    case "beginning_farmer":
      if (p.beginningFarmer == null) return { ...base, outcome: "unknown", detail: "Are you a beginning farmer?" };
      return p.beginningFarmer === rule.required ? { ...base, outcome: "pass" } : { ...base, outcome: "fail", detail: `Profile shows ${p.yearsFarming ?? "many"} years farming — program targets beginning farmers`, weight: 2 };
    case "commercial_credit_unavailable":
      if (p.hasCommercialCredit == null) return { ...base, outcome: "unknown", weight: 3 };
      return p.hasCommercialCredit
        ? { ...base, outcome: "concern", detail: "Existing commercial credit (Farm Credit loans) suggests credit is available elsewhere", weight: 3 }
        : { ...base, outcome: "pass", weight: 3 };
    case "max_acres": {
      const acres = (p.acresOwned ?? 0) + (p.acresRented ?? 0);
      return acres <= rule.acres ? { ...base, outcome: "pass" } : { ...base, outcome: "fail", weight: 2 };
    }
    case "profile_field": {
      const v = (p as unknown as Record<string, unknown>)[rule.field];
      const present = Array.isArray(v) ? v.length > 0 : v != null && v !== false && v !== "";
      return present ? { ...base, outcome: "pass" } : { ...base, outcome: "unknown", informational: rule.informational, detail: "Not in your profile yet" };
    }
    case "conservation_interest":
      return p.conservationPractices.length || p.plannedInvestments.some((i) => i.purpose === "conservation")
        ? { ...base, outcome: "pass", detail: p.conservationPractices.slice(0, 2).join(", ") }
        : { ...base, outcome: "unknown" };
    case "value_added_activity":
      if (p.valueAddedActivity == null) return { ...base, outcome: "unknown" };
      return p.valueAddedActivity ? { ...base, outcome: "pass" } : { ...base, outcome: "fail", detail: "No value-added product venture in your profile", weight: 2 };
    case "disaster_loss":
      if (p.disasterLossThisYear == null) return { ...base, outcome: "unknown", detail: "Has a natural disaster damaged your farmland this year?" };
      return p.disasterLossThisYear ? { ...base, outcome: "pass" } : { ...base, outcome: "fail", weight: 2 };
    case "rural_area":
      return p.ruralArea ? { ...base, outcome: "pass" } : { ...base, outcome: "unknown" };
  }
}

export function matchProgram(program: FundingProgram, profile: FarmProfile): FundingMatch {
  const outcomes = program.rules.map((r) => evaluate(r, profile));
  const scored = outcomes.filter((o) => !o.informational);
  const total = scored.reduce((s, o) => s + o.weight, 0) || 1;
  const passed = scored.filter((o) => o.outcome === "pass").reduce((s, o) => s + o.weight, 0);
  const halfUnknown = scored.filter((o) => o.outcome === "unknown").reduce((s, o) => s + o.weight * 0.35, 0);
  let score = Math.round(((passed + halfUnknown) / total) * 100);
  const fails = outcomes.filter((o) => o.outcome === "fail");
  const concerns = outcomes.filter((o) => o.outcome === "concern");
  const unknowns = outcomes.filter((o) => o.outcome === "unknown");

  let level: MatchLevel;
  if (fails.length) {
    level = "unlikely";
    score = Math.min(score, 25);
  } else if (score >= 85 && !concerns.length && !unknowns.filter((u) => !u.informational).length) level = "high";
  // "Possible" needs most criteria actually confirmed, not just tolerable unknowns.
  else if (score >= 60 && passed / total >= 0.55) level = "possible";
  else if (unknowns.length) level = "more_info";
  else level = "unlikely";
  // Fabrik can only check published criteria — agency review always remains, so scores never imply certainty.
  score = Math.min(score, 92);
  if (level === "high" && COMPETITIVE.has(program.id)) {
    level = "possible";
    score = Math.min(score, 79);
  }

  const qualifying = outcomes.filter((o) => o.outcome === "pass").map((o) => (o.detail ? `${o.label} — ${o.detail}` : o.label));
  const missing = unknowns.map((o) => (o.detail && o.detail !== "Not in your profile yet" ? `${o.label}: ${o.detail}` : o.label));
  const disqualifiers = [...fails, ...concerns].map((o) => (o.detail ? `${o.label}: ${o.detail}` : o.label));
  if (COMPETITIVE.has(program.id)) disqualifiers.push("Awards are competitive and ranked — a strong profile doesn't guarantee funding");

  const explanation =
    level === "high"
      ? `Your profile meets every published criterion Fabrik can check for ${program.name}. This is a potential match only — confirm eligibility with ${program.agency}.`
      : level === "possible"
        ? `Several criteria line up, but ${[concerns.length ? "some factors may limit eligibility" : "", unknowns.length ? "some information is still missing" : "", COMPETITIVE.has(program.id) ? "awards are competitive" : ""].filter(Boolean).join(" and ")}.`
        : level === "more_info"
          ? "Fabrik needs more information before it can assess this program."
          : `One or more published criteria don't fit your current profile${fails[0]?.detail ? ` (${fails[0].detail.toLowerCase()})` : ""}.`;

  return { programId: program.id, score, level, qualifying, missing, disqualifiers, explanation, outcomes };
}

export interface ReadinessItem {
  key: string;
  label: string;
  done: boolean;
  detail: string;
  href?: string;
}

export interface ReadinessContext {
  booksClosedThrough?: string; // YYYY-MM
  documentTags: Set<string>;
}

/** Application-readiness checklist (Expo PRD §17). Fabrik does not submit applications. */
export function readiness(program: FundingProgram, p: FarmProfile, ctx: ReadinessContext): { items: ReadinessItem[]; pct: number } {
  const ownersOk = p.owners.length > 0 && Math.round(p.owners.reduce((s, o) => s + o.pct, 0)) === 100;
  const items: ReadinessItem[] = [
    { key: "financials", label: "Financial statements", done: Boolean(ctx.booksClosedThrough), detail: ctx.booksClosedThrough ? `P&L, balance sheet and cash flow from closed books through ${ctx.booksClosedThrough}` : "Close at least one month of books", href: "/books?tab=reports" },
    { key: "business", label: "Business information", done: Boolean(p.legalName && p.state && p.county && p.employees != null), detail: `${p.legalName}, ${p.county} County, ${p.state}`, href: "/funding/profile" },
    { key: "entity", label: "Entity information", done: ctx.documentTags.has("funding:entity"), detail: ctx.documentTags.has("funding:entity") ? "Articles of Organization on file" : "Upload formation documents", href: "/documents" },
    { key: "ownership", label: "Ownership details", done: ownersOk && ctx.documentTags.has("funding:ownership"), detail: ownersOk ? p.owners.map((o) => `${o.name} ${o.pct}%`).join(" · ") : "Owners must total 100%", href: "/funding/profile" },
    { key: "farm", label: "Farm details", done: Boolean((p.acresOwned ?? 0) + (p.acresRented ?? 0) > 0 && p.crops.length), detail: `${((p.acresOwned ?? 0) + (p.acresRented ?? 0)).toLocaleString("en-US")} acres · ${p.crops.map((c) => c.crop).join(", ")}`, href: "/funding/profile" },
    { key: "project", label: "Project description", done: Boolean(p.projectDescription?.trim()), detail: p.projectDescription?.trim() ? "Provided" : "Describe the project you want to fund", href: "/funding/profile#project" },
  ];
  const extra = program.additionalReadiness ?? [];
  if (extra.length) {
    const done = extra.every((x) => (x.satisfiedBy?.documentTag ? ctx.documentTags.has(x.satisfiedBy.documentTag) : false));
    items.push({ key: "additional", label: "Additional certification", done, detail: extra.map((x) => x.label).join(" · "), href: "/documents" });
  } else {
    items.push({ key: "additional", label: "Additional certification", done: false, detail: "Program-specific forms from the agency", href: program.officialSourceUrl });
  }
  const pct = Math.round((items.filter((i) => i.done).length / items.length) * 100);
  return { items, pct };
}
