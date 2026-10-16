/**
 * Fabrik Finance domain model.
 *
 * These types are provider-agnostic: QuickBooks Online (the MVP system of record) is mapped into
 * them by an AccountingProvider adapter, so other ledgers (Xero, NetSuite…) can be added later
 * without touching the product layer. Money is stored as integer cents to avoid float drift.
 */

export type ID = string;
export type ISODate = string; // YYYY-MM-DD
export type ISODateTime = string; // full ISO timestamp
export type Cents = number;

// ─── Identity, tenancy, RBAC ────────────────────────────────────────────────

/** Client-side roles (scoped to one organization through a Membership). */
export type ClientRole = "business_owner" | "client_finance_user" | "external_accountant";
/** Fabrik staff roles (cross-tenant, scoped by assignment unless admin). */
export type StaffRole = "fabrik_bookkeeper" | "fabrik_reviewer" | "fabrik_admin";
export type Role = ClientRole | StaffRole;

export interface User {
  id: ID;
  email: string;
  name: string;
  title?: string;
  passwordHash: string;
  mfaEnabled: boolean;
  /** AES-256-GCM encrypted base32 TOTP secret. */
  mfaSecretEnc?: string;
  staffRole?: StaffRole;
  status: "active" | "invited" | "disabled";
  avatarHue: number;
  createdAt: ISODateTime;
  lastLoginAt?: ISODateTime;
  notificationPrefs: { email: boolean; inApp: boolean; digest: "realtime" | "daily" | "weekly" };
}

export interface Membership {
  id: ID;
  userId: ID;
  orgId: ID;
  role: ClientRole;
  invitedBy?: ID;
  createdAt: ISODateTime;
}

export interface Session {
  id: ID;
  userId: ID;
  activeOrgId?: ID;
  mfaPending: boolean;
  createdAt: ISODateTime;
  expiresAt: ISODateTime;
  lastSeenAt: ISODateTime;
  userAgent?: string;
}

export interface PasswordResetToken {
  id: ID;
  userId: ID;
  tokenHash: string;
  expiresAt: ISODateTime;
  usedAt?: ISODateTime;
}

export type Plan = "essentials" | "growth" | "enterprise";
export type CloseFrequency = "monthly" | "quarterly" | "annual";

export interface AIThresholds {
  /** ≥ this confidence → eligible for automatic processing (PRD default 0.98). */
  autoApprove: number;
  /** ≥ this (and < autoApprove) → bookkeeper review; below → review or client clarification (PRD default 0.85). */
  review: number;
}

export interface Organization {
  id: ID;
  name: string;
  legalName: string;
  industry: string;
  state: string;
  plan: Plan;
  status: "active" | "onboarding" | "paused" | "churned";
  closeFrequency: CloseFrequency;
  assignedBookkeeperId?: ID;
  assignedReviewerId?: ID;
  /** Proposed (Fondo-inspired): a named, consistent accountant for the customer. */
  dedicatedAccountantId?: ID;
  thresholds: AIThresholds;
  /** Transactions at or above this absolute amount always need human review (risk rule). */
  largeTransactionThreshold: Cents;
  reportingBasis: "accrual" | "cash";
  fiscalYearStartMonth: number;
  isDemo: boolean;
  createdAt: ISODateTime;
  /** Synthetic health inputs for orgs seeded with light data. */
  catchUp?: { fromPeriod: string; toPeriod: string; monthsBehind: number; startedAt?: ISODateTime };
}

// ─── Ledger ────────────────────────────────────────────────────────────────

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";
export type CashFlowSection = "operating" | "investing" | "financing" | "cash";

export interface GLAccount {
  id: ID;
  orgId: ID;
  code: string;
  name: string;
  type: AccountType;
  subtype: string;
  cashFlowSection?: CashFlowSection;
  /** Accounts that always trigger human review when used (loans, equity, tax…). */
  sensitive?: boolean;
  externalId?: string;
  active: boolean;
}

export interface BankAccount {
  id: ID;
  orgId: ID;
  name: string;
  institution: string;
  mask: string;
  kind: "checking" | "savings" | "credit_card";
  glAccountId: ID;
  externalId?: string;
}

export interface Vendor {
  id: ID;
  orgId: ID;
  name: string;
  /** Raw bank-feed descriptors seen for this vendor (used for normalization). */
  aliases: string[];
  defaultAccountId?: ID;
  externalId?: string;
  createdAt: ISODateTime;
}

export interface Customer {
  id: ID;
  orgId: ID;
  name: string;
  contactName?: string;
  email?: string;
  termsDays: number;
  /** Average days paid after due date, learned from history. */
  avgDaysLate: number;
  externalId?: string;
}

