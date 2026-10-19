import type { EligibilityRule, FundingProgram, ProgramType, PurposeTag } from "@/lib/types";
import raw from "./funding-programs.json";

/**
 * Funding Opportunity Database (Expo PRD §14).
 *
 * Program facts come from funding-programs.json, researched against official sources
 * (fsa.usda.gov, ecfr.gov, irs.gov, iowaagriculture.gov, opportunityiowa.gov) on 2026-10-16.
 * Where an agency page could not be reached, the governing regulation on eCFR was used instead and
 * this is stated in verificationNotes. The rules below encode each program's published criteria so
 * the matching engine can explain its reasoning — they indicate potential fit only, never eligibility.
 */

interface RawProgram {
  id: string;
  name: string;
  agency: string;
  programType: ProgramType;
  level: "federal" | "state";
  description: string;
  geography: string;
  eligibleEntities: string[];
  eligibleActivities: string[];
  financialCriteria: string[];
  agriculturalCriteria: string[];
  purposeTags: PurposeTag[];
  fundingRange: string | null;
  fundingRangeSource: string | null;
  deadline: string | null;
  requiredDocuments: string[];
  officialSourceUrl: string;
  lastVerified: string | null;
  verificationNotes: string;
}

const FARM_ENTITIES = ["llc", "corporation", "partnership", "sole_proprietor", "trust"];

