import type { DB, FinanceDocument, ID, ISODate, InboxItem, Reconciliation, StatementLine, Transaction } from "@/lib/types";
import { addDays, monthEnd } from "@/lib/dates";
import { scoreStatementMatch } from "@/server/engines/matching";
import { buildPostings, balances, totalsBySubtype } from "@/server/engines/ledger";
import { bookItems } from "@/server/engines/reconciliation";
import { CATEGORIZER_MODEL, CATEGORIZER_VERSION } from "@/server/engines/categorization";
import { Rng, sid } from "./random";
import { SMITH, SMITH_BANKS, smithGl as gl } from "./smith";

const D = 100;

/** Organization-specific rules learned from earlier corrections (PRD §25). Created before processing. */
export function seedSmithRules(db: DB, vendorIds: Record<string, ID>): void {
  const rule = (kind: DB["rules"][number]["kind"], label: string, match: DB["rules"][number]["match"], sub: string, hits: number, createdAt: string) =>
    db.rules.push({ id: sid("rule"), orgId: SMITH, kind, label, match, accountId: gl(sub), createdBy: "usr_sarah", createdFrom: "correction", hits, active: true, createdAt });
  rule("vendor", "Gusto Payroll → Wages & Labor", { vendorId: vendorIds.gusto_pay }, "wages", 46, "2025-01-03T16:00:00.000Z");
  rule("vendor", "Gusto Tax → Payroll Taxes", { vendorId: vendorIds.gusto_tax }, "payroll_taxes", 46, "2025-01-03T16:01:00.000Z");
  rule("vendor", "Casey's → Fuel & Oil", { vendorId: vendorIds.caseys }, "fuel", 88, "2025-01-09T16:00:00.000Z");
  rule("vendor", "Intuit QuickBooks → Software Subscriptions", { vendorId: vendorIds.intuit }, "software", 21, "2025-01-15T16:00:00.000Z");
  rule("recurring", "Hansen Family Trust (cash rent, semiannual) → Cash Rent", { vendorId: vendorIds.hansen, cadenceDays: 182 }, "cash_rent", 3, "2025-03-04T16:00:00.000Z");
  rule("description", "“SERVICE CHARGE” → Bank Fees", { descriptionContains: "SERVICE CHARGE" }, "bank_fees", 21, "2025-01-31T16:00:00.000Z");
  rule("amount", "Key Cooperative bulk fuel over $2,000 → Fuel & Oil", { vendorId: vendorIds.keycoop, amountMin: 2_000 * D }, "fuel", 30, "2025-04-11T16:00:00.000Z");
  rule("organization", "“CHASE CREDIT CRD AUTOPAY” → Credit card payment", { descriptionContains: "CHASE CREDIT CRD AUTOPAY" }, "credit_card", 20, "2025-02-25T16:00:00.000Z");
}