export type TransactionStatus = "processed" | "needs_review" | "waiting_for_client" | "approved" | "excluded";
export type TransactionType =
  | "expense"
  | "income"
  | "transfer"
  | "loan_payment"
  | "owner_draw"
  | "owner_contribution"
  | "tax_payment"
  | "payroll"
  | "asset_purchase"
  | "refund"
  | "chargeback"
  | "intercompany";

export interface Split {
  accountId: ID;
  /** Signed from the bank's perspective: negative = money out. */
  amount: Cents;
  memo?: string;
}

export interface AISuggestion {
  normalizedVendor: string;
  transactionType: TransactionType;
  accountId: ID;
  confidence: number;
  alternatives: { accountId: ID; confidence: number }[];
  explanation: string;
  evidence: { similarCount: number; totalCount: number; ruleId?: ID; basis: "rule" | "history" | "keywords" | "none" };
  possibleDuplicateOf?: ID;
  anomaly?: { reason: string };
  documentMatch?: { documentId: ID; confidence: number };
  decision: "auto" | "review" | "clarify";
  model: string;
  modelVersion: string;
  generatedAt: ISODateTime;
}

export interface RiskAssessment {
  score: number; // 0–100
  level: "low" | "medium" | "high";
  reasons: { ruleKey: string; label: string }[];
  forcesReview: boolean;
}

export interface Transaction {
  id: ID;
  orgId: ID;
  externalId: string;
  bankAccountId: ID;
  date: ISODate;
  description: string;
  /** Signed from the bank's perspective: negative = outflow. */
  amount: Cents;
  vendorId?: ID;
  customerId?: ID;
  /** Final (human-approved or auto-processed) GL account. Undefined → uncategorized in the ledger. */
  accountId?: ID;
  splits?: Split[];
  type: TransactionType;
  status: TransactionStatus;
  ai?: AISuggestion;
  risk?: RiskAssessment;
  documentIds: ID[];
  memo?: string;
  reviewedBy?: ID;
  reviewedAt?: ISODateTime;
  /** Write-back state toward the accounting system of record. */
  syncState: "synced" | "pending_writeback" | "error";
  version: number;
  createdAt: ISODateTime;
}

export interface JournalEntry {
  id: ID;
  orgId: ID;
  date: ISODate;
  memo: string;
  lines: { accountId: ID; debit: Cents; credit: Cents }[];
  source: "accounting_system" | "fabrik";
  externalId?: string;
}

export interface CategorizationRule {
  id: ID;
  orgId: ID;
  kind: "vendor" | "amount" | "description" | "recurring" | "organization";
  label: string;
  match: { vendorId?: ID; descriptionContains?: string; amountMin?: Cents; amountMax?: Cents; cadenceDays?: number };
  accountId: ID;
  createdBy: ID;
  createdFrom: "correction" | "manual";
  hits: number;
  active: boolean;
  createdAt: ISODateTime;
}

export interface RiskRule {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  weight: number;
}

// ─── Documents (FabrikIDP) ──────────────────────────────────────────────────

export type DocumentKind =
  | "invoice"
  | "receipt"
  | "bank_statement"
  | "credit_card_statement"
  | "entity_document"
  | "farm_record"
  | "tax_document"
  | "other";

export interface ExtractionResult {
  vendor?: string;
  documentNumber?: string;
  documentDate?: ISODate;
  dueDate?: ISODate;
  subtotal?: Cents;
  tax?: Cents;
  total?: Cents;
  currency?: string;
  poNumber?: string;
  lineItems: { description: string; quantity?: number; unitPrice?: Cents; amount: Cents }[];
  fieldConfidence: Record<string, number>;
  provider: string;
  providerVersion: string;
  extractedAt: ISODateTime;
  warnings: string[];
}

export interface DocumentMatchCandidate {
  transactionId: ID;
  confidence: number;
  reasons: string[];
}

export interface FinanceDocument {
  id: ID;
  orgId: ID;
  filename: string;
  mimeType: string;
  size: number;
  storageKey?: string;
  kind: DocumentKind;
  status: "uploaded" | "processing" | "extracted" | "matched" | "needs_review" | "failed";
  extraction?: ExtractionResult;
  match?: { candidates: DocumentMatchCandidate[]; transactionId?: ID; status: "suggested" | "confirmed" | "rejected" | "none"; confirmedBy?: ID; confirmedAt?: ISODateTime };
  period?: string;
  tags: string[];
  uploadedBy: ID;
  uploadedAt: ISODateTime;
  error?: string;
}