const RULES: Record<string, { rules: EligibilityRule[]; additionalReadiness?: FundingProgram["additionalReadiness"] }> = {
  "fsa-farm-operating-loans": {
    rules: [
      { kind: "agricultural_operation", label: "Agricultural operation" },
      { kind: "entity_type", allowed: FARM_ENTITIES, label: "Entity type appears compatible (family farm operation)" },
      { kind: "purpose_overlap", tags: ["operating", "equipment"], label: "Planned use matches eligible loan purposes" },
      { kind: "commercial_credit_unavailable", label: "Unable to obtain sufficient commercial credit (direct) or needs an FSA guarantee" },
    ],
    additionalReadiness: [{ key: "business_plan", label: "Farm business plan", satisfiedBy: { documentTag: "funding:business-plan" } }],
  },
  "fsa-farm-ownership-loans": {
    rules: [
      { kind: "agricultural_operation", label: "Agricultural operation" },
      { kind: "entity_type", allowed: FARM_ENTITIES, label: "Entity type appears compatible (owner-operated family farm)" },
      { kind: "purpose_overlap", tags: ["land_purchase", "expansion"], label: "Planned farmland purchase detected" },
      { kind: "profile_field", field: "yearsFarming", label: "Farm management experience" },
      { kind: "commercial_credit_unavailable", label: "Lender would require an FSA guarantee" },
    ],
    additionalReadiness: [{ key: "business_plan", label: "Farm business plan", satisfiedBy: { documentTag: "funding:business-plan" } }],
  },
  "nrcs-eqip": {
    rules: [
      { kind: "agricultural_operation", label: "Agricultural operation" },
      { kind: "entity_type", allowed: FARM_ENTITIES, label: "Entity type appears compatible" },
      { kind: "conservation_interest", label: "Conservation practices planned or in use" },
      { kind: "purpose_overlap", tags: ["conservation", "water_quality", "energy"], label: "Planned project matches EQIP practice categories" },
      { kind: "profile_field", field: "properties", label: "Land control documented for the contract term" },
    ],
    additionalReadiness: [{ key: "conservation_plan", label: "EQIP plan of operations (with NRCS)", satisfiedBy: { documentTag: "funding:conservation-plan" } }],
  },
  "nrcs-csp": {
    rules: [
      { kind: "agricultural_operation", label: "Agricultural operation in FSA farm records" },
      { kind: "entity_type", allowed: FARM_ENTITIES, label: "Entity type appears compatible" },
      { kind: "conservation_interest", label: "Existing conservation stewardship" },
      { kind: "purpose_overlap", tags: ["conservation", "water_quality"], label: "Planned conservation activities" },
      { kind: "profile_field", field: "stewardshipAssessment", label: "NRCS stewardship-threshold assessment (two resource concerns)" },
    ],
    additionalReadiness: [{ key: "farm_records", label: "Current FSA farm records", satisfiedBy: { documentTag: "funding:fsa-farm-records" } }],
  },
  "rd-reap": {
    rules: [
      { kind: "agricultural_operation", label: "Agricultural producer (≥50% of gross income from agriculture)" },
      { kind: "entity_type", allowed: FARM_ENTITIES, label: "Entity type appears compatible" },
      { kind: "purpose_overlap", tags: ["energy"], label: "Energy efficiency or renewable energy project planned" },
      { kind: "profile_field", field: "energyAudit", label: "Energy assessment or audit completed" },
    ],
    additionalReadiness: [
      { key: "energy_audit", label: "Energy assessment / audit", satisfiedBy: { documentTag: "funding:energy-audit" } },
      { key: "sam", label: "Active SAM.gov registration (UEI)" },
    ],
  },
  "fsa-farm-storage-facility-loan": {
    rules: [
      { kind: "agricultural_operation", label: "Agricultural operation" },
      { kind: "crops_any", crops: ["corn", "soybeans", "wheat", "oats", "sorghum", "barley"], label: "Produces an eligible commodity (grains / oilseeds)" },
      { kind: "profile_field", field: "yearsFarming", label: "Three-year production history" },
      { kind: "purpose_overlap", tags: ["storage"], label: "Planned storage, drying or handling investment" },
    ],
  },
  "fsa-emergency-conservation-program": {
    rules: [
      { kind: "agricultural_operation", label: "Agricultural operation" },
      { kind: "disaster_loss", label: "Farmland damaged by a natural disaster with an announced FSA signup" },
    ],
  },
  "fsa-arc-plc": {
    rules: [
      { kind: "agricultural_operation", label: "Agricultural operation" },
      { kind: "crops_any", crops: ["corn", "soybeans", "wheat", "sorghum", "barley", "oats"], label: "Grows a covered commodity (corn, soybeans)" },
      { kind: "entity_type", allowed: FARM_ENTITIES, label: "Producer with a share interest in the crop" },
      { kind: "profile_field", field: "baseAcres", label: "Farm has base acres (confirm with FSA records)", informational: true },
    ],
    additionalReadiness: [{ key: "farm_records", label: "FSA farm records / base acres", satisfiedBy: { documentTag: "funding:fsa-farm-records" } }],
  },
  "rd-value-added-producer-grants": {
    rules: [
      { kind: "agricultural_operation", label: "Agricultural producer" },
      { kind: "value_added_activity", label: "Value-added product venture (processing / marketing)" },
      { kind: "purpose_overlap", tags: ["value_added"], label: "Value-added project planned" },
    ],
  },
  "iowa-beginning-farmer-loan-program": {
    rules: [
      { kind: "state", allowed: ["IA"], label: "Iowa operation" },
      { kind: "beginning_farmer", required: true, label: "Qualifies as a beginning farmer (net worth ≤ $901,000)" },
      { kind: "purpose_overlap", tags: ["land_purchase", "equipment"], label: "Planned land or equipment purchase" },
    ],
  },
  "iowa-cover-crop-cost-share-wqi": {
    rules: [
      { kind: "state", allowed: ["IA"], label: "Iowa farmer or landowner" },
      { kind: "agricultural_operation", label: "Row-crop operation" },
      { kind: "conservation_interest", label: "Cover crops, no-till/strip-till or nitrogen inhibitor practices planned" },
      { kind: "crops_any", crops: ["corn", "soybeans"], label: "Corn / soybean acres suitable for cover crops" },
    ],
  },
  "irs-section-179-and-bonus-depreciation": {
    rules: [
      { kind: "agricultural_operation", label: "Operating business placing property in service" },
      { kind: "purpose_overlap", tags: ["equipment"], label: "Planned equipment or machinery purchase" },
    ],
    additionalReadiness: [{ key: "cpa_review", label: "Tax advisor review of members' tax position" }],
  },
};

export const FUNDING_PROGRAMS: FundingProgram[] = (raw as RawProgram[]).map((p) => ({
  ...p,
  rules: RULES[p.id]?.rules ?? [{ kind: "agricultural_operation", label: "Agricultural operation" }],
  additionalReadiness: RULES[p.id]?.additionalReadiness,
}));
