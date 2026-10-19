# Cleanup summary: minimal UX (branch `cleanup/minimal-ux`)

This applies the approved [cleanup audit](cleanup-audit.md). Every row's recommended action was approved, along with these decisions:

- **D1 (b):** Reconciliation is in the navigation for staff only.
- **D2 (b):** the External Accountant role is hidden, not deleted.
- **D3 (a):** Home keeps the Expo PRD's year-to-date KPIs.
- **D4 (a):** one `SHOW_EXTRAS` flag controls everything hidden.
- **D5 (a):** demo helpers stay behind `FABRIK_DEMO_MODE`.
- **D6:** the workflow is the Expo demo flow (E§29), plus the client-question loop (G§19) and the monthly close (G§14).

What did not change: the workflow steps and their order, routes, role permissions, authentication and sessions. No features, screens or suggestions were added.

**To see the hidden items:** set `SHOW_EXTRAS=true` (default `false`). The full list is under "Hidden behind `SHOW_EXTRAS`" below.

## Before / after

| | Before | After (default) |
|---|---|---|
| Page routes | 28 | 28 exist; **26 reachable**. `/tax` and `/ops/requirements` return 404 unless `SHOW_EXTRAS=true`. |
| Navigation items: Business Owner / Client Finance User | 14 | **12** (removed: Reconciliation, Tax & Credits) |
| Navigation items: Fabrik staff (client + Operations) | 14 + 6 = 20 | **13 + 5 = 18** (removed: Tax & Credits, Requirements) |
| Component files in `src/components` | 36 | **35** (R&D screener deleted) |
| Exported React components | 94 | **89** (removed: `Delta`, `ConfidenceBar`, `Sparkline`, `RdScreener`, `TransactionDrawer` export) |
| Source lines (`src/`) | — | **+522 / −1,392** across 61 files |
| Screens with more than one primary action | 9 | **3**, each repeating one action per item: the Finance Inbox (one answer button per open card), the Documents drawer (one "Match" per candidate transaction) and the AI Review Queue while items are selected (the bulk "Approve N" bar plus the focused card). Home, Books, Bills, Reconciliation, Settings → Profile and the Documents upload area are down to one. Tax is hidden. |
| Audit outcome (297 rows) | — | Keep 87 · Simplify 108 · Hide behind flag 20 · Remove 70 · Settled by decision 12 |

Changes landed in 26 commits, one per screen or area. Run `git log main..cleanup/minimal-ux` to see them.

## Removed

**Navigation and shell**
- The notifications footer ("Notifications are bundled…").
- The MFA badge and industry lines in the user menu and organization switcher.

**Home**
- These cards: 13-week forecast, funding opportunities, "Your Fabrik accounting team".
- The duplicate Ask Fabrik and Finance package buttons.
- Decorative figures: year-over-year deltas, margin hint, net income chart line, legend totals.
- The footer sentence and all subtitles.

**Finance Inbox**
- The page description, footnotes, bill helper text, confidence bars and the funding program link.

**Books**
- In the transaction drawer: alternative-category chips, the "Previous {vendor} transactions" list and the confidence bar.
- Report integrity badges (they now appear only when a check fails) and the source badge.
- The page description and report footnote.

**Bills**
- The "Awaiting approval" KPI.
- Three of the five tabs (Open / All remain).
- The out-of-scope payments notice and the "Ready to pay" wording.

**Collect**
- The aging stacked bar (the figures remain), the tone badge, the paragraphs and the scope notice.

**Documents**
- The Tax tab and the non-PRD upload types.
- Raw tag badges, the provider badge and the storage and model footnotes.
- The confidence bar and the create-a-bill sentence.

**Funding**
- Decorative card elements, source-kind labels, the readiness ring and the duplicate profile button.
- The "Rural area?" question.

**CFO**
- The tagline, ratio formula notes, footer statistics and buffer badges.
- The lowest-cash, debt-to-assets and DSCR rows in the scenario table.
- AI styling on the computed verdict.

**Ask Fabrik**
- The "How Ask Fabrik answers" and duplicate "Try asking" cards, and the provider badges.
- Cross-sell links, the "Wording by…" line, and follow-ups beyond one.

**Monthly Close and Finance Package**
- The progress ring and progress bars, the schedule badge, the "auto-tracked" tags.
- The catch-up upsell card and the internal schedule notice.
- The package's anomaly badges and duplicate draft notice.

