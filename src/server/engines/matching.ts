import type { Cents, ExtractionResult, ISODate } from "@/lib/types";
import { diffDays } from "@/lib/dates";

const STOP = new Set(["INC", "LLC", "CO", "CORP", "COMPANY", "THE", "OF", "AND", "&", "LTD", "US", "USA", "PMT", "PAYMENT", "POS", "DEBIT", "ACH", "CARD", "PURCHASE"]);

export function tokens(s: string): string[] {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t) && !/^\d+$/.test(t));
}

/** Token-overlap similarity in [0, 1] (Dice coefficient with prefix tolerance: "AMZN"≈"AMAZON" is not assumed). */
export function similarity(a: string, b: string): number {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.length || !B.length) return 0;
  let hits = 0;
  for (const t of A) if (B.some((u) => u === t || (t.length >= 4 && (u.startsWith(t) || t.startsWith(u))))) hits++;
  return (2 * hits) / (A.length + B.length);
}

export interface MatchScore {
  confidence: number;
  reasons: string[];
}

/** Scores how likely an extracted document (invoice/receipt) corresponds to a bank transaction. */
export function scoreDocumentMatch(
  doc: Pick<ExtractionResult, "total" | "vendor" | "documentDate" | "dueDate" | "documentNumber">,
  txn: { date: ISODate; amount: Cents; description: string; vendorName?: string },
): MatchScore {
  const reasons: string[] = [];
  if (doc.total == null) return { confidence: 0, reasons: ["Document has no total to compare"] };
  const amt = Math.abs(txn.amount);
  const diff = Math.abs(amt - doc.total);
  let score = 0;
  if (diff === 0) {
    score += 0.5;
    reasons.push("Amount matches exactly");
  } else if (diff <= Math.max(100, doc.total * 0.01)) {
    score += 0.32;
    reasons.push("Amount within 1%");
  } else {
    return { confidence: 0, reasons: ["Amount differs"] };
  }

  const vendorSim = Math.max(similarity(doc.vendor ?? "", txn.description), similarity(doc.vendor ?? "", txn.vendorName ?? ""));
  if (vendorSim >= 0.5) {
    score += 0.3;
    reasons.push("Vendor name matches");
  } else if (vendorSim > 0) {
    score += 0.15;
    reasons.push("Vendor name partially matches");
  }

  const ref = doc.documentDate ?? doc.dueDate;
  if (ref) {
    const days = diffDays(txn.date, ref);
    if (days >= -3 && days <= 10) {
      score += 0.19;
      reasons.push(days === 0 ? "Same date" : `Paid ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ${days >= 0 ? "after" : "before"} document date`);
    } else if (days > 10 && days <= 45) {
      score += 0.1;
      reasons.push(`Paid ${days} days after document date`);
    }
  }
  if (doc.documentNumber && txn.description.toUpperCase().includes(doc.documentNumber.toUpperCase())) {
    score += 0.1;
    reasons.push("Document number appears in bank description");
  }
  return { confidence: Math.min(0.99, Math.round(score * 100) / 100), reasons };
}

/** Bank statement line ↔ book transaction scoring for reconciliation. */
export function scoreStatementMatch(
  line: { date: ISODate; amount: Cents; description: string },
  txn: { date: ISODate; amount: Cents; description: string },
): number {
  if (line.amount !== txn.amount) return 0;
  const days = Math.abs(diffDays(line.date, txn.date));
  if (days > 7) return 0;
  const sim = similarity(line.description, txn.description);
  const score = 0.6 + (days === 0 ? 0.25 : days <= 2 ? 0.18 : 0.08) + sim * 0.14;
  return Math.min(0.99, Math.round(score * 100) / 100);
}