// ─── AP / AR ────────────────────────────────────────────────────────────────

export type BillStatus = "received" | "processing" | "needs_review" | "approved" | "rejected" | "paid";

export interface Bill {
  id: ID;
  orgId: ID;
  vendorId: ID;
  number: string;
  issueDate: ISODate;
  dueDate: ISODate;
  amount: Cents;
  accountId: ID;
  status: BillStatus;
  source: "accounting_system" | "document";
  documentId?: ID;
  history: { userId: ID; action: "approve" | "reject" | "request_review" | "received"; at: ISODateTime; comment?: string }[];
  externalId?: string;
}

export interface CollectionReminder {
  id: ID;
  subject: string;
  body: string;
  tone: "friendly" | "firm" | "final";
  status: "draft" | "approved" | "sent" | "discarded";
  createdBy: ID;
  createdAt: ISODateTime;
  approvedBy?: ID;
  approvedAt?: ISODateTime;
  sentAt?: ISODateTime;
}

export interface Invoice {
  id: ID;
  orgId: ID;
  customerId: ID;
  number: string;
  issueDate: ISODate;
  dueDate: ISODate;
  amount: Cents;
  amountPaid: Cents;
  accountId: ID;
  memo?: string;
  reminders: CollectionReminder[];
  externalId?: string;
}

// ─── Workflow ───────────────────────────────────────────────────────────────

export type InboxItemType =
  | "transaction_clarification"
  | "missing_receipt"
  | "missing_document"
  | "vendor_clarification"
  | "customer_clarification"
  | "accountant_question"
  | "integration_issue"
  | "monthly_close_question"
  | "bill_approval"
  | "overdue_invoice"
  | "funding_info_request"
  | "tax_document_request";

export interface InboxItem {
  id: ID;
  orgId: ID;
  type: InboxItemType;
  title: string;
  body: string;
  status: "open" | "answered" | "resolved" | "dismissed";
  priority: "high" | "normal" | "low";
  related?: { type: "transaction" | "bill" | "invoice" | "document" | "integration" | "close" | "funding" | "tax"; id: ID };
  options?: { label: string; value: string; confidence?: number }[];
  response?: { value?: string; label?: string; comment?: string; userId: ID; at: ISODateTime };
  createdBy: "fabrik-ai" | ID;
  createdAt: ISODateTime;
  resolvedAt?: ISODateTime;
  period?: string;
}

export type CloseTaskKey =
  | "transactions_categorized"
  | "documents_processed"
  | "bank_reconciliation"
  | "credit_card_reconciliation"
  | "client_questions_resolved"
  | "bookkeeper_review"
  | "reviewer_approval"
  | "reports_generated";

export interface ClosePeriod {
  id: ID;
  orgId: ID;
  period: string; // YYYY-MM (or YYYY-Qn / YYYY for non-monthly frequencies)
  status: "open" | "in_progress" | "in_review" | "closed";
  manual: Partial<Record<CloseTaskKey, { done: boolean; by?: ID; at?: ISODateTime; note?: string }>>;
  closedAt?: ISODateTime;
  packageGeneratedAt?: ISODateTime;
  targetCloseDate: ISODate;
}

export interface StatementLine {
  id: ID;
  date: ISODate;
  description: string;
  amount: Cents;
  state: "matched" | "suggested" | "unmatched" | "duplicate" | "outstanding";
  transactionId?: ID;
  confidence?: number;
  note?: string;
}

export interface Reconciliation {
  id: ID;
  orgId: ID;
  bankAccountId: ID;
  period: string; // YYYY-MM
  statementStartBalance: Cents;
  statementEndBalance: Cents;
  statementDate: ISODate;
  lines: StatementLine[];
  status: "not_started" | "in_progress" | "ready_for_review" | "approved";
  statementDocumentId?: ID;
  /** Book transactions confirmed as outstanding (in books, not yet on the statement). */
  outstandingTxnIds: ID[];
  approvedBy?: ID;
  approvedAt?: ISODateTime;
  preparedBy?: ID;
}

export type WorkItemType =
  | "reconciliation_difference"
  | "review_transactions"
  | "missing_statement"
  | "client_question_followup"
  | "close_review"
  | "integration_error"
  | "document_review"
  | "catch_up";

export interface WorkItem {
  id: ID;
  /** Stable key for auto-generated items: type:org:period[:ref]. */
  key: string;
  auto: boolean;
  orgId: ID;
  type: WorkItemType;
  title: string;
  priority: "critical" | "high" | "medium" | "low";
  status: "open" | "in_progress" | "waiting_on_client" | "done";
  assigneeId?: ID;
  period: string;
  count?: number;
  createdAt: ISODateTime;
  dueAt?: ISODateTime;
  href?: string;
}