**Reconciliation**
- The page and card descriptions, and the bank-only guess hint.

**Integrations**
- The six-connector roadmap (Mercury, Plaid, Ramp, Gusto, Stripe, Xero).
- The Reliability explainer and the live-OAuth developer strip.
- The success rate, the realm ID, and the Attempt and Idempotency key columns.

**Settings**
- The dedicated-accountant row, the threshold band cards and the AI provider line.
- "PRD default" hints, human-time and UTC labels, and session details.

**Sign-in**
- The marketing bullets, the welcome line and the "MFA supported" label.

**Operations dashboard**
- The 3-month trend, the top-of-queue list, the clients-at-a-glance table and the duplicate navigation buttons.

**Work Queue**
- Priority tallies, the "assigned to you" count, sub-labels and footer notes.

**AI Review Queue**
- The AI-policy card, the risk banner, the keyboard card and key hints, and the helper sentences.

**Clients**
- Industry and plan, the progress bar, the automation column and the inactive footnote.

**Administration**
- The stat tiles, the requirements links, staff MFA and last sign-in, and risk weights.

**Tax & Credits**
- The R&D credit screener, together with its action and service. The rest of the page is hidden, not deleted.

**Internal scope labels shown to clients**
- Every "A · PRD / B · Proposed / C · Future" badge, every "Expo MVP" and "Fondo-inspired" sentence, and every "(PRD §…)" reference.

**Dead code left behind by these removals**
- The integrations connector catalog and success rate.
- The admin overview's client-user and session counts.
- The transaction-history query and the alternatives mapping in the transaction detail.
- `sourceKind`, `aiStatus`, `Delta`, `ConfidenceBar`, `Sparkline` and the package's anomaly list.

## Hidden behind `SHOW_EXTRAS`

| Item | Where |
|---|---|
| Tax & Credits (nav and page) | `/tax` |
| Requirements matrix (nav and page) | `/ops/requirements` (`npm run docs:requirements` still works) |
| Global search and the Ctrl K command palette | shell |
| "Message your team" button | Home |
| AI rules tab | Books |
| "Entity & farm" document tab | Documents |
| Save / Preparing / Hide and watch badges | Funding |
| EIN field | Funding profile |
| Forecast controls (seasonal sales, buffer, estimates toggle) and saving scenarios | CFO |
| Recent questions, and the close-status intent | Ask Fabrik |
| Finance Package draft for client roles | `/close/[period]/package` (staff always see drafts) |
| Bookkeeping tab, and the email digest preference | Settings |
| Critical-metrics table | Operations dashboard |
| Keyboard shortcuts | AI Review Queue |
| Questions column | Clients |
| Dedicated-accountant column | Administration |

These items stay behind `FABRIK_DEMO_MODE` instead (D5):
- The demo login personas and the demo MFA code.
- The sample John Deere invoice.
- Reset demo data and the development email outbox.
- The simulate-sync-failure toggle and the "Synthetic sandbox" badge.
- The development-outbox notes on Collect and on password reset. Before this change these two showed even with demo mode off.

## Simplified

**Navigation**
- "Team & Settings" is now "Settings".
- Reconciliation is in the navigation for staff only. Clients still reach it from Monthly Close.

**Primary actions**
- Each screen now has one primary action:
  - Home: Review.
  - Bills: approve buttons in the table are secondary.
  - Documents: the demo sample button is secondary.
  - Books: the drawer hides Approve while Ask client is open.
  - Reconciliation: only "Approve reconciliation" is primary.
  - AI Review Queue: Approve is primary only on the focused card.
  - Settings: the MFA setup button is secondary.

**Text**
- Page descriptions are gone from every screen.
- Empty states are one line each.
- Confirmations are one sentence.

**Books**
- The Account column now shows at every width (before, it was hidden below 2XL).
- Model, write-back and threshold details are shown to staff only.
- The audit trail is collapsed by default.

**Monthly Close**
- Period tabs replace the progress-bar list.

**Finance Package**
- The expense-change table has column headers.
- Clients see the package once the books are closed (G§15).

**Funding**
- One profile link, a one-sentence disclaimer and a single program-details card.
- Verification notes are shown to staff only.
- Profile questions used only by matching rules are grouped under "More details".

**CFO**
- Scenarios show their headline inputs; the rest are under "More assumptions".

