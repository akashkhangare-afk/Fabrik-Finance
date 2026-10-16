# Architecture

## Shape of the system

```
Browser (React 19 client components)
   │  server actions / route handlers (RBAC wrapper: src/server/action.ts)
   ▼
Next.js 16 App Router (server components)  ── src/app
   │
   ▼
Services (tenant-scoped, audited)          ── src/server/services
   │        ▲
   │        └─ AI agents / engines (pure)  ── src/server/engines
   ▼
Repository (datastore)                     ── src/server/db  (JSON file → PostgreSQL)
   │
Adapters: AccountingProvider (QBO synthetic | QBO live), DocumentIntelligenceProvider (FabrikIDP | local),
          LLM gateway (none | Anthropic), Email (dev outbox)          ── src/server/integrations, src/server/ai
```

Rules the codebase follows:

- **Components never touch data directly.** Pages call services with a request context (`Ctx`: user, org, role); services enforce tenant scope and write audit events. Mutations go through `run(permission, fn)` server actions.
- **Engines are pure functions** (no I/O): categorization, risk, matching, ledger/reports, forecast, scenarios, funding matching, reconciliation. They are unit-tested in isolation.
- **QuickBooks is the system of record.** Reports are requested from an `AccountingProvider`; the product never depends on QBO payload shapes (`qbo-live.ts` maps QBO's nested report rows into the neutral `FinancialReport` model). Adding Xero means adding an adapter.

## AI architecture (PRD §24)

Specialized agents rather than one "accounting agent", coordinated by the services layer (the orchestration/workflow layer):

| Agent | Module | Responsibility |
|---|---|---|
| Transaction Agent | `engines/categorization.ts` | Vendor normalization, type, proposed GL account, confidence, explanation, alternatives, duplicate & anomaly detection, document match |
| Risk Engine | `engines/risk.ts` | 15 configurable rules; any hit forces human review — *Confidence + Risk → Decision* |
| Rules Engine | `services/transactions.ts` (`learnRule`, `reprocessLive`) | Organization-specific learning from corrections (vendor, amount, description, recurring, organization rules), immediate re-scoring of live items |
| Document Agent | `integrations/idp`, `services/documents.ts` | FabrikIDP extraction (HTTP adapter) or local text extraction; per-field confidence; transaction matching with reasons |
| Reconciliation Agent | `engines/reconciliation.ts` | Statement ↔ book matching, duplicate and outstanding-item detection, zero-difference approval gate |
| Close Agent | `services/close.ts` | Derives close-checklist state from live data; generates the finance package |
| Finance Q&A Agent | `services/ask.ts` | Finance Router → Books / Bills / Collect / Funding / CFO / Documents; grounded answers with tables and sources; read-only |
| Funding Matcher | `engines/funding-match.ts` | Profile vs published criteria → score, level, qualifying factors, missing info, disqualifiers, readiness |

**Determinism and grounding.** All numbers are computed. The optional LLM gateway (`server/ai/gateway.ts`) may rephrase a finished answer; it is called with the facts and rejected if the rephrasing contains a number not present in them. Categorization is explainable by construction (history counts, rule names, keywords).

**Decision policy.** `≥ autoApprove` (default 98%) → automatic; `≥ review` (85%) → bookkeeper review; below → review or client clarification. Thresholds are per organization. Risk rules override confidence. Every AI suggestion carries `model` and `modelVersion`, stored with each audit event.

## Data model

Defined in `src/lib/types.ts` (money in integer cents). Key entities: `Organization`, `User`, `Membership`, `Session`, `GLAccount`, `BankAccount`, `Vendor`, `Customer`, `Transaction` (+ `AISuggestion`, `RiskAssessment`, `splits`), `JournalEntry`, `Invoice`, `Bill`, `FinanceDocument` (+ `ExtractionResult`, match candidates), `InboxItem`, `ClosePeriod`, `Reconciliation` (+ `StatementLine`), `WorkItem`, `AuditEvent`, `Notification`, `IntegrationConnection`, `SyncRun`, `FundingProgram`, `FarmProfile`, `TaxDeadline`, `TaxDocumentRequest`, `AskThread`.

`db/schema.sql` is the PostgreSQL target schema with row-level security on `org_id`.

### Ledger

`engines/ledger.ts` is a small double-entry posting model: bank transactions, invoices (AR), bills (AP) and journal entries all produce balanced postings, so the P&L, Balance Sheet (with prior-year retained earnings and current-year net income) and the indirect-method Cash Flow always tie out — tests assert `Assets = Liabilities + Equity` and that cash-flow net change equals the change in bank balances. Items still under review post to *Uncategorized* (as they would in QBO).

### The seeded demo

`src/server/db/seed/*` builds the environment deterministically (seeded PRNG):

- Smith Family Farms: ~1,700 transactions from Jan 2025 to the demo date, generated from monthly category plans with farm seasonality (spring input spend, fall harvest sales, semi-annual cash rent, a seasonal operating line), then **run through the real categorizer chronologically** so confidence and automation are genuine outputs. Calibrated to the PRD: $482K cash, $3.8M revenue YTD, $3.18M expenses, $620K net income, $310K AR (188/40/52/30 aging), $184K bills.
- 24 portfolio clients with lighter data for the Operations Portal (19 current, 4 needing attention, 2 at risk).

## Integrations

- **QuickBooks Online.** `SyntheticQuickBooksProvider` (demo) and `LiveQuickBooksProvider` (OAuth 2.0 with state cookie, token refresh, Accounting API v3 queries, Reports API mapping, write-back with `Request-Id` idempotency). Sync runs carry idempotency keys; retryable failures retry with exponential backoff; failures raise a bundled notification and an ops work item. Entities upsert by external id (no duplicates).
- **FabrikIDP.** `FabrikIdpHttp` posts the file to `${FABRIKIDP_URL}/v1/extract` and maps fields/confidences; `LocalTextExtractor` reads text PDFs (via `unpdf`) and parses fields; images without FabrikIDP go to manual field entry.
- **Email.** Notifications and reminders go to an outbox (viewable by admins) — swap for SES/Postmark.

## Production path (PRD §27)

| Concern | This build | Target |
|---|---|---|
| Frontend | Next.js 16 / React 19 | same |
| API | Next.js server actions + route handlers | FastAPI service behind the same service interfaces (or keep Node) |
| Database | JSON file via `db()` | PostgreSQL (`db/schema.sql`), RLS on `org_id` |
| Jobs | In-process (`processDocument`, `runSync`) | Redis + workers (BullMQ/RQ) for extraction, sync, re-scoring |
| Files | `.data/uploads` outside the web root | S3 with KMS, presigned downloads |
| Auth | Built-in sessions, scrypt, TOTP | Auth0 / Cognito (OIDC), keep RBAC + tenant checks |
| Secrets | env vars | AWS Secrets Manager |

The repository boundary (`db()` used only by services) and the provider interfaces are the seams for that migration.
