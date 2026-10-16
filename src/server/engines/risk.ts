import type { Cents, GLAccount, RiskAssessment, RiskRule, TransactionType } from "@/lib/types";

/**
 * Risk engine (PRD §9 / Expo §7): certain transactions must always receive human review,
 * regardless of AI confidence. Confidence Score + Risk Score → Processing Decision.
 */

export const DEFAULT_RISK_RULES: RiskRule[] = [
  { key: "loans", label: "Loan transaction", description: "Loan proceeds, principal or interest payments", enabled: true, weight: 45 },
  { key: "equity", label: "Equity transaction", description: "Contributions to or changes in members' equity", enabled: true, weight: 50 },
  { key: "shareholder", label: "Owner / shareholder transaction", description: "Distributions, draws or owner-paid expenses", enabled: true, weight: 50 },
  { key: "intercompany", label: "Intercompany transaction", description: "Transfers between related entities", enabled: true, weight: 45 },
  { key: "large_transaction", label: "Large transaction", description: "At or above the organization's large-transaction threshold", enabled: true, weight: 35 },
  { key: "unusual_journal_entry", label: "Unusual journal entry", description: "Manual journal entries outside recurring patterns", enabled: true, weight: 40 },
  { key: "tax_payment", label: "Tax payment", description: "Federal, state or payroll tax remittances", enabled: true, weight: 45 },
  { key: "payroll_adjustment", label: "Payroll adjustment", description: "Off-cycle payroll, corrections or adjustments", enabled: true, weight: 40 },
  { key: "asset_purchase", label: "Asset purchase", description: "Purchases that may need to be capitalized", enabled: true, weight: 40 },
  { key: "refund", label: "Refund", description: "Money returned by a vendor or to a customer", enabled: true, weight: 30 },
  { key: "chargeback", label: "Chargeback", description: "Card chargebacks and disputes", enabled: true, weight: 40 },
  { key: "unknown_vendor", label: "Unknown vendor", description: "No match to a known vendor or prior history", enabled: true, weight: 30 },
  { key: "missing_support", label: "Supporting document required", description: "Expenses at or above $10,000 need an invoice or receipt on file", enabled: true, weight: 25 },
  { key: "possible_duplicate", label: "Possible duplicate", description: "Same amount and payee within a few days", enabled: true, weight: 35 },
  { key: "anomaly", label: "Unusual amount", description: "Amount far outside this vendor's normal range", enabled: true, weight: 30 },
];

export interface RiskInput {
  amount: Cents;
  type: TransactionType;
  account?: GLAccount;
  vendorKnown: boolean;
  description: string;
  largeThreshold: Cents;
  possibleDuplicate: boolean;
  anomaly: boolean;
  /** True when a document is matched/attached. */
  hasSupport?: boolean;
}

export const SUPPORT_REQUIRED_AT = 10_000_00;

const TYPE_RULE: Partial<Record<TransactionType, string>> = {
  loan_payment: "loans",
  owner_draw: "shareholder",
  owner_contribution: "equity",
  tax_payment: "tax_payment",
  asset_purchase: "asset_purchase",
  refund: "refund",
  chargeback: "chargeback",
  intercompany: "intercompany",
};

export function assessRisk(input: RiskInput, rules: RiskRule[] = DEFAULT_RISK_RULES): RiskAssessment {
  const enabled = new Map(rules.filter((r) => r.enabled).map((r) => [r.key, r]));
  const hits = new Set<string>();

  const typeRule = TYPE_RULE[input.type];
  if (typeRule) hits.add(typeRule);

  const sub = input.account?.subtype;
  if (sub === "operating_loc" || sub === "equipment_loan" || sub === "mortgage") hits.add("loans");
  if (sub === "members_equity" || sub === "owner_contributions") hits.add("equity");
  if (sub === "member_draws") hits.add("shareholder");
  if (sub === "machinery" || sub === "land" || sub === "buildings") hits.add("asset_purchase");
  if (sub === "taxes_licenses") hits.add("tax_payment");

  const desc = input.description.toUpperCase();
  if (/PAYROLL (ADJ|CORR)|OFF[- ]CYCLE/.test(desc)) hits.add("payroll_adjustment");
  if (Math.abs(input.amount) >= input.largeThreshold) hits.add("large_transaction");
  if (!input.vendorKnown) hits.add("unknown_vendor");
  if (input.amount < 0 && -input.amount >= SUPPORT_REQUIRED_AT && !input.hasSupport && (input.type === "expense" || input.type === "asset_purchase")) hits.add("missing_support");
  if (input.possibleDuplicate) hits.add("possible_duplicate");
  if (input.anomaly) hits.add("anomaly");

  const matched = [...hits].map((k) => enabled.get(k)).filter((r): r is RiskRule => Boolean(r));
  const score = Math.min(100, matched.reduce((s, r) => s + r.weight, 0));
  return {
    score,
    level: score >= 60 ? "high" : score >= 30 ? "medium" : "low",
    reasons: matched.map((r) => ({ ruleKey: r.key, label: r.label })),
    // Every PRD risk category forces human review; risk rules override confidence.
    forcesReview: matched.length > 0,
  };
}