**Work Queue**
- Status is edited in the Status column; the separate "Update" column is gone.

**AI Review Queue**
- The meta line shows the date only.

**Administration**
- The risk-rule banner is reduced to one warning line.

**External Accountant role (D2)**
- No longer offered when inviting, changing roles or choosing a demo persona.
- The permission definition and existing memberships are unchanged.

**Seed data**
- Every portfolio client now closes monthly (SEED-13). This also fixes the quarterly finance-package 404.
- `SCHEMA_VERSION` is now 10, so existing datastores reseed.

**Defect fixed (ASK-15)**
- The Ask Fabrik "What documents do we already have" answer now builds its farm-profile line from the profile instead of a hard-coded string.

## Verification (Phase 3)

| Check | Result |
|---|---|
| `npm run build` | Pass |
| Typecheck, strict (`tsc --noEmit --noUnusedLocals --noUnusedParameters`) | Pass. The project has no lint script, so this strict typecheck stands in for unused-code linting. |
| Unit tests (`npm test`) | 45 / 45 pass |
| Browser tests (`tests/e2e/expo-demo.spec.ts`) | 10 / 10 pass. This includes a new check that hidden screens 404 by default. Run against a production build on port 3100, because a `next dev` server was already using the project. |
| Role workflow walkthrough (real UI, fresh data) | 24 / 24 steps pass. The steps are listed below. |
| Crawl of every page and internal link as all six seeded users | **0 problems.** With `SHOW_EXTRAS` off: 101–105 pages per user (Business Owner, Client Finance User, External Accountant, Bookkeeper, Reviewer, Admin). With it on: 106 pages for the Business Owner and 141 for the Admin. No server errors, error screens, browser errors or unexpected sign-outs. |

**Workflow walkthrough, by role (G§3)**

1. **Fabrik Bookkeeper**
   - Ops dashboard KPIs; Work Queue with the six G§17 filters.
   - AI Review Queue: approve one item and ask the client one question.
   - Resolve the Chase September reconciliation to a $0.00 difference and "Ready for review".
2. **Business Owner**
   - Home; answer the bookkeeper's question in the Inbox (G§19).
   - Approve a bill.
   - Upload and match the sample John Deere invoice.
   - Funding: open a match and check eligibility.
   - CFO forecast and scenario; Ask Fabrik programs, then documents.
   - Books and reports; Settings; QuickBooks sync.
3. **Client Finance User**
   - Generate and approve a collection reminder; approve a bill.
4. **Fabrik Reviewer**
   - Approve the reconciliation, then approve and close September.
   - The finance package is generated; reassignment is available in the Work Queue.
5. **Business Owner again**
   - Sees the closed September package; October shows the not-ready state.
6. **Fabrik Admin (MFA)**
   - Change an organization's plan and change it back.
   - Hidden extras return 404.

## Things I wasn't sure about, and what I did

1. **FarmCo's catch-up backlog (SEED-12).** The audit said to remove the `catchUp` field together with the Monthly Close card. The field also drives FarmCo's "at risk" health and a Work Queue item. Removing it would change the Ops dashboard counts that match the PRD example (E§24). I removed only the client-facing card and kept the field.
2. **Business Owner can edit AI thresholds.** G§23 lists thresholds under Fabrik Admin. Your rules say not to change role permissions, so the edit right is unchanged. It's flagged for your decision.
3. **"Sync now" is available to every client role.** Also unchanged for the same reason.
4. **Data from out-of-scope items.**
   - Seeded tax documents and tax requests (SEED-06/07) and the funding watch (SEED-08) are still in the data, because their screens are hidden rather than deleted.
   - The two tax PDFs still appear under Documents → All.
5. **Finance Package drafts.** I read G§15 ("once books are closed") as clients seeing the package only after close. Staff still see drafts while closing. Clients see drafts too when `SHOW_EXTRAS=true`.
6. **Gaps from audit §26 that are new work, so not done:**
   - Funding readiness tags can't be set from an upload.
   - Bills has no upload entry point.
   - Vendor and customer clarification items have no dedicated Inbox UI.
7. **No lint.** There's no ESLint setup. I used the strict TypeScript unused-code check in its place rather than adding a linter.
8. **Port 3000.** A `next dev` server was already running on port 3000, so I didn't stop it. The browser tests ran against a production build on port 3100 instead.
