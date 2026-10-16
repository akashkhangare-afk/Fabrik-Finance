import { describe, expect, it } from "vitest";
import type { GLAccount, Vendor } from "@/lib/types";
import { assessRisk, DEFAULT_RISK_RULES } from "@/server/engines/risk";
import { buildHistory, categorize, normalizeVendor, recordHistory, type CategorizeContext } from "@/server/engines/categorization";
import { scoreDocumentMatch, scoreStatementMatch, similarity } from "@/server/engines/matching";
import { matchProgram, readiness } from "@/server/engines/funding-match";
import { amortizedPayment, buildForecast } from "@/server/engines/forecast";
import { autoMatch, summarize } from "@/server/engines/reconciliation";
import { parseDocumentText } from "@/server/integrations/idp";
import { FUNDING_PROGRAMS } from "@/content/funding";
import { buildSeed } from "@/server/db/seed";

const acct = (id: string, subtype: string, type: GLAccount["type"] = "expense"): GLAccount => ({ id, orgId: "o", code: id, name: subtype, type, subtype, active: true });
const accounts = [acct("rep", "repairs"), acct("off", "office_supplies"), acct("sw", "software"), acct("fuel", "fuel"), acct("unc", "uncategorized_expense"), acct("unci", "uncategorized_income", "income"), acct("loan", "equipment_loan", "liability")];
const vendors: Vendor[] = [{ id: "hd", orgId: "o", name: "The Home Depot", aliases: ["HOME DEPOT"], createdAt: "" }];
const baseCtx = (): CategorizeContext => ({ org: { id: "o", thresholds: { autoApprove: 0.98, review: 0.85 }, largeTransactionThreshold: 10_000_00 }, accounts, vendors, rules: [], riskRules: DEFAULT_RISK_RULES, history: buildHistory([]), recent: [], documents: [] });

