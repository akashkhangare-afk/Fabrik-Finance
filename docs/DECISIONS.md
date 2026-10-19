# Decisions, conflicts and limitations

## Source materials

| Source | Status |
|---|---|
| `Fabrik Finance PRD.pdf` (65 pp.) | Read in full. Pages 1–34: general AI-first bookkeeping MVP. Pages 35–65: **Expo MVP** (January 2027, Land Investment Expo) — governs the first release. |
| `Fondo vs Fabrik Finance PRD Missing Features Analysis.pdf` | Read. Drives classification **B** (proposed) and **C** (future) items. |
| `What exactly is Fondo.com.pdf` | Read. Background on Fondo's bookkeeping + tax + R&D credit model. |
| Interactive prototype (claude.ai design link in the PRD) | **Not available** in the repository and not reachable from this environment. Not used; the design follows the brief's design direction. |

## Conflicts between sources (also in-app at `/ops/requirements` when `SHOW_EXTRAS=true`)

| ID | Conflict | Resolution |
|---|---|---|
| C-01 | Dashboard KPIs: general PRD shows current-month revenue/expenses; Expo shows YTD + AR + upcoming bills. | Expo followed. Current-month figures live in the CFO view and finance package. |
| C-02 | Reconciliation & Monthly Close are detailed in the general PRD but absent from the Expo module list/priorities. | Built as core bookkeeping, priority "Candidate", placed under Finance per the brief's navigation. |
| C-03 | General PRD puts "advanced forecasting/budgeting" out of scope; Expo makes the 13-week forecast and scenarios P0. | 13-week forecast + basic scenarios built; budgeting/FP&A stay out of scope. |
| C-04 | Tax filing and R&D credits are out of scope in both PRD layers; the brief asks for a Fondo-inspired tax workspace. | Built as a labelled **Preview** (B): deadlines, document collection, approvals, filing *tracking*. Filing, calculation and e-signature remain C. |
| C-05 | Positioning: "Your AI Finance Department" vs "AI Finance for Land & Agriculture". | Expo positioning in product; the former kept as the long-term vision. |
| C-06 | General PRD excludes AR collection agents and full AP automation; Expo adds Collect Lite and Bills Lite. | Lite versions only: visibility, approvals, human-approved reminders; no payments or automated dunning. |
| C-07 | Prototype referenced but unavailable. | Recorded; not reproduced. |
| C-08 | Suggested stack is Next.js + FastAPI + Postgres + Redis + S3. | See D-03. |

## Technical decisions

- **D-01 Expo priorities first.** P0 items (Home, QBO, Books, AI categorization, reports, FabrikIDP + matching, CFO, forecast, scenarios, funding profile/database/matching/detail, Ask Fabrik, demo company) were built first and are covered by the e2e demo test. P1/P2 and earlier-PRD candidates followed.
- **D-02 Deterministic, grounded AI.** The MVP must not invent numbers and must never claim eligibility. Categorization, matching, insights, forecasting and Ask Fabrik are computed; an LLM is optional and only rephrases (with a number-grounding guard). This also makes the Expo demo reliable offline.
- **D-03 Stack.** Python and PostgreSQL were not available in the build environment, so the backend runs inside Next.js with a strict service/repository boundary and provider adapters. `db/schema.sql` defines the Postgres target; `docs/ARCHITECTURE.md` lists the migration seams.
- **D-04 Synthetic QuickBooks sandbox.** No Intuit credentials were available. The demo provider mirrors QBO behaviour (reports, sync, idempotency, failures, write-back) so the UX is real; the live adapter is implemented behind the same interface.
- **D-05 Seed through the engine.** Demo transactions are generated from farm-realistic plans and then categorized by the real engine in date order, so automation rates, confidence scores and the review queue are genuine outputs rather than hand-set values. Seeded numbers are pinned by tests.
- **D-06 Demo clock.** `FABRIK_CLOCK=2026-10-16` anchors "today" so the story (September close in review, October activity, harvest-season forecast) is stable whenever the demo runs.
- **D-07 Funding data.** Programs were researched from official sources on 2026-10-16. Where an agency site blocked automated access (NRCS, USDA Rural Development), the governing regulation on eCFR was used and the program's verification note says so. Dollar limits are recorded only when officially stated. Match scores are capped at 92% because agency review always remains.
- **D-08 Thresholds.** Smith Family Farms uses a $100K large-transaction threshold (portfolio: $50K) — a $10K threshold would send every grain deposit to review on a $3.8M farm. Separately, *any* expense ≥ $10K without a supporting document is held (new risk rule "Supporting document required"), which is what drives the PRD's John Deere example.
- **D-09 Client answers and risk.** A client's answer explains an unknown payee or unusual amount, so those two flags clear on answer; all other risk rules still require a bookkeeper.
- **D-10 Segregation of duties.** The reviewer who approves a close must differ from the bookkeeper who completed the bookkeeper review for that organization.

## Known limitations / not built

- Production infrastructure (Postgres, Redis workers, S3, Auth0/Cognito, Secrets Manager) — designed, not deployed.
- Live QBO adapter untested against a real company; full entity mapping in the sync worker is outlined, not complete.
- Image OCR requires FabrikIDP; the local fallback handles text-based PDFs and offers manual field entry.
- Email delivery uses a development outbox.
- Catch-up bookkeeping is tracked and surfaced, but bulk historical import is not built.
- Payroll, bank transfers, bill payment, automated collections, tax filing, R&D credit calculation, multi-currency, consolidation, native mobile — out of scope per PRD.