export function seedSmithWorkflow(db: DB, rng: Rng, today: ISODate, vendorIds: Record<string, ID>, now: string): void {
  const txns = db.transactions.filter((t) => t.orgId === SMITH);
  const find = (pred: (t: Transaction) => boolean) => txns.find(pred)!;
  const acct = (sub: string) => gl(sub);

  // ── Curated live (October) transactions ────────────────────────────────────────────────
  const amzn = find((t) => t.description.startsWith("AMZN MKTP US*2K4LL0QT3"));
  amzn.ai = {
    ...amzn.ai!,
    accountId: acct("office_supplies"),
    confidence: 0.62,
    alternatives: [
      { accountId: acct("office_supplies"), confidence: 0.62 },
      { accountId: acct("marketing"), confidence: 0.21 },
      { accountId: acct("other_expense"), confidence: 0.17 },
    ],
    explanation: "Amazon purchases have been split across Office Supplies, Marketing and Other in the past, and this order is larger than usual. The order details aren't on the bank feed.",
    decision: "clarify",
  };
  amzn.status = "waiting_for_client";
  amzn.accountId = undefined;

  const check = find((t) => t.description === "CHECK 1187");
  check.status = "waiting_for_client";
  check.accountId = undefined;

  const sp = find((t) => t.description.startsWith("SP DIGITAL FARM TOOLS"));
  sp.ai = { ...sp.ai!, accountId: acct("office_supplies"), confidence: 0.87, alternatives: [{ accountId: acct("office_supplies"), confidence: 0.87 }, { accountId: acct("software"), confidence: 0.09 }, { accountId: acct("other_expense"), confidence: 0.04 }], explanation: "No history for this payee yet. The bank description suggests Office Supplies.", decision: "review", generatedAt: "2026-10-10T09:31:00.000Z" };
  sp.status = "approved";
  sp.accountId = acct("software");
  sp.reviewedBy = "usr_sarah";
  sp.reviewedAt = "2026-10-10T10:43:00.000Z";
  sp.syncState = "synced";
  db.audit = db.audit.filter((a) => a.entity.id !== sp.id);
  const spBase = { orgId: SMITH, entity: { type: "transaction", id: sp.id, label: "SP Digital Farm Tools · 899.00" } };
  db.audit.push(
    { id: sid("aud"), at: "2026-10-10T09:31:00.000Z", actor: { type: "ai", id: CATEGORIZER_MODEL, name: "Fabrik AI" }, action: "ai.categorization_suggested", ...spBase, after: { account: "Office Supplies" }, ai: { recommendation: "Office Supplies", confidence: 0.87, model: CATEGORIZER_MODEL, modelVersion: CATEGORIZER_VERSION }, risk: { level: "low", reasons: ["Unknown vendor"] } },
    { id: sid("aud"), at: "2026-10-10T10:42:00.000Z", actor: { type: "user", id: "usr_sarah", name: "Sarah Chen", role: "fabrik_bookkeeper" }, action: "transaction.category_changed", ...spBase, before: { account: "Office Supplies" }, after: { account: "Software Subscriptions" }, comment: "Annual subscription for field-mapping software.", humanSeconds: 64 },
    { id: sid("aud"), at: "2026-10-10T10:43:00.000Z", actor: { type: "user", id: "usr_sarah", name: "Sarah Chen", role: "fabrik_bookkeeper" }, action: "transaction.approved", ...spBase, after: { account: "Software Subscriptions", status: "approved" }, humanSeconds: 6 },
    { id: sid("aud"), at: "2026-10-10T10:43:05.000Z", actor: { type: "system", id: "rules-engine", name: "Fabrik rules engine" }, action: "rule.learned", ...spBase, after: { rule: "SP Digital Farm Tools → Software Subscriptions" } },
    { id: sid("aud"), at: "2026-10-10T10:44:00.000Z", actor: { type: "system", id: "qbo-sync", name: "QuickBooks sync" }, action: "transaction.written_back", ...spBase, after: { account: "Software Subscriptions", target: "QuickBooks Online" } },
  );
  db.rules.push({ id: sid("rule"), orgId: SMITH, kind: "vendor", label: "SP Digital Farm Tools → Software Subscriptions", match: { vendorId: vendorIds.spdigital }, accountId: acct("software"), createdBy: "usr_sarah", createdFrom: "correction", hits: 1, active: true, createdAt: "2026-10-10T10:43:05.000Z" });

  // Operating-line repayments in October were already approved by the reviewer (loans always need a human).
  for (const t of txns.filter((x) => x.date >= "2026-10-01" && x.description.startsWith("FCSA LOC") && x.description !== "FCSA LOC INTEREST")) {
    t.status = "approved";
    t.accountId = acct("operating_loc");
    t.reviewedBy = "usr_marcus";
    t.reviewedAt = `${t.date}T16:40:00.000Z`;
  }

  // ── Documents (FabrikIDP) ──────────────────────────────────────────────────────────────
  const hdOct = find((t) => t.description.startsWith("THE HOME DEPOT") && t.date === "2026-10-07");
  const docs: FinanceDocument[] = [];
  const doc = (d: Partial<FinanceDocument> & Pick<FinanceDocument, "filename" | "kind">): FinanceDocument => {
    const full: FinanceDocument = { id: sid("doc"), orgId: SMITH, mimeType: "application/pdf", size: rng.int(60_000, 420_000), status: "extracted", tags: [], uploadedBy: "usr_karen", uploadedAt: now, ...d };
    docs.push(full);
    return full;
  };
  const ex = (vendor: string, num: string | undefined, date: ISODate, total: number, extra: Partial<NonNullable<FinanceDocument["extraction"]>> = {}) => ({
    vendor,
    documentNumber: num,
    documentDate: date,
    total: Math.round(total * D),
    subtotal: Math.round(total * D),
    tax: 0,
    currency: "USD",
    lineItems: [],
    fieldConfidence: { vendor: 0.99, documentNumber: 0.98, documentDate: 0.99, total: 0.995 },
    provider: "FabrikIDP",
    providerVersion: "idp-2026.09",
    extractedAt: `${date}T18:00:00.000Z`,
    warnings: [],
    ...extra,
  });
  const receipt = doc({
    filename: "receipt_231.pdf",
    kind: "receipt",
    status: "matched",
    uploadedAt: "2026-10-08T13:12:00.000Z",
    extraction: ex("The Home Depot #2104", "2104-00231", "2026-10-07", 481.22, {
      subtotal: 448.12 * D,
      tax: 33.1 * D,
      lineItems: [
        { description: "Hydraulic hose 3/8 in x 25 ft", quantity: 2, unitPrice: 89.98 * D, amount: 179.96 * D },
        { description: "Shop LED fixture 4 ft", quantity: 3, unitPrice: 54.97 * D, amount: 164.91 * D },
        { description: "Grade 8 bolt assortment", quantity: 1, unitPrice: 103.25 * D, amount: 103.25 * D },
      ],
    }),
    match: { candidates: [{ transactionId: hdOct.id, confidence: 0.99, reasons: ["Amount matches exactly", "Vendor name matches", "Same date"] }], transactionId: hdOct.id, status: "confirmed", confirmedBy: "fabrik-ai", confirmedAt: "2026-10-08T13:13:00.000Z" },
  });
  hdOct.documentIds.push(receipt.id);
  hdOct.ai = { ...hdOct.ai!, documentMatch: { documentId: receipt.id, confidence: 0.99 } };

  for (const [num, file] of [["NAS-77812", "Nutrien_Invoice_NAS-77812.pdf"], ["HC-55120", "HeartlandCoop_HC-55120.pdf"], ["PHB-2027-EO-3381", "Pioneer_EarlyOrder_3381.pdf"]] as const) {
    const bill = db.bills.find((b) => b.number === num)!;
    const vendor = db.vendors.find((v) => v.id === bill.vendorId)!;
    const d = doc({ filename: file, kind: "invoice", uploadedAt: `${bill.issueDate}T15:00:00.000Z`, extraction: { ...ex(vendor.name, num, bill.issueDate, bill.amount / D), dueDate: bill.dueDate }, match: { candidates: [], status: "none" } });
    bill.documentId = d.id;
  }
  for (const [file, bank] of [["Chase_Business_1245_Statement_2026-09.pdf", SMITH_BANKS.chase], ["FSB_Operating_4821_Statement_2026-09.pdf", SMITH_BANKS.fsb], ["Chase_Ink_9012_Statement_2026-09.pdf", SMITH_BANKS.cc], ["FarmCredit_Savings_7730_Statement_2026-09.pdf", SMITH_BANKS.fcs]] as const) {
    doc({ filename: file, kind: bank === SMITH_BANKS.cc ? "credit_card_statement" : "bank_statement", period: "2026-09", uploadedAt: "2026-10-03T14:00:00.000Z", tags: [`bank:${bank}`], extraction: { ...ex(file.split("_")[0]!, undefined, "2026-09-30", 0), total: undefined, lineItems: [] } });
  }
  doc({ filename: "Articles_of_Organization_Smith_Family_Farms_LLC.pdf", kind: "entity_document", status: "uploaded", uploadedBy: "usr_dan", uploadedAt: "2025-11-05T17:00:00.000Z", tags: ["funding:entity"] });
  doc({ filename: "Operating_Agreement_2019_amended.pdf", kind: "entity_document", status: "uploaded", uploadedBy: "usr_dan", uploadedAt: "2025-11-05T17:02:00.000Z", tags: ["funding:ownership"] });
  doc({ filename: "2025_Form_1065_Smith_Family_Farms.pdf", kind: "tax_document", status: "uploaded", uploadedBy: "usr_linda", uploadedAt: "2026-03-12T19:00:00.000Z", tags: ["funding:tax-return", "tax:2025"] });
  doc({ filename: "2025_CCC-1099-G_USDA.pdf", kind: "tax_document", status: "uploaded", uploadedBy: "usr_karen", uploadedAt: "2026-02-02T15:00:00.000Z", tags: ["tax:2025"] });
  doc({ filename: "Equipment_List_and_Depreciation_Schedule_2026.pdf", kind: "farm_record", status: "uploaded", uploadedBy: "usr_karen", uploadedAt: "2026-07-01T15:00:00.000Z", tags: ["funding:equipment-list"] });
  // A few matched fuel receipts.
  for (const t of txns.filter((x) => x.description.startsWith("CASEYS") && x.date >= "2026-09-01" && x.date < "2026-10-01").slice(0, 4)) {
    const d = doc({ filename: `caseys_receipt_${t.date.replace(/-/g, "")}.jpg`, mimeType: "image/jpeg", kind: "receipt", status: "matched", uploadedAt: `${t.date}T20:00:00.000Z`, extraction: ex("Casey's General Store #2215", undefined, t.date, -t.amount / D), match: { candidates: [{ transactionId: t.id, confidence: 0.97, reasons: ["Amount matches exactly", "Vendor name matches", "Same date"] }], transactionId: t.id, status: "confirmed", confirmedBy: "usr_karen", confirmedAt: `${t.date}T20:05:00.000Z` } });
    t.documentIds.push(d.id);
  }
  db.documents.push(...docs);

  // ── Finance Inbox (Expo §23: 2 transactions, 1 bill approval, 1 missing document, 1 funding question, 1 overdue invoice) ──
  const jd = find((t) => t.description.startsWith("JOHN DEERE FINANCIAL MULTI-USE ACCT 77104"));
  const heartlandBill = db.bills.find((b) => b.number === "HC-55120")!;
  const olsonInv = db.invoices.find((i) => i.number === "INV-2026-0104")!;
  const inbox: InboxItem[] = [
    {
      id: "inb_amzn",
      orgId: SMITH,
      type: "transaction_clarification",
      title: "We need help categorizing this transaction",
      body: "We found a $1,482.20 Amazon purchase on October 8. Was this for office supplies, marketing, or something else?",
      status: "open",
      priority: "normal",
      related: { type: "transaction", id: amzn.id },
      options: [
        { label: "Office Supplies", value: acct("office_supplies"), confidence: 0.62 },
        { label: "Marketing & Advertising", value: acct("marketing"), confidence: 0.21 },
        { label: "Other Expenses", value: acct("other_expense"), confidence: 0.17 },
      ],
      createdBy: "usr_sarah",
      createdAt: "2026-10-09T15:20:00.000Z",
      period: "2026-10",
    },
    {
      id: "inb_check",
      orgId: SMITH,
      type: "transaction_clarification",
      title: "Who was check #1187 written to?",
      body: "Check #1187 for $3,250.00 cleared on October 13, but it isn't in QuickBooks yet and the bank feed doesn't show the payee. Who was it paid to, and what was it for?",
      status: "open",
      priority: "normal",
      related: { type: "transaction", id: check.id },
      options: [
        { label: "Custom hire / machine work", value: acct("custom_hire") },
        { label: "Cash rent", value: acct("cash_rent") },
        { label: "Repairs & maintenance", value: acct("repairs") },
        { label: "Something else", value: "other" },
      ],
      createdBy: "fabrik-ai",
      createdAt: "2026-10-14T07:00:00.000Z",
      period: "2026-10",
    },
    {
      id: "inb_bill",
      orgId: SMITH,
      type: "bill_approval",
      title: "Approve Heartland Co-op bill HC-55120",
      body: "$42,000.00 for LP gas for grain drying, due October 21. The amount is 38% higher than last October's drying bill, which is consistent with this year's wetter harvest.",
      status: "open",
      priority: "high",
      related: { type: "bill", id: heartlandBill.id },
      createdBy: "fabrik-ai",
      createdAt: "2026-10-07T07:00:00.000Z",
      period: "2026-10",
    },
    {
      id: "inb_jd",
      orgId: SMITH,
      type: "missing_document",
      title: "Upload the John Deere invoice for $14,820",
      body: "A $14,820.00 payment to John Deere Financial posted on October 9. Purchases over $10,000 need a supporting invoice before we can finalize them. Upload the invoice and Fabrik will match it automatically.",
      status: "open",
      priority: "normal",
      related: { type: "transaction", id: jd.id },
      createdBy: "fabrik-ai",
      createdAt: "2026-10-10T07:00:00.000Z",
      period: "2026-10",
    },
    {
      id: "inb_funding",
      orgId: SMITH,
      type: "funding_info_request",
      title: "Confirm base acres to strengthen your ARC/PLC match",
      body: "Fabrik identified ARC/PLC as a high-potential match. The 2026 election and enrollment window closes December 11, 2026. Confirm the farm's base acres (from your FSA farm records) so we can complete the readiness checklist.",
      status: "open",
      priority: "normal",
      related: { type: "funding", id: "fsa-arc-plc" },
      createdBy: "fabrik-ai",
      createdAt: "2026-10-12T07:00:00.000Z",
    },
    {
      id: "inb_overdue",
      orgId: SMITH,
      type: "overdue_invoice",
      title: "Olson Farms is 93 days past due on $30,000",
      body: "Invoice INV-2026-0104 for custom harvest & hauling was due July 15. Fabrik can draft a professional reminder for you to review — nothing is sent without your approval.",
      status: "open",
      priority: "normal",
      related: { type: "invoice", id: olsonInv.id },
      createdBy: "fabrik-ai",
      createdAt: "2026-10-13T07:00:00.000Z",
    },
    // Resolved history
    { id: "inb_h1", orgId: SMITH, type: "transaction_clarification", title: "What was the $2,840 Tractor Supply purchase for?", body: "", status: "resolved", priority: "normal", createdBy: "usr_sarah", createdAt: "2026-09-16T15:00:00.000Z", resolvedAt: "2026-09-16T19:12:00.000Z", response: { label: "Repairs & Maintenance", comment: "Fencing supplies for the north pasture.", userId: "usr_karen", at: "2026-09-16T19:12:00.000Z" }, period: "2026-09" },
    { id: "inb_h2", orgId: SMITH, type: "missing_receipt", title: "Receipt for Hilton Garden Inn ($412.88)", body: "", status: "resolved", priority: "low", createdBy: "fabrik-ai", createdAt: "2026-09-02T07:00:00.000Z", resolvedAt: "2026-09-03T14:00:00.000Z", response: { comment: "Uploaded.", userId: "usr_dan", at: "2026-09-03T14:00:00.000Z" }, period: "2026-08" },
    { id: "inb_h3", orgId: SMITH, type: "monthly_close_question", title: "Was the August Pioneer refund applied to next year's order?", body: "", status: "resolved", priority: "normal", createdBy: "usr_marcus", createdAt: "2026-09-08T15:00:00.000Z", resolvedAt: "2026-09-09T13:40:00.000Z", response: { label: "Yes", comment: "Applied to the 2027 early order.", userId: "usr_karen", at: "2026-09-09T13:40:00.000Z" }, period: "2026-08" },
  ];
  db.inbox.push(...inbox);

  // ── Monthly close ──────────────────────────────────────────────────────────────────────
  for (let y = 2025; y <= 2026; y++) {
    for (let m = 1; m <= 12; m++) {
      const period = `${y}-${String(m).padStart(2, "0")}`;
      if (period > "2026-10") break;
      const target = addDays(monthEnd(period), 14);
      const closedOn = addDays(monthEnd(period), 6 + ((m * 7) % 4));
      if (period <= "2026-08") {
        db.closePeriods.push({ id: `cp_smith_${period}`, orgId: SMITH, period, status: "closed", manual: { bookkeeper_review: { done: true, by: "usr_sarah", at: `${addDays(closedOn, -1)}T16:00:00.000Z` }, reviewer_approval: { done: true, by: "usr_marcus", at: `${closedOn}T15:00:00.000Z` }, reports_generated: { done: true, by: "fabrik-ai", at: `${closedOn}T15:05:00.000Z` } }, closedAt: `${closedOn}T15:05:00.000Z`, packageGeneratedAt: `${closedOn}T15:05:00.000Z`, targetCloseDate: target });
      } else if (period === "2026-09") {
        db.closePeriods.push({ id: `cp_smith_${period}`, orgId: SMITH, period, status: "in_review", manual: { bookkeeper_review: { done: true, by: "usr_sarah", at: "2026-10-09T17:30:00.000Z", note: "All September activity reviewed; Chase reconciliation awaiting fee entries." } }, targetCloseDate: target });
      } else {
        db.closePeriods.push({ id: `cp_smith_${period}`, orgId: SMITH, period, status: "open", manual: {}, targetCloseDate: target });
      }
    }
  }

  // ── Reconciliations ────────────────────────────────────────────────────────────────────
  const postings = buildPostings({ accounts: db.glAccounts.filter((a) => a.orgId === SMITH), bankAccounts: db.bankAccounts.filter((b) => b.orgId === SMITH), transactions: txns, invoices: [], bills: [], journalEntries: db.journalEntries.filter((j) => j.orgId === SMITH) });
  for (const period of ["2026-08", "2026-09"]) {
    for (const bank of db.bankAccounts.filter((b) => b.orgId === SMITH)) {
      const start = `${period}-01`;
      const end = monthEnd(period);
      const startBal = balances(postings, addDays(start, -1)).get(bank.glAccountId) ?? 0;
      const items = bookItems(bank, txns, start, end);
      const isChaseSep = bank.id === SMITH_BANKS.chase && period === "2026-09";
      let onStatement = items;
      if (isChaseSep) {
        // The second MidAmerican import is a duplicate; the last check of the month clears in October.
        const dupId = items.filter((i) => i.description === "MIDAMERICAN ENERGY ACH 30311")[1]?.transactionId;
        const lateCheck = items.find((i) => i.description.startsWith("CHECK #1179"))?.transactionId;
        onStatement = items.filter((i) => i.transactionId !== dupId && i.transactionId !== lateCheck);
      }
      const lines: StatementLine[] = onStatement.map((i) => ({ id: sid("stl"), date: i.date, description: i.description, amount: i.amount, state: "matched", transactionId: i.transactionId, confidence: scoreStatementMatch(i, i) }));
      if (isChaseSep) {
        lines.push({ id: sid("stl"), date: "2026-09-18", description: "WIRE TRANSFER FEE", amount: -30 * D, state: "unmatched" });
        lines.push({ id: sid("stl"), date: "2026-09-30", description: "SERVICE CHARGE ANALYSIS", amount: -25 * D, state: "unmatched" });
        lines.push({ id: sid("stl"), date: "2026-09-30", description: "INTEREST CREDIT", amount: 3.12 * D, state: "unmatched" });
      }
      const rec: Reconciliation = {
        id: `rec_smith_${bank.mask}_${period}`,
        orgId: SMITH,
        bankAccountId: bank.id,
        period,
        statementStartBalance: startBal,
        statementEndBalance: startBal + lines.reduce((s, l) => s + l.amount, 0),
        statementDate: end,
        lines: lines.sort((a, b) => a.date.localeCompare(b.date)),
        outstandingTxnIds: [],
        status: isChaseSep ? "in_progress" : "approved",
        statementDocumentId: period === "2026-09" ? db.documents.find((d) => d.tags.includes(`bank:${bank.id}`))?.id : undefined,
        preparedBy: "usr_sarah",
        approvedBy: isChaseSep ? undefined : "usr_marcus",
        approvedAt: isChaseSep ? undefined : `${addDays(end, 5)}T15:00:00.000Z`,
      };
      db.reconciliations.push(rec);
    }
  }

  // ── Integrations ───────────────────────────────────────────────────────────────────────
  db.connections.push({ id: "conn_smith_qbo", orgId: SMITH, provider: "quickbooks_online", mode: "sandbox_synthetic", status: "connected", realmId: "9341452819123456", companyName: "Smith Family Farms LLC", connectedAt: "2025-11-03T15:20:00.000Z", connectedBy: "usr_dan", lastSyncAt: `${today}T09:12:00.000Z`, lastSyncStatus: "success" });
  for (let i = 13; i >= 0; i--) {
    const d = addDays(today, -i);
    const failed = d === "2026-10-03";
    const base = { orgId: SMITH, connectionId: "conn_smith_qbo", entities: [{ entity: "Transaction", fetched: rng.int(4, 18), created: rng.int(3, 12), updated: rng.int(0, 3), skipped: rng.int(0, 2) }, { entity: "Bill", fetched: rng.int(0, 3), created: rng.int(0, 2), updated: 0, skipped: 0 }, { entity: "Invoice", fetched: rng.int(0, 2), created: rng.int(0, 1), updated: rng.int(0, 1), skipped: 0 }] };
    if (failed) {
      db.syncRuns.push({ id: sid("sync"), ...base, trigger: "scheduled", idempotencyKey: `qbo:${SMITH}:${d}:scheduled`, attempt: 1, startedAt: `${d}T09:00:00.000Z`, finishedAt: `${d}T09:00:41.000Z`, status: "failed", entities: [], error: { code: "QBO_429", message: "QuickBooks API rate limit reached (HTTP 429). Will retry with backoff.", retryable: true } });
      db.syncRuns.push({ id: sid("sync"), ...base, trigger: "retry", idempotencyKey: `qbo:${SMITH}:${d}:scheduled`, attempt: 2, startedAt: `${d}T09:04:00.000Z`, finishedAt: `${d}T09:05:12.000Z`, status: "success" });
    } else db.syncRuns.push({ id: sid("sync"), ...base, trigger: "scheduled", idempotencyKey: `qbo:${SMITH}:${d}:scheduled`, attempt: 1, startedAt: `${d}T09:${i === 0 ? "11" : "00"}:00.000Z`, finishedAt: `${d}T09:${i === 0 ? "12" : "01"}:20.000Z`, status: "success" });
  }

  // ── Farm / business profile (financials pre-populated from the books) ──────────────────
  const ledgerData = { accounts: db.glAccounts.filter((a) => a.orgId === SMITH), bankAccounts: db.bankAccounts.filter((b) => b.orgId === SMITH), transactions: txns, invoices: db.invoices.filter((i) => i.orgId === SMITH), bills: db.bills.filter((b) => b.orgId === SMITH), journalEntries: db.journalEntries.filter((j) => j.orgId === SMITH) };
  const subs = totalsBySubtype(ledgerData, "0000-01-01", today);
  const ytd = totalsBySubtype(ledgerData, "2026-01-01", today);
  const sumTypes = (m: Map<string, number>, type: string) => [...m.entries()].filter(([s]) => db.glAccounts.find((a) => a.orgId === SMITH && a.subtype === s)?.type === type).reduce((a, [, v]) => a + v, 0);
  db.farmProfiles.push({
    orgId: SMITH,
    legalName: "Smith Family Farms LLC",
    entityType: "llc",
    state: "IA",
    county: "Story",
    ein: "42-•••7731",
    yearsFarming: 34,
    beginningFarmer: false,
    owners: [
      { name: "Dan Smith", pct: 60, role: "Managing Member" },
      { name: "Karen Smith", pct: 40, role: "Member" },
    ],
    revenue: sumTypes(ytd, "income"),
    expenses: sumTypes(ytd, "expense"),
    assets: sumTypes(subs, "asset"),
    debt: sumTypes(subs, "liability"),
    financialsSyncedAt: `${today}T09:12:00.000Z`,
    employees: 8,
    acresOwned: 800,
    acresRented: 1600,
    crops: [
      { crop: "corn", acres: 1380 },
      { crop: "soybeans", acres: 1020 },
    ],
    livestock: [],
    properties: [
      { name: "Home farm (Sec. 14, Howard Twp)", county: "Story", acres: 480, owned: true },
      { name: "North quarter", county: "Story", acres: 320, owned: true },
      { name: "Hansen Family Trust lease", county: "Story", acres: 600, owned: false },
      { name: "Olson Land Co. lease", county: "Hamilton", acres: 400, owned: false },
      { name: "Peterson Estate lease", county: "Story", acres: 350, owned: false },
      { name: "Lund Farms lease", county: "Marshall", acres: 250, owned: false },
    ],
    equipment: [
      { description: "John Deere S780 combine", year: 2019, value: 385_000 * D },
      { description: "John Deere 8R 370 tractor", year: 2021, value: 310_000 * D },
      { description: "Kinze 3660 16-row planter", year: 2012, value: 58_000 * D },
      { description: "Grain cart (1,100 bu)", year: 2026, value: 68_000 * D },
      { description: "Grain bins & dryer (120,000 bu)", year: 2014, value: 260_000 * D },
    ],
    plannedInvestments: [
      { id: "pi_equipment", purpose: "equipment", description: "Replace 2012 planter and add a sprayer with section control", amount: 250_000 * D, timeframe: "Q1 2027" },
      { id: "pi_land", purpose: "land_purchase", description: "Purchase ~80 acres adjoining the home farm", amount: 1_000_000 * D, timeframe: "2027" },
      { id: "pi_energy", purpose: "energy", description: "Grain dryer upgrade with heat-recovery controls; evaluate a 50 kW solar array", amount: 120_000 * D, timeframe: "Before 2027 harvest" },
      { id: "pi_conservation", purpose: "conservation", description: "Expand cereal rye cover crops from 300 to 600 acres", amount: 18_000 * D, timeframe: "Fall 2026" },
    ],
    activities: ["Corn and soybean production", "Grain storage and drying", "Custom harvest for neighbors"],
    conservationPractices: ["Cover crops (cereal rye, 300 ac)", "Strip-till on 900 ac", "Grassed waterways"],
    hasCommercialCredit: true,
    ruralArea: true,
    valueAddedActivity: false,
    updatedAt: "2026-10-01T15:00:00.000Z",
    updatedBy: "usr_dan",
  });
  db.fundingWatches.push({ id: sid("fw"), orgId: SMITH, programId: "fsa-arc-plc", status: "preparing", note: "Talk to Story County FSA office about base acres.", updatedAt: "2026-10-12T15:00:00.000Z", updatedBy: "usr_dan" });

  // ── Tax & Credits (proposed module) ────────────────────────────────────────────────────
  const tdl = (form: string, title: string, dueDate: ISODate, basis: string, owner: "client" | "cpa" | "fabrik", sourceUrl?: string, jurisdiction: "federal" | "state" = "federal") =>
    db.taxDeadlines.push({ id: sid("tax"), orgId: SMITH, form, title, jurisdiction, dueDate, basis, sourceUrl, status: "upcoming", owner });
  tdl("Form 943", "Employer's Annual Federal Tax Return for Agricultural Employees (2026)", "2027-02-01", "Due January 31; moves to the next business day when it falls on a weekend.", "cpa", "https://www.irs.gov/forms-pubs/about-form-943");
  tdl("Form W-2 / W-3", "Wage statements to employees and SSA (2026)", "2027-02-01", "Due January 31; next business day on weekends.", "fabrik", "https://www.irs.gov/forms-pubs/about-form-w-2");
  tdl("Form 1099-NEC", "Nonemployee compensation to contractors and IRS (2026)", "2027-02-01", "Due January 31; next business day on weekends.", "fabrik", "https://www.irs.gov/forms-pubs/about-form-1099-nec");
  tdl("Form 1065 + Schedules K-1", "U.S. Return of Partnership Income (tax year 2026)", "2027-03-15", "15th day of the 3rd month after year end for calendar-year partnerships.", "cpa", "https://www.irs.gov/forms-pubs/about-form-1065");
  tdl("IA 1065", "Iowa Partnership Return (tax year 2026)", "2027-04-30", "Iowa partnership return — confirm current due date with your CPA.", "cpa", "https://revenue.iowa.gov", "state");
  const req = (title: string, description: string, status: DB["taxRequests"][number]["status"], documentTag?: string) =>
    db.taxRequests.push({ id: sid("txr"), orgId: SMITH, taxYear: 2026, title, description, status, documentId: documentTag ? db.documents.find((d) => d.tags.includes(documentTag))?.id : undefined, requestedAt: "2026-10-01T15:00:00.000Z", history: [{ status: "requested", userId: "usr_linda", at: "2026-10-01T15:00:00.000Z" }, ...(status !== "requested" ? [{ status, userId: status === "received" ? "usr_karen" : "usr_linda", at: "2026-10-08T15:00:00.000Z" }] : [])] });
  req("Prior-year return (2025 Form 1065)", "Filed 2025 partnership return and K-1s for carry-forward items.", "cpa_reviewed", "funding:tax-return");
  req("CCC-1099-G from USDA", "Government program payments reported by USDA for 2026 (arrives in January).", "requested");
  req("Fixed asset additions & disposals", "Invoices for equipment placed in service in 2026 (grain cart, planter if purchased).", "received", "funding:equipment-list");
  req("Year-end grain inventory", "Bushels on hand at December 31 by crop and location.", "requested");
  req("Crop insurance statements", "Premium and any indemnity statements for 2026.", "requested");
  req("Farm Credit Form 1098 / loan statements", "Year-end interest statements for real estate and operating loans.", "requested");

  // ── Notifications (bundled, not per transaction) ──────────────────────────────────────
  db.notifications.push(
    { id: "ntf_inbox", orgId: SMITH, kind: "inbox", title: "Fabrik needs your help with 6 items", body: "2 transactions, 1 bill approval, 1 missing document, 1 funding question, 1 overdue invoice.", href: "/inbox", bundleKey: `inbox:${SMITH}`, count: 6, readBy: [], createdAt: "2026-10-09T15:20:00.000Z", updatedAt: "2026-10-14T07:00:00.000Z" },
    { id: "ntf_close", orgId: SMITH, kind: "books_ready", title: "September books are in final review", body: "Bookkeeper review is complete. Reviewer approval is next.", href: "/close", bundleKey: `close:${SMITH}:2026-09`, count: 1, readBy: [], createdAt: "2026-10-09T17:30:00.000Z", updatedAt: "2026-10-09T17:30:00.000Z" },
    { id: "ntf_funding", orgId: SMITH, kind: "funding", title: "3 high-potential funding matches", body: "ARC/PLC enrollment closes Dec 11, 2026.", href: "/funding", bundleKey: `funding:${SMITH}`, count: 3, readBy: ["usr_dan"], createdAt: "2026-10-12T07:00:00.000Z", updatedAt: "2026-10-12T07:00:00.000Z" },
    { id: "ntf_aug", orgId: SMITH, kind: "books_ready", title: "August books are ready", body: "Your August finance package is available.", href: "/close", bundleKey: `close:${SMITH}:2026-08`, count: 1, readBy: ["usr_dan", "usr_karen"], createdAt: "2026-09-08T15:05:00.000Z", updatedAt: "2026-09-08T15:05:00.000Z" },
  );

}
