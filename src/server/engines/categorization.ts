import type {
  AISuggestion,
  CategorizationRule,
  Cents,
  FinanceDocument,
  GLAccount,
  ID,
  ISODate,
  Organization,
  RiskAssessment,
  RiskRule,
  Transaction,
  TransactionType,
  Vendor,
} from "@/lib/types";
import { SUBTYPES } from "@/server/domain/coa";
import { assessRisk } from "./risk";
import { scoreDocumentMatch } from "./matching";
import { diffDays } from "@/lib/dates";

/**
 * Transaction Agent — categorization (PRD §8, the core MVP engine).
 *
 * For every transaction Fabrik produces: normalized vendor, transaction type, proposed GL account,
 * confidence, explanation, potential duplicate, anomaly indicator and document match. Signals are
 * layered: organization-specific rules (learned from corrections) → this org's vendor history →
 * description keywords. The output is deterministic and explainable; an LLM can be plugged in via
 * the AI gateway as an additional signal without changing this contract.
 */

export const CATEGORIZER_MODEL = "fabrik-categorizer";
export const CATEGORIZER_VERSION = "2026.10.1";

export interface VendorHistory {
  counts: Map<ID, number>;
  total: number;
  amounts: number[];
}

export interface HistoryIndex {
  byVendor: Map<ID, VendorHistory>;
}

export interface CategorizeContext {
  org: Pick<Organization, "id" | "thresholds" | "largeTransactionThreshold">;
  accounts: GLAccount[];
  vendors: Vendor[];
  rules: CategorizationRule[];
  riskRules: RiskRule[];
  history: HistoryIndex;
  /** Recent transactions in the same org (for duplicate detection). */
  recent: Pick<Transaction, "id" | "date" | "amount" | "description" | "bankAccountId" | "status">[];
  documents: FinanceDocument[];
}

export interface CategorizeInput {
  id: ID;
  date: ISODate;
  description: string;
  amount: Cents;
  bankAccountId: ID;
  documentIds?: ID[];
}

export interface CategorizeOutput {
  vendor?: Vendor;
  suggestion: AISuggestion;
  risk: RiskAssessment;
}

export function buildHistory(transactions: Pick<Transaction, "vendorId" | "accountId" | "status" | "amount">[]): HistoryIndex {
  const byVendor = new Map<ID, VendorHistory>();
  for (const t of transactions) {
    if (!t.vendorId || !t.accountId) continue;
    if (t.status !== "approved" && t.status !== "processed") continue;
    recordHistory({ byVendor }, t.vendorId, t.accountId, t.amount);
  }
  return { byVendor };
}

export function recordHistory(index: HistoryIndex, vendorId: ID, accountId: ID, amount: Cents): void {
  let h = index.byVendor.get(vendorId);
  if (!h) {
    h = { counts: new Map(), total: 0, amounts: [] };
    index.byVendor.set(vendorId, h);
  }
  h.counts.set(accountId, (h.counts.get(accountId) ?? 0) + 1);
  h.total += 1;
  h.amounts.push(Math.abs(amount));
  if (h.amounts.length > 60) h.amounts.shift();
}

