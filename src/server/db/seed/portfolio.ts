import type { BankAccount, DB, GLAccount, ID, ISODate, Organization, Reconciliation, StatementLine, Transaction } from "@/lib/types";
import { buildChartOfAccounts } from "@/server/domain/coa";
import { addDays, monthEnd } from "@/lib/dates";
import { buildPostings, balances } from "@/server/engines/ledger";
import { bookItems } from "@/server/engines/reconciliation";
import { scoreStatementMatch } from "@/server/engines/matching";
import { hashPassword } from "@/server/auth/password";
import { Rng, sid } from "./random";
import { processTransactions, type Truth } from "./process";

type Health = "current" | "attention" | "at_risk";

interface OrgDef {
  key: string;
  name: string;
  industry: string;
  state: string;
  variant: "farm" | "generic";
  health: Health;
  volume: number; // transactions per month
  bookkeeper: ID;
  reviewer: ID;
  plan: Organization["plan"];
  note?: "rec_difference" | "missing_statement" | "integration_error" | "catch_up" | "review_backlog";
}

const B1 = "usr_sarah";
const B2 = "usr_tom";
const B3 = "usr_jess";
const R1 = "usr_marcus";
const R2 = "usr_elena";

export const PORTFOLIO: OrgDef[] = [
  { key: "acme", name: "Acme Holdings LLC", industry: "Agricultural land holding", state: "IA", variant: "generic", health: "at_risk", volume: 110, bookkeeper: B1, reviewer: R1, plan: "growth", note: "rec_difference" },
  { key: "landco", name: "LandCo Partners", industry: "Farmland investment", state: "NE", variant: "generic", health: "attention", volume: 90, bookkeeper: B2, reviewer: R1, plan: "growth", note: "review_backlog" },
  { key: "farmco", name: "FarmCo Ag Services", industry: "Custom farming services", state: "IA", variant: "farm", health: "at_risk", volume: 85, bookkeeper: B3, reviewer: R2, plan: "essentials", note: "catch_up" },
  { key: "abc", name: "ABC Equipment Rental", industry: "Farm equipment rental", state: "IL", variant: "generic", health: "attention", volume: 120, bookkeeper: B2, reviewer: R2, plan: "growth", note: "integration_error" },
  { key: "prairieridge", name: "Prairie Ridge Cattle Co.", industry: "Cow-calf operation", state: "NE", variant: "farm", health: "current", volume: 95, bookkeeper: B1, reviewer: R1, plan: "growth" },
  { key: "cedarvalley", name: "Cedar Valley Orchards", industry: "Apple orchard & cider", state: "IA", variant: "farm", health: "current", volume: 140, bookkeeper: B3, reviewer: R2, plan: "growth" },
  { key: "hawkeye", name: "Hawkeye Grain Partners", industry: "Grain farming", state: "IA", variant: "farm", health: "current", volume: 100, bookkeeper: B1, reviewer: R1, plan: "enterprise" },
  { key: "bluestem", name: "Blue Stem Land Trust", industry: "Conservation land trust", state: "KS", variant: "generic", health: "current", volume: 45, bookkeeper: B2, reviewer: R2, plan: "essentials" },
  { key: "northfork", name: "North Fork Dairy", industry: "Dairy farm", state: "WI", variant: "farm", health: "current", volume: 150, bookkeeper: B3, reviewer: R1, plan: "enterprise" },
  { key: "riverbend", name: "Riverbend Vineyards", industry: "Vineyard & winery", state: "MO", variant: "generic", health: "current", volume: 130, bookkeeper: B1, reviewer: R2, plan: "growth" },
  { key: "sunflower", name: "Sunflower Ag Services", industry: "Agronomy services", state: "KS", variant: "generic", health: "current", volume: 85, bookkeeper: B2, reviewer: R1, plan: "growth" },
  { key: "goldenplains", name: "Golden Plains Seed Co.", industry: "Seed dealership", state: "SD", variant: "generic", health: "current", volume: 115, bookkeeper: B3, reviewer: R2, plan: "growth" },
  { key: "loesshills", name: "Loess Hills Land LLC", industry: "Farmland leasing", state: "IA", variant: "generic", health: "current", volume: 40, bookkeeper: B1, reviewer: R1, plan: "essentials" },
  { key: "tworivers", name: "Two Rivers Farm Management", industry: "Farm management company", state: "MN", variant: "generic", health: "current", volume: 105, bookkeeper: B2, reviewer: R2, plan: "enterprise" },
  { key: "redoak", name: "Red Oak Poultry", industry: "Poultry contract grower", state: "IA", variant: "farm", health: "current", volume: 80, bookkeeper: B3, reviewer: R1, plan: "growth" },
  { key: "skyline", name: "Skyline Hay & Forage", industry: "Hay production", state: "SD", variant: "farm", health: "current", volume: 60, bookkeeper: B1, reviewer: R2, plan: "essentials" },
  { key: "meadowlark", name: "Meadowlark Organics", industry: "Organic vegetables", state: "MN", variant: "farm", health: "current", volume: 125, bookkeeper: B2, reviewer: R1, plan: "growth" },
  { key: "ironhorse", name: "Iron Horse Ag Equipment", industry: "Equipment dealer", state: "NE", variant: "generic", health: "current", volume: 140, bookkeeper: B3, reviewer: R2, plan: "enterprise" },
  { key: "prairiewind", name: "Prairie Wind Energy Leases", industry: "Wind lease income", state: "IA", variant: "generic", health: "current", volume: 35, bookkeeper: B1, reviewer: R1, plan: "essentials" },
  { key: "heartwood", name: "Heartwood Timber LLC", industry: "Timberland", state: "MO", variant: "generic", health: "current", volume: 45, bookkeeper: B2, reviewer: R2, plan: "essentials" },
  { key: "clearcreek", name: "Clear Creek Aquaculture", industry: "Fish farm", state: "AR", variant: "farm", health: "current", volume: 70, bookkeeper: B3, reviewer: R1, plan: "growth" },
  { key: "bigsky", name: "Big Sky Ranch Partners", industry: "Ranch & hunting leases", state: "MT", variant: "farm", health: "current", volume: 75, bookkeeper: B1, reviewer: R2, plan: "growth" },
  { key: "greenfield", name: "Greenfield Hemp Co.", industry: "Industrial hemp", state: "KY", variant: "farm", health: "attention", volume: 95, bookkeeper: B2, reviewer: R1, plan: "growth" },
  { key: "oakmont", name: "Oakmont Rural Supply", industry: "Farm & ranch retail", state: "IL", variant: "generic", health: "current", volume: 150, bookkeeper: B3, reviewer: R2, plan: "enterprise" },
];