export interface AuditEvent {
  id: ID;
  orgId?: ID;
  at: ISODateTime;
  actor: { type: "user" | "ai" | "system"; id: string; name: string; role?: Role };
  action: string;
  entity: { type: string; id: ID; label?: string };
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ai?: { recommendation: string; confidence: number; model: string; modelVersion: string };
  risk?: { level: string; reasons: string[] };
  comment?: string;
  /** Measured human handling time — feeds the "human minutes per client per month" north star. */
  humanSeconds?: number;
  ip?: string;
}

export interface Notification {
  id: ID;
  orgId?: ID;
  userId?: ID; // undefined → every member of the org
  kind: "inbox" | "books_ready" | "integration" | "bill" | "collect" | "funding" | "system" | "ops";
  title: string;
  body?: string;
  href?: string;
  bundleKey?: string;
  count: number;
  readBy: ID[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface OutboxEmail {
  id: ID;
  orgId?: ID;
  to: string;
  subject: string;
  body: string;
  createdAt: ISODateTime;
  status: "queued" | "delivered_dev";
}

// ─── Integrations ──────────────────────────────────────────────────────────

export type IntegrationProvider = "quickbooks_online" | "mercury" | "ramp" | "gusto" | "stripe" | "plaid" | "xero" | "brex" | "rippling";

export interface IntegrationConnection {
  id: ID;
  orgId: ID;
  provider: IntegrationProvider;
  mode: "live" | "sandbox_synthetic";
  status: "connected" | "error" | "disconnected";
  realmId?: string;
  companyName?: string;
  tokensEnc?: string;
  connectedAt?: ISODateTime;
  connectedBy?: ID;
  lastSyncAt?: ISODateTime;
  lastSyncStatus?: "success" | "partial" | "failed";
  /** Demo control: makes the next sync fail so the error/retry path can be shown. */
  simulateFailure?: boolean;
}

export interface SyncRun {
  id: ID;
  orgId: ID;
  connectionId: ID;
  trigger: "manual" | "scheduled" | "retry" | "writeback" | "initial";
  idempotencyKey: string;
  attempt: number;
  startedAt: ISODateTime;
  finishedAt?: ISODateTime;
  status: "running" | "success" | "partial" | "failed";
  entities: { entity: string; fetched: number; created: number; updated: number; skipped: number }[];
  error?: { code: string; message: string; retryable: boolean };
}

// ─── Funding ────────────────────────────────────────────────────────────────

export type ProgramType =
  | "loan"
  | "loan_guarantee"
  | "grant"
  | "cost_share"
  | "conservation"
  | "disaster_assistance"
  | "commodity_support"
  | "tax_incentive";

export type PurposeTag =
  | "equipment"
  | "land_purchase"
  | "operating"
  | "conservation"
  | "energy"
  | "storage"
  | "disaster"
  | "expansion"
  | "price_support"
  | "value_added"
  | "beginning_farmer"
  | "water_quality";

/** A machine-checkable eligibility criterion evaluated by the matching engine. */
export type EligibilityRule =
  | { kind: "entity_type"; allowed: string[]; label: string }
  | { kind: "state"; allowed: string[]; label: string }
  | { kind: "agricultural_operation"; label: string }
  | { kind: "purpose_overlap"; tags: PurposeTag[]; label: string }
  | { kind: "beginning_farmer"; required: boolean; label: string }
  | { kind: "commercial_credit_unavailable"; label: string }
  | { kind: "max_acres"; acres: number; label: string }
  | { kind: "crops_any"; crops: string[]; label: string }
  | { kind: "profile_field"; field: keyof FarmProfile | string; label: string; informational?: boolean }
  | { kind: "conservation_interest"; label: string }
  | { kind: "value_added_activity"; label: string }
  | { kind: "disaster_loss"; label: string }
  | { kind: "rural_area"; label: string };

export interface FundingProgram {
  id: ID;
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
  lastVerified: ISODate | null;
  verificationNotes: string;
  rules: EligibilityRule[];
  /** Readiness items beyond the standard set (e.g. conservation plan, energy audit). */
  additionalReadiness?: { key: string; label: string; satisfiedBy?: { documentTag?: string } }[];
}

export interface FarmProfile {
  orgId: ID;
  legalName: string;
  entityType: "llc" | "corporation" | "partnership" | "sole_proprietor" | "trust" | "cooperative";
  state: string;
  county: string;
  ein?: string;
  yearsFarming?: number;
  beginningFarmer?: boolean;
  owners: { name: string; pct: number; role?: string }[];
  /** Financial fields are pre-populated from the accounting system; `financialsSyncedAt` marks it. */
  revenue?: Cents;
  expenses?: Cents;
  assets?: Cents;
  debt?: Cents;
  financialsSyncedAt?: ISODateTime;
  employees?: number;
  acresOwned?: number;
  acresRented?: number;
  crops: { crop: string; acres: number }[];
  livestock: { kind: string; head: number }[];
  properties: { name: string; county: string; acres: number; owned: boolean }[];
  equipment: { description: string; year?: number; value?: Cents }[];
  plannedInvestments: { id: ID; purpose: PurposeTag; description: string; amount: Cents; timeframe: string }[];
  activities: string[];
  conservationPractices: string[];
  hasCommercialCredit?: boolean;
  ruralArea?: boolean;
  disasterLossThisYear?: boolean;
  valueAddedActivity?: boolean;
  projectDescription?: string;
  baseAcres?: number;
  stewardshipAssessment?: boolean;
  energyAudit?: boolean;
  updatedAt: ISODateTime;
  updatedBy?: ID;
}

export interface FundingWatch {
  id: ID;
  orgId: ID;
  programId: ID;
  status: "saved" | "preparing" | "eligibility_check_requested" | "dismissed";
  note?: string;
  updatedAt: ISODateTime;
  updatedBy: ID;
}

// ─── CFO ────────────────────────────────────────────────────────────────────

export type ScenarioType = "land_purchase" | "equipment_purchase" | "hire_employees" | "revenue_change" | "customer_default";

export interface SavedScenario {
  id: ID;
  orgId: ID;
  type: ScenarioType;
  name: string;
  inputs: Record<string, number | string | boolean>;
  createdBy: ID;
  createdAt: ISODateTime;
}

// ─── Ask Fabrik ─────────────────────────────────────────────────────────────

export interface AskMessage {
  id: ID;
  role: "user" | "assistant";
  content: string;
  at: ISODateTime;
  answer?: import("./ask-types").AskAnswer;
}

export interface AskThread {
  id: ID;
  orgId: ID;
  userId: ID;
  title: string;
  messages: AskMessage[];
  /** Short-lived context so follow-ups like "these applications" resolve. */
  context: { lastProgramIds?: ID[]; lastVendorId?: ID; lastIntent?: string };
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// ─── Tax & Credits (Proposed, Fondo-inspired) ──────────────────────────────

export interface TaxDeadline {
  id: ID;
  orgId: ID;
  form: string;
  title: string;
  jurisdiction: "federal" | "state";
  dueDate: ISODate;
  basis: string;
  sourceUrl?: string;
  status: "upcoming" | "in_preparation" | "filed_by_cpa" | "not_applicable";
  owner: "client" | "cpa" | "fabrik";
}

export interface TaxDocumentRequest {
  id: ID;
  orgId: ID;
  taxYear: number;
  title: string;
  description: string;
  status: "requested" | "received" | "cpa_reviewed" | "client_approved" | "filed";
  documentId?: ID;
  requestedAt: ISODateTime;
  history: { status: TaxDocumentRequest["status"]; userId: ID; at: ISODateTime; comment?: string }[];
}

export interface DB {
  version: number;
  seededAt: ISODateTime;
  users: User[];
  memberships: Membership[];
  sessions: Session[];
  resetTokens: PasswordResetToken[];
  organizations: Organization[];
  glAccounts: GLAccount[];
  bankAccounts: BankAccount[];
  vendors: Vendor[];
  customers: Customer[];
  transactions: Transaction[];
  journalEntries: JournalEntry[];
  rules: CategorizationRule[];
  riskRules: RiskRule[];
  documents: FinanceDocument[];
  bills: Bill[];
  invoices: Invoice[];
  inbox: InboxItem[];
  closePeriods: ClosePeriod[];
  reconciliations: Reconciliation[];
  workItems: WorkItem[];
  audit: AuditEvent[];
  notifications: Notification[];
  outbox: OutboxEmail[];
  connections: IntegrationConnection[];
  syncRuns: SyncRun[];
  fundingPrograms: FundingProgram[];
  farmProfiles: FarmProfile[];
  fundingWatches: FundingWatch[];
  scenarios: SavedScenario[];
  askThreads: AskThread[];
  taxDeadlines: TaxDeadline[];
  taxRequests: TaxDocumentRequest[];
}
