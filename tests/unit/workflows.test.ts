import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDb } from "@/server/db/store";
import { askQuestion, SUGGESTED_QUESTIONS } from "@/server/services/ask";
import { approveTransaction, askClient, getTxn } from "@/server/services/transactions";
import { respondToInbox, decideBill, draftReminder, approveReminder } from "@/server/services/workflow";
import { closeStatus, approveClose, approveRec, recDetail, createFromLine, resolveBookItem } from "@/server/services/close";
import { uploadDocument, confirmMatch } from "@/server/services/documents";
import { sampleJohnDeereInvoice } from "@/server/pdf";
import { runSync, setSimulatedFailure } from "@/server/services/integrations";
import { ctxFor } from "./helpers";

beforeEach(() => {
  resetDb();
});

describe("Ask Fabrik (PRD §13, Expo §21–22)", () => {
  it("answers every suggested question with grounded data", async () => {
    const ctx = ctxFor("usr_dan");
    let threadId: string | undefined;
    for (const q of SUGGESTED_QUESTIONS) {
      const { answer, thread } = await askQuestion(ctx, { question: q, threadId });
      threadId = thread.id;
      expect(answer.intent, q).not.toBe("fallback");
      expect(answer.summary.length, q).toBeGreaterThan(20);
    }
  });

  it("routes the Expo wow-moment pair using conversation context", async () => {
    const ctx = ctxFor("usr_dan");
    const a = await askQuestion(ctx, { question: "What government programs could potentially help Smith Family Farms expand?" });
    expect(a.answer.intent).toBe("funding.programs");
    expect(a.answer.summary).toMatch(/potential/i);
    const b = await askQuestion(ctx, { question: "What documents do we already have for these applications?", threadId: a.thread.id });
    expect(b.answer.intent).toBe("funding.documents");
    expect(b.answer.modules).toEqual(expect.arrayContaining(["funding", "documents", "books"]));
  });

  it("is read-only: refuses to move money", async () => {
    for (const q of ["Transfer $20,000 to savings", "Pay this invoice"]) {
      const { answer } = await askQuestion(ctxFor("usr_dan"), { question: q });
      expect(answer.refused, q).toBe(true);
    }
  });

  it("runs the farmland affordability scenario", async () => {
    const { answer } = await askQuestion(ctxFor("usr_dan"), { question: "Can we afford to purchase another $1 million of farmland?" });
    expect(answer.intent).toBe("cfo.scenario.land_purchase");
    expect(answer.table?.rows.find((r) => r.a === "Purchase price")?.v).toBe("$1,000,000");
  });
});

describe("Bookkeeping loop", () => {
  it("client answer returns the transaction to processing (PRD §19)", async () => {
    const ctx = ctxFor("usr_karen");
    const item = db().inbox.find((i) => i.id === "inb_amzn")!;
    await respondToInbox(ctx, item.id, { value: item.options![0]!.value, label: "Office Supplies" });
    const t = getTxn(ctx, item.related!.id);
    expect(t.status).toBe("processed");
    expect(item.status).toBe("resolved");
  });

  it("a correction teaches a rule and is written back with an audit trail (PRD §20/§25)", async () => {
    const ctx = ctxFor("usr_sarah");
    const t = db().transactions.find((x) => x.orgId === "org_smith" && x.status === "needs_review" && x.vendorId && x.description.includes("HOME DEPOT"))!;
    const target = db().glAccounts.find((a) => a.orgId === "org_smith" && a.subtype === "equipment_machinery")!;
    const res = await approveTransaction(ctx, t.id, { accountId: target.id, comment: "Shop equipment", humanSeconds: 30 });
    expect(res.txn.status).toBe("approved");
    expect(res.txn.syncState).toBe("synced");
    const actions = db().audit.filter((a) => a.entity.id === t.id).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["transaction.category_changed", "transaction.approved", "transaction.written_back"]));
  });

  it("ask-client creates an inbox item and flips the status", () => {
    const ctx = ctxFor("usr_sarah");
    const t = db().transactions.find((x) => x.orgId === "org_smith" && x.status === "needs_review")!;
    const item = askClient(ctx, t.id, {});
    expect(item.type).toBe("transaction_clarification");
    expect(getTxn(ctx, t.id).status).toBe("waiting_for_client");
  });

  it("document upload → extraction → match clears the support flag (Expo demo step 3)", async () => {
    const ctx = ctxFor("usr_karen");
    const doc = await uploadDocument(ctx, { name: "jd.pdf", bytes: await sampleJohnDeereInvoice() });
    expect(doc.extraction?.documentNumber).toBe("JD-28712");
    const top = doc.match!.candidates[0]!;
    expect(top.confidence).toBeGreaterThanOrEqual(0.95);
    const r = confirmMatch(ctx, doc.id, top.transactionId);
    expect(r.txn.status).toBe("processed");
    expect(db().inbox.find((i) => i.id === "inb_jd")!.status).toBe("resolved");
  });

  it("rejects disguised uploads by content sniffing", async () => {
    const ctx = ctxFor("usr_karen");
    await expect(uploadDocument(ctx, { name: "evil.pdf", bytes: new TextEncoder().encode("<script>alert(1)</script>") })).rejects.toThrow(/Only PDF/);
  });
});