type Bank = "op" | "cc";
interface VTemplate {
  key: string;
  name: string;
  alias: string;
  descriptor: string;
  sub: string;
  bank: Bank;
  range: [number, number];
  weight: number;
  mixed?: [string, number][];
}

const FARM_VENDORS: VTemplate[] = [
  { key: "caseys", name: "Casey's", alias: "CASEYS GEN STORE", descriptor: "CASEYS GEN STORE 3301", sub: "fuel", bank: "cc", range: [40, 380], weight: 10 },
  { key: "coop", name: "Farmers Co-op", alias: "FARMERS COOP", descriptor: "FARMERS COOP ELEVATOR", sub: "fertilizer", bank: "op", range: [600, 8500], weight: 6, mixed: [["fertilizer", 0.55], ["chemicals", 0.25], ["fuel", 0.2]] },
  { key: "seed", name: "Pioneer Seeds", alias: "PIONEER HI-BRED", descriptor: "PIONEER HI-BRED INTL ACH", sub: "seed", bank: "op", range: [1500, 9500], weight: 2 },
  { key: "napa", name: "NAPA Auto Parts", alias: "NAPA AUTO PARTS", descriptor: "NAPA AUTO PARTS 2210", sub: "repairs", bank: "cc", range: [30, 700], weight: 6 },
  { key: "tsc", name: "Tractor Supply Co.", alias: "TRACTOR SUPPLY", descriptor: "TRACTOR SUPPLY #0442", sub: "repairs", bank: "cc", range: [25, 500], weight: 5, mixed: [["repairs", 0.75], ["office_supplies", 0.1], ["other_expense", 0.15]] },
  { key: "jd", name: "John Deere Financial", alias: "JOHN DEERE FINANCIAL", descriptor: "JOHN DEERE FINANCIAL MULTI-USE", sub: "equipment_machinery", bank: "op", range: [400, 9000], weight: 3 },
  { key: "power", name: "Rural Electric Co-op", alias: "RURAL ELECTRIC", descriptor: "RURAL ELECTRIC COOP ACH", sub: "utilities", bank: "op", range: [300, 2400], weight: 2 },
  { key: "gusto", name: "Gusto Payroll", alias: "GUSTO PAYROLL", descriptor: "GUSTO PAYROLL NET", sub: "wages", bank: "op", range: [6000, 22000], weight: 2 },
  { key: "ins", name: "Farm Bureau Financial Services", alias: "FARM BUREAU FIN", descriptor: "FARM BUREAU FIN SVC PREMIUM", sub: "insurance", bank: "op", range: [600, 4200], weight: 1 },
  { key: "vet", name: "Valley Veterinary Clinic", alias: "VALLEY VETERINARY", descriptor: "VALLEY VETERINARY CLINIC", sub: "other_expense", bank: "cc", range: [80, 1400], weight: 2 },
  { key: "amazon", name: "Amazon", alias: "AMZN MKTP", descriptor: "AMZN MKTP US", sub: "office_supplies", bank: "cc", range: [15, 300], weight: 4, mixed: [["office_supplies", 0.6], ["repairs", 0.2], ["other_expense", 0.2]] },
  { key: "intuit", name: "Intuit QuickBooks", alias: "INTUIT *QBOOKS", descriptor: "INTUIT *QBOOKS ONLINE", sub: "software", bank: "cc", range: [90, 90], weight: 1 },
  { key: "buyer1", name: "Cargill", alias: "CARGILL INC", descriptor: "CARGILL INC DEPOSIT", sub: "grain_sales_corn", bank: "op", range: [6000, 60000], weight: 4 },
  { key: "buyer2", name: "Local Livestock Auction", alias: "LIVESTOCK AUCTION", descriptor: "LIVESTOCK AUCTION MKT DEPOSIT", sub: "other_income", bank: "op", range: [3000, 40000], weight: 2 },
];

