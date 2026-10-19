import type { DB } from "@/lib/types";
import { today } from "@/lib/dates";
import { DEFAULT_RISK_RULES } from "@/server/engines/risk";
import { FUNDING_PROGRAMS } from "@/content/funding";
import { Rng, resetSeedIds } from "./random";
import { seedPeople } from "./people";
import { SMITH, seedSmithLedger } from "./smith";
import { seedSmithRules, seedSmithWorkflow } from "./smith-workflow";
import { seedPortfolio } from "./portfolio";
import { processTransactions } from "./process";

export const SCHEMA_VERSION = 10;

export function emptyDb(): DB {
  return {
    version: SCHEMA_VERSION,
    seededAt: new Date().toISOString(),
    users: [],
    memberships: [],
    sessions: [],
    resetTokens: [],
    organizations: [],
    glAccounts: [],
    bankAccounts: [],
    vendors: [],
    customers: [],
    transactions: [],
    journalEntries: [],
    rules: [],
    riskRules: DEFAULT_RISK_RULES.map((r) => ({ ...r })),
    documents: [],
    bills: [],
    invoices: [],
    inbox: [],
    closePeriods: [],
    reconciliations: [],
    workItems: [],
    audit: [],
    notifications: [],
    outbox: [],
    connections: [],
    syncRuns: [],
    fundingPrograms: FUNDING_PROGRAMS.map((p) => structuredClone(p)),
    farmProfiles: [],
    fundingWatches: [],
    scenarios: [],
    askThreads: [],
    taxDeadlines: [],
    taxRequests: [],
  };
}

/** Builds the permanent, deterministic demo environment. All data is synthetic. */
export function buildSeed(): DB {
  resetSeedIds();
  const db = emptyDb();
  const rng = new Rng(20261016);
  const day = today();
  const now = `${day}T09:12:00.000Z`;

  seedPeople(db, now);
  db.organizations.push({
    id: SMITH,
    name: "Smith Family Farms",
    legalName: "Smith Family Farms LLC",
    industry: "Corn & soybean farming",
    state: "IA",
    plan: "growth",
    status: "active",
    closeFrequency: "monthly",
    assignedBookkeeperId: "usr_sarah",
    assignedReviewerId: "usr_marcus",
    dedicatedAccountantId: "usr_sarah",
    thresholds: { autoApprove: 0.98, review: 0.85 },
    largeTransactionThreshold: 100_000_00,
    reportingBasis: "accrual",
    fiscalYearStartMonth: 1,
    isDemo: true,
    createdAt: "2025-11-03T15:00:00.000Z",
  });

  const { truth, vendorIds } = seedSmithLedger(db, rng, day);
  seedSmithRules(db, vendorIds);
  processTransactions(db, truth, {
    orgId: SMITH,
    liveFrom: "2026-10-01",
    auditFrom: "2026-08-01",
    bookkeeperId: "usr_sarah",
    bookkeeperName: "Sarah Chen",
    rngSeconds: () => rng.int(5, 70),
  });
  seedSmithWorkflow(db, rng, day, vendorIds, now);
  seedPortfolio(db, rng, day);

  db.outbox.push(
    { id: "eml_seed_1", orgId: SMITH, to: "dan@smithfamilyfarms.example", subject: "Fabrik needs your help with 6 items", body: "2 transactions, 1 bill approval, 1 missing document, 1 funding question, 1 overdue invoice.\n\nOpen Fabrik: /inbox", createdAt: "2026-10-14T07:00:05.000Z", status: "delivered_dev" },
    { id: "eml_seed_2", orgId: SMITH, to: "dan@smithfamilyfarms.example", subject: "August books are ready", body: "Your August finance package is available.\n\nOpen Fabrik: /close/2026-08/package", createdAt: "2026-09-08T15:05:10.000Z", status: "delivered_dev" },
  );
  db.audit.sort((a, b) => a.at.localeCompare(b.at));
  return db;
}