describe("Reconciliation and close", () => {
  it("resolving the Chase exceptions reaches zero difference and closes September", async () => {
    const sarah = ctxFor("usr_sarah");
    const marcus = ctxFor("usr_marcus");
    const rec = db().reconciliations.find((r) => r.id === "rec_smith_1245_2026-09")!;
    let d = recDetail(sarah, rec.id);
    expect(d.summary.difference).not.toBe(0);
    const fees = db().glAccounts.find((a) => a.orgId === "org_smith" && a.subtype === "bank_fees")!;
    const other = db().glAccounts.find((a) => a.orgId === "org_smith" && a.subtype === "other_income")!;
    for (const l of rec.lines.filter((x) => x.state === "unmatched")) createFromLine(sarah, rec.id, l.id, l.amount > 0 ? other.id : fees.id);
    d = recDetail(sarah, rec.id);
    for (const i of d.summary.duplicateBook) resolveBookItem(sarah, rec.id, i.transactionId, "duplicate");
    d = recDetail(sarah, rec.id);
    for (const i of d.summary.unreconciledBook) resolveBookItem(sarah, rec.id, i.transactionId, "outstanding");
    d = recDetail(sarah, rec.id);
    expect(d.summary.difference).toBe(0);
    expect(d.summary.canApprove).toBe(true);
    expect(() => approveRec(sarah, rec.id)).not.toThrow(); // service-level; RBAC is enforced at the action layer
    const cp = db().closePeriods.find((c) => c.orgId === "org_smith" && c.period === "2026-09")!;
    expect(closeStatus("org_smith", cp).readyForApproval).toBe(true);
    approveClose(marcus, "2026-09");
    expect(cp.status).toBe("closed");
  });

  it("bill approval and reminder approval require a human decision", () => {
    const dan = ctxFor("usr_dan");
    const bill = db().bills.find((b) => b.number === "HC-55120")!;
    decideBill(dan, bill.id, "approve");
    expect(bill.status).toBe("approved");
    const inv = db().invoices.find((i) => i.number === "INV-2026-0104")!;
    const r = draftReminder(dan, inv.id);
    expect(r.status).toBe("draft");
    approveReminder(dan, inv.id, r.id, { subject: r.subject, body: r.body });
    expect(r.status).toBe("sent");
    expect(db().outbox.some((e) => e.subject === r.subject)).toBe(true);
  });
});

describe("QuickBooks sync reliability (PRD §21)", () => {
  it("records failures, raises a bundled notification and recovers", async () => {
    const dan = ctxFor("usr_dan");
    setSimulatedFailure(dan, true);
    const failed = await runSync(dan);
    expect(failed.status).toBe("failed");
    expect(db().notifications.some((n) => n.bundleKey === "integration:org_smith:qbo")).toBe(true);
    setSimulatedFailure(dan, false);
    const ok = await runSync(dan, "retry");
    expect(ok.status).toBe("success");
    expect(db().notifications.some((n) => n.bundleKey === "integration:org_smith:qbo")).toBe(false);
  });
});