const GENERIC_VENDORS: VTemplate[] = [
  { key: "aws", name: "Amazon Web Services", alias: "AMAZON WEB SERVICES", descriptor: "AMAZON WEB SERVICES AWS.AMAZON.CO", sub: "software", bank: "cc", range: [80, 1400], weight: 2 },
  { key: "gws", name: "Google Workspace", alias: "GOOGLE *GSUITE", descriptor: "GOOGLE *GSUITE_BUSINESS", sub: "software", bank: "cc", range: [72, 240], weight: 2 },
  { key: "comcast", name: "Comcast Business", alias: "COMCAST BUSINESS", descriptor: "COMCAST BUSINESS 8771", sub: "utilities", bank: "op", range: [180, 420], weight: 1 },
  { key: "gusto", name: "Gusto Payroll", alias: "GUSTO PAYROLL", descriptor: "GUSTO PAYROLL NET", sub: "wages", bank: "op", range: [8000, 30000], weight: 2 },
  { key: "staples", name: "Staples", alias: "STAPLES", descriptor: "STAPLES 00412", sub: "office_supplies", bank: "cc", range: [20, 320], weight: 3 },
  { key: "delta", name: "Delta Air Lines", alias: "DELTA AIR", descriptor: "DELTA AIR 0067", sub: "travel", bank: "cc", range: [180, 900], weight: 2 },
  { key: "uber", name: "Uber", alias: "UBER *TRIP", descriptor: "UBER *TRIP HELP.UBER.COM", sub: "travel", bank: "cc", range: [12, 80], weight: 4 },
  { key: "linkedin", name: "LinkedIn Ads", alias: "LINKEDIN", descriptor: "LINKEDIN *ADS", sub: "marketing", bank: "cc", range: [150, 1800], weight: 1 },
  { key: "rent", name: "Main Street Properties", alias: "MAIN STREET PROPERTIES", descriptor: "MAIN STREET PROPERTIES RENT", sub: "rent", bank: "op", range: [2500, 6500], weight: 1 },
  { key: "shell", name: "Shell", alias: "SHELL OIL", descriptor: "SHELL OIL 5744", sub: "fuel", bank: "cc", range: [35, 160], weight: 4 },
  { key: "homedepot", name: "The Home Depot", alias: "HOME DEPOT", descriptor: "THE HOME DEPOT #3302", sub: "repairs", bank: "cc", range: [25, 650], weight: 3, mixed: [["repairs", 0.8], ["office_supplies", 0.2]] },
  { key: "statefarm", name: "State Farm", alias: "STATE FARM", descriptor: "STATE FARM INSURANCE PREM", sub: "insurance", bank: "op", range: [400, 2200], weight: 1 },
  { key: "cafe", name: "Panera Bread", alias: "PANERA", descriptor: "PANERA BREAD #601", sub: "meals", bank: "cc", range: [12, 140], weight: 3 },
  { key: "cpa", name: "Prairie CPA Group", alias: "PRAIRIE CPA", descriptor: "PRAIRIE CPA GROUP", sub: "professional_fees", bank: "op", range: [600, 3500], weight: 1 },
  { key: "stripe", name: "Stripe", alias: "STRIPE", descriptor: "STRIPE TRANSFER ST-", sub: "sales", bank: "op", range: [1500, 22000], weight: 5 },
  { key: "lease", name: "Lease income", alias: "LEASE PMT", descriptor: "LEASE PMT RECEIVED TENANT", sub: "rental_income", bank: "op", range: [4000, 28000], weight: 2 },
];