export function normalizeVendor(description: string, vendors: Vendor[]): { vendor?: Vendor; name: string } {
  const upper = description.toUpperCase();
  let best: { vendor: Vendor; len: number } | undefined;
  for (const v of vendors) {
    for (const alias of v.aliases) {
      const a = alias.toUpperCase();
      if (upper.includes(a) && (!best || a.length > best.len)) best = { vendor: v, len: a.length };
    }
  }
  if (best) return { vendor: best.vendor, name: best.vendor.name };
  const check = upper.match(/^CHECK\s*#?\s*(\d+)/);
  if (check) return { name: `Check #${check[1]} (payee not on bank feed)` };
  const cleaned = upper
    .replace(/^(POS DEBIT|DEBIT CARD PURCHASE|CHECKCARD|ACH DEBIT|ACH CREDIT|PURCHASE|PAYPAL \*|SQ \*|TST\*)\s*/g, "")
    .replace(/[#*]\s*\d+/g, "")
    .replace(/\b\d{3,}\b/g, "")
    .replace(/\s+[A-Z]{2}$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const name = cleaned
    .split(" ")
    .map((w) => (w.length <= 3 ? w : w[0] + w.slice(1).toLowerCase()))
    .join(" ");
  return { name: name || description };
}

export function inferType(description: string, amount: Cents, account?: GLAccount): TransactionType {
  const d = description.toUpperCase();
  if (/\b(TRANSFER|XFER|TFR)\b/.test(d)) return "transfer";
  if (/LOAN (PMT|PAYMENT)|NOTE PMT|LOC INTEREST|LOAN ADVANCE/.test(d)) return "loan_payment";
  if (/\bIRS\b|EFTPS|US TREASURY|DEPT OF REV|IA DEPT REV/.test(d)) return "tax_payment";
  if (/OWNER DRAW|MEMBER DIST|DISTRIBUTION TO/.test(d)) return "owner_draw";
  if (/CAPITAL CONTRIB/.test(d)) return "owner_contribution";
  if (/CHARGEBACK/.test(d)) return "chargeback";
  if (/INTERCO|DUE TO AFFILIATE/.test(d)) return "intercompany";
  if (/REFUND|RETURN CREDIT|CREDIT MEMO/.test(d) && amount > 0) return "refund";
  if (/PAYROLL/.test(d)) return "payroll";
  const sub = account?.subtype;
  if (sub === "machinery" || sub === "land" || sub === "buildings") return "asset_purchase";
  if (sub === "member_draws") return "owner_draw";
  if (sub === "equipment_loan" || sub === "mortgage" || sub === "operating_loc") return "loan_payment";
  return amount > 0 ? "income" : "expense";
}

interface Candidate {
  accountId: ID;
  confidence: number;
  basis: AISuggestion["evidence"]["basis"];
  similar: number;
  total: number;
  rule?: CategorizationRule;
}

function ruleMatches(rule: CategorizationRule, input: CategorizeInput, vendorId?: ID): boolean {
  if (!rule.active) return false;
  const m = rule.match;
  if (m.vendorId && m.vendorId !== vendorId) return false;
  if (m.descriptionContains && !input.description.toUpperCase().includes(m.descriptionContains.toUpperCase())) return false;
  const abs = Math.abs(input.amount);
  if (m.amountMin != null && abs < m.amountMin) return false;
  if (m.amountMax != null && abs > m.amountMax) return false;
  return Boolean(m.vendorId || m.descriptionContains || m.amountMin != null || m.amountMax != null);
}

const RULE_CONFIDENCE: Record<CategorizationRule["kind"], number> = {
  vendor: 0.99,
  recurring: 0.985,
  amount: 0.975,
  description: 0.97,
  organization: 0.95,
};

export function categorize(input: CategorizeInput, ctx: CategorizeContext): CategorizeOutput {
  const accountsById = new Map(ctx.accounts.map((a) => [a.id, a]));
  const bySubtype = new Map(ctx.accounts.map((a) => [a.subtype, a]));
  const { vendor, name: normalizedVendor } = normalizeVendor(input.description, ctx.vendors);
  const inflow = input.amount > 0;
  const signOk = (a: GLAccount | undefined) =>
    Boolean(a) && (inflow ? a!.type === "income" || a!.type === "liability" || a!.type === "equity" || a!.subtype === "accounts_receivable" : a!.type !== "income");

  const candidates: Candidate[] = [];

  // 1) Organization-specific rules learned from corrections (PRD §25).
  const matchedRules = ctx.rules
    .filter((r) => r.orgId === ctx.org.id && ruleMatches(r, input, vendor?.id))
    .sort((a, b) => RULE_CONFIDENCE[b.kind] - RULE_CONFIDENCE[a.kind]);
  const topRule = matchedRules[0];
  if (topRule && signOk(accountsById.get(topRule.accountId))) {
    candidates.push({ accountId: topRule.accountId, confidence: RULE_CONFIDENCE[topRule.kind], basis: "rule", similar: topRule.hits, total: topRule.hits, rule: topRule });
  }

  // 2) This organization's vendor history.
  const hist = vendor ? ctx.history.byVendor.get(vendor.id) : undefined;
  if (hist && hist.total > 0) {
    const penalty = hist.total >= 10 ? 0 : (10 - hist.total) * 0.012;
    for (const [accountId, n] of [...hist.counts.entries()].sort((a, b) => b[1] - a[1])) {
      if (!signOk(accountsById.get(accountId))) continue;
      const share = n / hist.total;
      const conf = Math.max(0.05, Math.min(0.995, share - penalty));
      const existing = candidates.find((c) => c.accountId === accountId);
      if (existing) {
        existing.confidence = Math.min(0.995, Math.max(existing.confidence, conf) + 0.004);
        existing.similar = n;
        existing.total = hist.total;
      } else candidates.push({ accountId, confidence: conf, basis: "history", similar: n, total: hist.total });
    }
  }

  // 3) Description keywords (cold start).
  if (!candidates.length) {
    const d = ` ${input.description.toUpperCase()} `;
    const kw: { subtype: string; hits: number }[] = [];
    for (const [subtype, meta] of Object.entries(SUBTYPES)) {
      const hits = (meta.keywords ?? []).filter((k) => d.includes(k)).length;
      if (hits && signOk(bySubtype.get(subtype))) kw.push({ subtype, hits });
    }
    kw.sort((a, b) => b.hits - a.hits);
    const totalHits = kw.reduce((s, k) => s + k.hits, 0);
    kw.slice(0, 3).forEach((k, i) => {
      const acct = bySubtype.get(k.subtype)!;
      const base = kw.length === 1 ? 0.78 : 0.55 + (0.2 * k.hits) / totalHits;
      candidates.push({ accountId: acct.id, confidence: Math.min(0.82, base - i * 0.08), basis: "keywords", similar: 0, total: 0 });
    });
  }

  // 4) Fallback: uncategorized.
  if (!candidates.length) {
    const fallback = bySubtype.get(inflow ? "uncategorized_income" : "uncategorized_expense") ?? ctx.accounts[0]!;
    candidates.push({ accountId: fallback.id, confidence: 0.3, basis: "none", similar: 0, total: 0 });
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  const top = candidates[0]!;
  let confidence = top.confidence;
  const account = accountsById.get(top.accountId);

  // Duplicate detection: same amount, same bank account, similar description, within 3 days.
  const dup = ctx.recent.find(
    (t) =>
      t.id !== input.id &&
      t.status !== "excluded" &&
      t.bankAccountId === input.bankAccountId &&
      t.amount === input.amount &&
      Math.abs(diffDays(t.date, input.date)) <= 3 &&
      t.description.slice(0, 12).toUpperCase() === input.description.slice(0, 12).toUpperCase(),
  );

  // Anomaly: amount far outside this vendor's usual range.
  let anomaly: AISuggestion["anomaly"];
  if (hist && hist.amounts.length >= 5) {
    const sorted = [...hist.amounts].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    const ratio = Math.abs(input.amount) / Math.max(1, median);
    if (ratio >= 3.5) anomaly = { reason: `Amount is ${ratio.toFixed(1)}× this vendor's typical transaction` };
  }

  if (anomaly) confidence *= 0.86;
  if (dup) confidence *= 0.8;
  confidence = Math.round(confidence * 1000) / 1000;

  const type = inferType(input.description, input.amount, account);

  // Document match.
  let documentMatch: AISuggestion["documentMatch"];
  for (const doc of ctx.documents) {
    if (!doc.extraction || doc.match?.status === "confirmed") continue;
    const s = scoreDocumentMatch(doc.extraction, { ...input, vendorName: vendor?.name ?? normalizedVendor });
    if (s.confidence >= 0.8 && (!documentMatch || s.confidence > documentMatch.confidence)) documentMatch = { documentId: doc.id, confidence: s.confidence };
  }

  const risk = assessRisk(
    {
      amount: input.amount,
      type,
      account,
      vendorKnown: Boolean(vendor) || top.basis === "rule",
      description: input.description,
      largeThreshold: ctx.org.largeTransactionThreshold,
      possibleDuplicate: Boolean(dup),
      anomaly: Boolean(anomaly),
      hasSupport: Boolean(documentMatch) || Boolean(input.documentIds?.length),
    },
    ctx.riskRules,
  );

  const { autoApprove, review } = ctx.org.thresholds;
  let decision: AISuggestion["decision"];
  if (risk.forcesReview) decision = confidence < review ? "clarify" : "review";
  else if (confidence >= autoApprove) decision = "auto";
  else if (confidence >= review) decision = "review";
  else decision = "clarify";

  const totalConf = candidates.slice(0, 3).reduce((s, c) => s + c.confidence, 0);
  const alternatives = candidates.slice(0, 3).map((c) => ({
    accountId: c.accountId,
    confidence: candidates.length > 1 ? Math.round((c.confidence / totalConf) * 100) / 100 : c.confidence,
  }));

  return {
    vendor,
    risk,
    suggestion: {
      normalizedVendor,
      transactionType: type,
      accountId: top.accountId,
      confidence,
      alternatives,
      explanation: explain(top, account, vendor?.name ?? normalizedVendor, anomaly, Boolean(dup)),
      evidence: { similarCount: top.similar, totalCount: top.total, ruleId: top.rule?.id, basis: top.basis },
      possibleDuplicateOf: dup?.id,
      anomaly,
      documentMatch,
      decision,
      model: CATEGORIZER_MODEL,
      modelVersion: CATEGORIZER_VERSION,
      generatedAt: `${input.date}T06:00:00.000Z`,
    },
  };
}

function explain(top: Candidate, account: GLAccount | undefined, vendorName: string, anomaly: AISuggestion["anomaly"], dup: boolean): string {
  const acct = account?.name ?? "this account";
  let s: string;
  switch (top.basis) {
    case "rule":
      s = `Matches your rule “${top.rule!.label}”, learned from a previous correction.`;
      break;
    case "history":
      s =
        top.similar === top.total
          ? `Similar ${vendorName} transactions were previously categorized as ${acct} (${top.similar} of ${top.total}).`
          : `${vendorName} was categorized as ${acct} in ${top.similar} of the previous ${top.total} transactions.`;
      break;
    case "keywords":
      s = `No history for this payee yet. The bank description suggests ${acct}.`;
      break;
    default:
      s = "Fabrik couldn't identify this payee or purpose from the bank feed. A person needs to confirm it.";
  }
  if (anomaly) s += ` ${anomaly.reason}.`;
  if (dup) s += " A transaction with the same amount and payee posted within 3 days — possible duplicate.";
  return s;
}