describe("Transaction Agent — categorization (PRD §8)", () => {
  it("normalizes vendors from raw bank descriptors", () => {
    expect(normalizeVendor("THE HOME DEPOT #2104 AMES IA", vendors).vendor?.id).toBe("hd");
    expect(normalizeVendor("CHECK 1187", vendors).name).toMatch(/Check #1187/);
  });

  it("reproduces the PRD example: 11 of previous 12 → ~91% → bookkeeper review", () => {
    const ctx = baseCtx();
    for (let i = 0; i < 11; i++) recordHistory(ctx.history, "hd", "rep", -20000);
    recordHistory(ctx.history, "hd", "off", -5000);
    const out = categorize({ id: "t", date: "2026-10-07", description: "THE HOME DEPOT #2104", amount: -48122, bankAccountId: "b" }, ctx);
    expect(out.suggestion.accountId).toBe("rep");
    expect(out.suggestion.confidence).toBeGreaterThan(0.9);
    expect(out.suggestion.confidence).toBeLessThan(0.98);
    expect(out.suggestion.decision).toBe("review");
    expect(out.suggestion.explanation).toMatch(/11 of the previous 12/);
  });

  it("learned vendor rule gives high confidence and auto-processing (PRD §25)", () => {
    const ctx = baseCtx();
    ctx.rules.push({ id: "r1", orgId: "o", kind: "vendor", label: "Home Depot → Repairs", match: { vendorId: "hd" }, accountId: "rep", createdBy: "u", createdFrom: "correction", hits: 3, active: true, createdAt: "" });
    const out = categorize({ id: "t", date: "2026-10-07", description: "HOME DEPOT 22", amount: -9000, bankAccountId: "b" }, ctx);
    expect(out.suggestion.confidence).toBeGreaterThanOrEqual(0.98);
    expect(out.suggestion.decision).toBe("auto");
  });

  it("unknown payee falls back to clarification", () => {
    const out = categorize({ id: "t", date: "2026-10-13", description: "CHECK 1187", amount: -325000, bankAccountId: "b" }, baseCtx());
    expect(out.suggestion.decision).toBe("clarify");
    expect(out.risk.reasons.map((r) => r.ruleKey)).toContain("unknown_vendor");
  });

  it("flags possible duplicates", () => {
    const ctx = baseCtx();
    ctx.recent.push({ id: "a", date: "2026-10-12", amount: -8640, description: "CASEYS GEN STORE 2215", bankAccountId: "b", status: "processed" });
    const out = categorize({ id: "b2", date: "2026-10-12", description: "CASEYS GEN STORE 2215", amount: -8640, bankAccountId: "b" }, ctx);
    expect(out.suggestion.possibleDuplicateOf).toBe("a");
  });
});

describe("Risk engine (PRD §9) — risk rules override confidence", () => {
  it("forces review for loans, large items and missing support", () => {
    const r = assessRisk({ amount: -1_500_000, type: "loan_payment", vendorKnown: true, description: "LOAN PMT", largeThreshold: 1_000_000, possibleDuplicate: false, anomaly: false });
    expect(r.forcesReview).toBe(true);
    expect(r.reasons.map((x) => x.ruleKey)).toEqual(expect.arrayContaining(["loans", "large_transaction"]));
    const s = assessRisk({ amount: -1_482_000, type: "expense", vendorKnown: true, description: "JOHN DEERE", largeThreshold: 10_000_000, possibleDuplicate: false, anomaly: false });
    expect(s.reasons.map((x) => x.ruleKey)).toContain("missing_support");
    const ok = assessRisk({ amount: -1_482_000, type: "expense", vendorKnown: true, description: "JOHN DEERE", largeThreshold: 10_000_000, possibleDuplicate: false, anomaly: false, hasSupport: true });
    expect(ok.forcesReview).toBe(false);
  });

  it("respects disabled rules", () => {
    const rules = DEFAULT_RISK_RULES.map((r) => ({ ...r, enabled: r.key !== "unknown_vendor" }));
    expect(assessRisk({ amount: -100, type: "expense", vendorKnown: false, description: "X", largeThreshold: 1e9, possibleDuplicate: false, anomaly: false }, rules).forcesReview).toBe(false);
  });
});

describe("Document Agent — FabrikIDP extraction & matching (PRD §10)", () => {
  const lines = ["John Deere Financial", "INVOICE", "Invoice #: JD-28712  Bill To:", "Invoice Date: 10/02/2026  Smith Family Farms LLC", "Due Date: 11/01/2026", "PO #: PO-2026-118", "Precision planter row-unit meters (16 rows)  1  $9,840.00  $9,840.00", "Subtotal: $14,820.00", "Sales Tax (ag exemption): $0.00", "Total Due: $14,820.00"];
  it("extracts vendor, number, dates, totals and line items", () => {
    const { kind, extraction: e } = parseDocumentText(lines, "test", "1");
    expect(kind).toBe("invoice");
    expect(e.vendor).toBe("John Deere Financial");
    expect(e.documentNumber).toBe("JD-28712");
    expect(e.documentDate).toBe("2026-10-02");
    expect(e.dueDate).toBe("2026-11-01");
    expect(e.total).toBe(1_482_000);
    expect(e.poNumber).toBe("PO-2026-118");
    expect(e.lineItems[0]?.amount).toBe(984_000);
  });

  it("matches the PRD example at 99%", () => {
    const s = scoreDocumentMatch({ vendor: "John Deere Financial", total: 1_482_000, documentDate: "2026-10-02", documentNumber: "JD-28712" }, { date: "2026-10-09", amount: -1_482_000, description: "JOHN DEERE FINANCIAL MULTI-USE ACCT 77104" });
    expect(s.confidence).toBe(0.99);
  });

  it("rejects amount mismatches and scores statement lines", () => {
    expect(scoreDocumentMatch({ vendor: "X", total: 1000 }, { date: "2026-01-01", amount: -9999, description: "X" }).confidence).toBe(0);
    expect(scoreStatementMatch({ date: "2026-09-02", amount: -100, description: "MIDAMERICAN ENERGY ACH" }, { date: "2026-09-02", amount: -100, description: "MIDAMERICAN ENERGY ACH" })).toBeGreaterThan(0.95);
    expect(similarity("Amazon Web Services", "AMAZON WEB SERVICES AWS.AMAZON.CO")).toBeGreaterThan(0.5);
  });
});

describe("Reconciliation Agent (PRD §11)", () => {
  it("computes difference and only approves at zero with all lines resolved", () => {
    const items = [
      { transactionId: "t1", date: "2026-09-02", description: "MIDAMERICAN ENERGY ACH", amount: -1000, status: "processed" as const },
      { transactionId: "t2", date: "2026-09-29", description: "CHECK 9", amount: -500, status: "processed" as const },
    ];
    const rec = { id: "r", orgId: "o", bankAccountId: "b", period: "2026-09", statementStartBalance: 10_000, statementEndBalance: 9_000 - 30, statementDate: "2026-09-30", status: "in_progress" as const, outstandingTxnIds: [] as string[], lines: [{ id: "l1", date: "2026-09-02", description: "MIDAMERICAN ENERGY ACH", amount: -1000, state: "unmatched" as const }, { id: "l2", date: "2026-09-18", description: "FEE", amount: -30, state: "unmatched" as const }] };
    rec.lines = autoMatch(rec.lines, items) as typeof rec.lines;
    expect(rec.lines[0]!.state).toBe("matched");
    let s = summarize(rec, items);
    expect(s.canApprove).toBe(false);
    rec.outstandingTxnIds.push("t2");
    s = summarize(rec, [...items, { transactionId: "fee", date: "2026-09-18", description: "FEE", amount: -30, status: "approved" as const }].filter(Boolean));
    expect(s.difference).toBe(0);
  });
});

describe("Funding matching (Expo §15–17)", () => {
  const db = buildSeed();
  const profile = db.farmProfiles[0]!;
  it("never scores 100% and produces explainable levels", () => {
    const results = FUNDING_PROGRAMS.map((p) => ({ id: p.id, ...matchProgram(p, profile) }));
    expect(Math.max(...results.map((r) => r.score))).toBeLessThanOrEqual(92);
    expect(results.find((r) => r.id === "fsa-arc-plc")!.level).toBe("high");
    expect(results.find((r) => r.id === "iowa-beginning-farmer-loan-program")!.level).toBe("unlikely");
    expect(results.find((r) => r.id === "rd-value-added-producer-grants")!.level).toBe("unlikely");
    expect(results.find((r) => r.id === "nrcs-eqip")!.level).toBe("possible"); // competitive cap
    for (const r of results) expect(r.explanation.toLowerCase()).not.toMatch(/you qualify|definitely|eligible for/);
  });

  it("readiness matches the PRD example (71%)", () => {
    const p = FUNDING_PROGRAMS.find((x) => x.id === "fsa-arc-plc")!;
    const tags = new Set(db.documents.filter((d) => d.orgId === "org_smith").flatMap((d) => d.tags));
    expect(readiness(p, profile, { booksClosedThrough: "2026-08", documentTags: tags }).pct).toBe(71);
  });

  it("every program links to an authoritative source", () => {
    for (const p of FUNDING_PROGRAMS) expect(p.officialSourceUrl).toMatch(/^https:\/\/(www\.)?(fsa\.usda\.gov|ecfr\.gov|irs\.gov|iowaagriculture\.gov|opportunityiowa\.gov)/);
  });
});

describe("13-week forecast (Expo §19)", () => {
  it("separates known and estimated flows and finds the low point", () => {
    const f = buildForecast({
      today: "2026-10-16",
      startingCash: 100_000,
      bufferCents: 50_000,
      assumptions: [],
      lines: [
        { id: "a", label: "Bill", category: "bills", direction: "out", certainty: "known", date: "2026-10-20", amount: 80_000, source: "" },
        { id: "b", label: "Sales", category: "grain_sales", direction: "in", certainty: "estimated", date: "2026-10-30", amount: 200_000, source: "" },
      ],
    });
    expect(f.weeks).toHaveLength(13);
    expect(f.weeks[0]!.outKnown).toBe(80_000);
    expect(f.minCash).toBe(20_000);
    expect(f.weeksBelowBuffer).toEqual([1]);
    expect(f.totals.inEstimated).toBe(200_000);
  });

  it("amortizes loans correctly", () => {
    // $700,000 at 6.75% over 25 annual payments ≈ $58,720.84
    expect(amortizedPayment(70_000_000, 6.75, 25, 1)).toBe(5_872_084);
  });
});