export function seedPortfolio(db: DB, rng: Rng, today: ISODate): void {
  const ownerHash = hashPassword(`portfolio-${rng.int(1, 1e9)}-not-a-demo-login`);
  for (const def of PORTFOLIO) {
    const orgId = `org_${def.key}`;
    const org: Organization = {
      id: orgId,
      name: def.name,
      legalName: def.name,
      industry: def.industry,
      state: def.state,
      plan: def.plan,
      status: "active",
      closeFrequency: def.key === "bluestem" || def.key === "loesshills" ? "quarterly" : "monthly",
      assignedBookkeeperId: def.bookkeeper,
      assignedReviewerId: def.reviewer,
      thresholds: { autoApprove: 0.98, review: 0.85 },
      largeTransactionThreshold: 50_000_00,
      reportingBasis: "accrual",
      fiscalYearStartMonth: 1,
      isDemo: false,
      createdAt: "2026-02-01T15:00:00.000Z",
      catchUp: def.note === "catch_up" ? { fromPeriod: "2026-06", toPeriod: "2026-09", monthsBehind: 4, startedAt: "2026-10-06T15:00:00.000Z" } : undefined,
    };
    db.organizations.push(org);
    const owner = `usr_owner_${def.key}`;
    db.users.push({ id: owner, email: `owner@${def.key}.example`, name: `${def.name.split(" ")[0]} Owner`, title: "Owner", passwordHash: ownerHash, mfaEnabled: false, status: "active", avatarHue: rng.int(0, 359), createdAt: org.createdAt, notificationPrefs: { email: true, inApp: true, digest: "daily" } });
    db.memberships.push({ id: sid("mem"), userId: owner, orgId, role: "business_owner", createdAt: org.createdAt });

    const glId = (sub: string) => `gl_${def.key}_${sub}`;
    db.glAccounts.push(...buildChartOfAccounts(orgId, def.variant, glId));
    const opGl: GLAccount = { id: glId("bank_op"), orgId, code: "1010", name: "Operating Checking ••••" + rng.int(1000, 9999), type: "asset", subtype: "bank", cashFlowSection: "cash", active: true };
    db.glAccounts.push(opGl);
    const banks: Record<Bank, BankAccount> = {
      op: { id: `ba_${def.key}_op`, orgId, name: "Operating Checking", institution: rng.pick(["Wells Fargo", "US Bank", "First National Bank", "Bank Iowa", "Farm Credit"]), mask: opGl.name.slice(-4), kind: "checking", glAccountId: opGl.id },
      cc: { id: `ba_${def.key}_cc`, orgId, name: "Business Card", institution: rng.pick(["Chase", "American Express", "Capital One"]), mask: String(rng.int(1000, 9999)), kind: "credit_card", glAccountId: glId("credit_card") },
    };
    db.bankAccounts.push(banks.op, banks.cc);

    const templates = (def.variant === "farm" ? FARM_VENDORS : GENERIC_VENDORS).filter((t) => db.glAccounts.some((a) => a.id === glId(t.sub)));
    const vendorId = (t: VTemplate) => `ven_${def.key}_${t.key}`;
    for (const t of templates) db.vendors.push({ id: vendorId(t), orgId, name: t.name, aliases: [t.alias], createdAt: org.createdAt });
    // Learned vendor rules for the most frequent unmixed vendors.
    for (const t of templates.filter((x) => !x.mixed && x.weight >= 3)) {
      db.rules.push({ id: sid("rule"), orgId, kind: "vendor", label: `${t.name} → ${db.glAccounts.find((a) => a.id === glId(t.sub))!.name}`, match: { vendorId: vendorId(t) }, accountId: glId(t.sub), createdBy: def.bookkeeper, createdFrom: "correction", hits: rng.int(8, 40), active: true, createdAt: "2026-03-01T15:00:00.000Z" });
    }

    const truth = new Map<ID, Truth>();
    const add = (date: ISODate, t: VTemplate | null, cents: number, sub: string, descriptor?: string, bank: Bank = t?.bank ?? "op") => {
      const txn: Transaction = { id: sid("txn"), orgId, externalId: `qbo-${def.key}-${db.transactions.length}`, bankAccountId: banks[bank].id, date, description: descriptor ?? `${t!.descriptor}${bank === "op" && cents < 0 ? ` ${rng.int(1000, 9999)}` : ""}`, amount: cents, type: cents > 0 ? "income" : "expense", status: "needs_review", documentIds: [], syncState: "synced", version: 1, createdAt: `${date}T05:30:00.000Z` };
      db.transactions.push(txn);
      truth.set(txn.id, { accountId: sub.startsWith("gl_") ? sub : glId(sub) });
    };

    const start = "2026-08-10";
    const days = Math.round((Date.parse(today) - Date.parse(start)) / 86_400_000);
    const total = Math.round((def.volume * 0.85 * days) / 30);
    for (let i = 0; i < total; i++) {
      const t = rng.weighted(templates.map((x) => [x, x.weight] as const));
      const sub = t.mixed ? rng.weighted(t.mixed) : t.sub;
      const date = addDays(start, rng.int(0, days));
      const isIncome = db.glAccounts.find((a) => a.id === glId(t.sub))!.type === "income";
      const cents = Math.round((t.range[0] + rng.next() * (t.range[1] - t.range[0])) * 100) * (isIncome ? 1 : -1);
      add(date, t, cents, sub);
    }
    // A sprinkle of unknown payees and risky items so queues are realistic.
    for (let i = 0; i < Math.max(2, Math.round(def.volume / 30)); i++) add(addDays("2026-09-20", rng.int(0, 26)), null, -rng.int(5_000, 180_000), "other_expense", `CHECK ${rng.int(2100, 2999)}`, "op");
    add(addDays("2026-10-01", rng.int(0, 14)), null, -rng.int(2_000_000, 4_500_000), "member_draws", "ONLINE TRANSFER OWNER DRAW", "op");
    if (def.note === "review_backlog") for (let i = 0; i < 6; i++) add(addDays("2026-10-08", i), templates.find((x) => x.mixed) ?? templates[0]!, -rng.int(30_000, 260_000), "repairs");

    // Opening balances so balances are positive.
    const flow = db.transactions.filter((x) => x.orgId === orgId && x.bankAccountId === banks.op.id).reduce((s, x) => s + x.amount, 0);
    const opening = Math.max(0, -flow) + rng.int(40_000, 260_000) * 100;
    db.journalEntries.push({ id: sid("je"), orgId, date: "2026-08-09", memo: "Opening balances", lines: [{ accountId: opGl.id, debit: opening, credit: 0 }, { accountId: glId("members_equity"), debit: 0, credit: opening }], source: "accounting_system" });

    const priorHistory = templates.flatMap((t) => (t.mixed ?? [[t.sub, 1]]).map(([sub, w]) => ({ vendorId: vendorId(t), accountId: glId(sub as string), count: Math.round(24 * (w as number)), amounts: Array.from({ length: 6 }, (_, i) => Math.round((t.range[0] + ((i + 0.5) / 6) * (t.range[1] - t.range[0])) * 100)) })));
    processTransactions(db, truth, {
      priorHistory,
      orgId,
      liveFrom: def.health === "at_risk" && def.note === "catch_up" ? "2026-09-01" : "2026-10-01",
      auditFrom: "2026-08-12",
      bookkeeperId: def.bookkeeper,
      bookkeeperName: db.users.find((u) => u.id === def.bookkeeper)!.name,
      rngSeconds: () => rng.int(5, 80),
    });

    // Close periods (Jul–Oct).
    for (const period of ["2026-08", "2026-09", "2026-10"]) {
      const closedOn = addDays(monthEnd(period), rng.int(5, 11));
      let status: "closed" | "in_review" | "in_progress" | "open" = period === "2026-10" ? "open" : "closed";
      if (period === "2026-09" && def.health !== "current") status = def.note === "catch_up" ? "open" : def.health === "at_risk" ? "in_progress" : "in_review";
      if (def.note === "catch_up" && period === "2026-08") status = "in_progress";
      db.closePeriods.push({
        id: `cp_${def.key}_${period}`,
        orgId,
        period,
        status,
        manual: status === "closed" ? { bookkeeper_review: { done: true, by: def.bookkeeper, at: `${closedOn}T14:00:00.000Z` }, reviewer_approval: { done: true, by: def.reviewer, at: `${closedOn}T16:00:00.000Z` }, reports_generated: { done: true, by: "fabrik-ai", at: `${closedOn}T16:01:00.000Z` } } : status === "in_review" ? { bookkeeper_review: { done: true, by: def.bookkeeper, at: "2026-10-13T15:00:00.000Z" } } : {},
        closedAt: status === "closed" ? `${closedOn}T16:01:00.000Z` : undefined,
        packageGeneratedAt: status === "closed" ? `${closedOn}T16:01:00.000Z` : undefined,
        targetCloseDate: addDays(monthEnd(period), 14),
      });
    }

    // September reconciliations.
    const txns = db.transactions.filter((x) => x.orgId === orgId);
    const postings = buildPostings({ accounts: db.glAccounts.filter((a) => a.orgId === orgId), bankAccounts: [banks.op, banks.cc], transactions: txns, invoices: [], bills: [], journalEntries: db.journalEntries.filter((j) => j.orgId === orgId) });
    for (const bank of [banks.op, banks.cc]) {
      const items = bookItems(bank, txns, "2026-09-01", "2026-09-30");
      const startBal = balances(postings, "2026-08-31").get(bank.glAccountId) ?? 0;
      const missing = def.note === "missing_statement" || (def.note === "catch_up" && bank.kind === "checking");
      let lines: StatementLine[] = items.map((i) => ({ id: sid("stl"), date: i.date, description: i.description, amount: i.amount, state: "matched", transactionId: i.transactionId, confidence: scoreStatementMatch(i, i) }));
      let status: Reconciliation["status"] = def.health === "current" || def.health === "attention" ? "approved" : "in_progress";
      if (def.note === "rec_difference" && bank.kind === "checking") {
        lines = lines.filter((_, idx) => idx !== 3);
        lines.push({ id: sid("stl"), date: "2026-09-22", description: "ACH DEBIT FARM CREDIT LEASE", amount: -1_284_000, state: "unmatched" });
        status = "in_progress";
      }
      if (missing) {
        lines = [];
        status = "not_started";
      }
      db.reconciliations.push({
        id: `rec_${def.key}_${bank.mask}_2026-09`,
        orgId,
        bankAccountId: bank.id,
        period: "2026-09",
        statementStartBalance: startBal,
        statementEndBalance: startBal + lines.reduce((s, l) => s + l.amount, 0),
        statementDate: "2026-09-30",
        lines,
        outstandingTxnIds: [],
        status,
        preparedBy: def.bookkeeper,
        approvedBy: status === "approved" ? def.reviewer : undefined,
        approvedAt: status === "approved" ? "2026-10-07T15:00:00.000Z" : undefined,
      });
    }

    db.connections.push({
      id: `conn_${def.key}_qbo`,
      orgId,
      provider: "quickbooks_online",
      mode: "sandbox_synthetic",
      status: def.note === "integration_error" ? "error" : "connected",
      realmId: String(9_100_000_000_000_000 + rng.int(1, 999_999)),
      companyName: def.name,
      connectedAt: org.createdAt,
      lastSyncAt: def.note === "integration_error" ? "2026-10-14T09:00:00.000Z" : `${today}T09:0${rng.int(0, 9)}:00.000Z`,
      lastSyncStatus: def.note === "integration_error" ? "failed" : "success",
    });
    if (def.note === "integration_error") {
      db.syncRuns.push({ id: sid("sync"), orgId, connectionId: `conn_${def.key}_qbo`, trigger: "scheduled", idempotencyKey: `qbo:${orgId}:2026-10-14:scheduled`, attempt: 3, startedAt: "2026-10-14T09:00:00.000Z", finishedAt: "2026-10-14T09:00:05.000Z", status: "failed", entities: [], error: { code: "QBO_AUTH_EXPIRED", message: "QuickBooks refresh token expired or was revoked. The client must reconnect.", retryable: false } });
      db.notifications.push({ id: sid("ntf"), orgId, kind: "integration", title: "Your QuickBooks connection needs attention", body: "Reconnect QuickBooks Online so Fabrik can keep your books current.", href: "/integrations", bundleKey: `integration:${orgId}:qbo`, count: 1, readBy: [], createdAt: "2026-10-14T09:00:05.000Z", updatedAt: "2026-10-14T09:00:05.000Z" });
    }
  }
}
