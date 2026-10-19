# Cleanup audit: Fabrik Finance prototype vs PRD

> **Approved 2026-10-19:** every recommended action in this file, plus D1 (b), D2 (b), D3 (a), D4 (a), D5 (a); D6 — the E§29 flow + G§19 loop + G§14 close is the workflow. Defects in §26 are fixed only where a table row recommends it (ASK-15, SEED-13).

**Phase 1, audit only.** Nothing in the app has changed. Mark your decision in the **Decision** column of each table:
- ✅ approve the recommended action
- ❌ keep as-is
- or write a different action

Phase 2 will apply only what you approve.

## Sources and how to read this

| Code | Source |
|---|---|
| **G§n** | *Fabrik Finance — MVP Product Requirements Document*, pp. 1–31 of `Fabrik Finance PRD.pdf` (general bookkeeping MVP) |
| **E§n** | *Product Requirements Document — Expo MVP*, pp. 34–65 of the same PDF (the agricultural Expo release) |
| **Flow n** | E§29 *Expo Demo Flow*, Steps 1–6: Home → Books → Document AI → CFO → Funding → Ask Fabrik |

- **No separate app workflow document was found.** The prompt's workflow link was empty, and the repo has none. `docs/DEMO_SCRIPT.md` was written during development, so it is **not** treated as a source. Until you supply the workflow document, the workflow is taken to be:
  - the E§29 demo flow,
  - the G§19 client-question loop (Ask client → Finance Inbox → answer → back to processing),
  - the G§14 monthly close sequence.
- **Pages 32–33 of the PDF** are a Fondo integration comparison: commentary, not requirements.
- **Where G and E conflict**, the Expo PRD governs the client portal, because it is the later and more specific document. Examples: the E§5 navigation, and the E§6 KPIs being YTD instead of the current month.
- **Ops-portal screens** come from G§16–19 and G§23; E§24 restates them.

**Classification**
- **CORE**: explicitly in the PRD or workflow.
- **SUPPORTING**: not named, but a core step needs it to work.
- **EXTRA**: beyond scope.

**Action**: Keep / Simplify / Hide behind feature flag (a single `SHOW_EXTRAS=false` flag unless noted) / Remove.

**Primary**: a filled brand/AI button. Line numbers are as of commit `2d0ed0a`.

---

## Summary

| Area | Verdict |
|---|---|
| **Whole screens that are EXTRA** | `/tax` (Tax & Credits: tax filing and R&D credits are explicitly out of scope, G§28/E§31) and `/ops/requirements` (internal planning page). |
| **Screens in the PRD but not in the Expo nav** | `/close`, `/close/[period]/package` and `/reconciliation` are CORE (G§11, G§14, G§15), but E§5's primary navigation doesn't list them. See decision **D1**. |
| **Role not in the PRD** | *External Accountant / CPA*. The PRD defines five roles (G§3). See **D2**. |
| **Screens not named but needed** | `/ops/clients` (entry to G§29 #18 "Client Workspace"), `/funding/profile` (E§13), `/ask` full page (E§21). |
| **Largest sources of noise** | Home has 4 extra cards, Ops dashboard 4 extra widgets, Integrations a 6-tile connector roadmap plus a Reliability explainer. Every screen has a description paragraph under the title. Internal scoping language is visible to clients: "Expo MVP", "Fondo-inspired", "A · PRD / B · Proposed / C · Future" badges. |
| **Workflow-critical items that must stay** | Everything tagged with a *Flow n* risk below, the G§19 Ask-client loop, and the G§14 close checklist and approval. |

---

## Decisions I need from you first

These change how the rest of the audit is applied.

| # | Question | Options | My recommendation | Decision |
|---|---|---|---|---|
| D1 | Monthly Close and Reconciliation are in G§11/§14/§29 but not in the E§5 client nav. | (a) Keep both nav items for everyone. (b) Reconciliation in the nav for staff only; Monthly Close kept in the nav. (c) Remove both from the client nav; the screens stay reachable from Home "Books status", notifications and the Ops portal. | (b): reconciliation is a "bookkeeper workspace" (G§11). The routes stay either way. | |
| D2 | External Accountant / CPA role (not one of the 5 PRD roles). | (a) Keep. (b) Hide: remove from the invite role picker, the demo login picker and the role help text; leave the permission definition so existing data still works. (c) Remove entirely, including the seeded user and a membership migration. | (b). It meets the "do not change role permissions" rule. | |
| D3 | Home KPIs: E§6 shows YTD figures (Revenue YTD $3.8M…); G§5 says "current month" and adds a *Bookkeeping Status* KPI. | (a) Keep E§6 (YTD, 6 cards). (b) Switch to G§5. | (a): Expo is the later document and the demo calibration matches it. | |
| D4 | Feature-flag mechanism for "Hide" items. | (a) One flag, `SHOW_EXTRAS` (env var, default `false`). (b) Separate flags per area. | (a) | |
| D5 | Demo helpers (demo login picker, demo MFA code, "Sample John Deere invoice", "Reset demo data", simulate-sync-failure, dev email outbox). They aren't PRD features, but E§28/E§34 require a stable demo you can run without a developer. | (a) Keep them behind the existing `FABRIK_DEMO_MODE` (already on). (b) Move them under `SHOW_EXTRAS`. | (a): keeps the Expo demo runnable. Two un-gated demo notices get gated (AUTH-12, COL-13). | |
| D6 | No app workflow document was supplied. | Send it, or confirm that the E§29 flow + G§19 loop + G§14 close is the workflow. | Please confirm or send the document. | |

---

## 1. Navigation and app shell

Files: `src/app/(app)/layout.tsx` (L), `src/components/shell/shell.tsx` (S), `src/components/shell/command-palette.tsx`, `src/components/ask/ask-panel.tsx`.

| ID | Item | File path(s) | Screen/route | PRD/workflow reference | Classification | Recommended action | Risk if removed | Decision |
|---|---|---|---|---|---|---|---|---|
| NAV-01 | Nav: Home, Finance Inbox (with open-count badge) | L:23-24 | all | E§5 | CORE | Keep | Breaks navigation | |
| NAV-02 | Nav: Books (staff see a needs-review count badge) | L:30 | all | E§5 | CORE | Keep | Breaks navigation | |
| NAV-03 | Nav: **Reconciliation** (all roles) | L:31 | all | G§11 (not in E§5 nav) | CORE screen / nav placement EXTRA | See **D1** | None if still reachable from Monthly Close/Ops | |
| NAV-04 | Nav: **Monthly Close** (all roles) | L:32 | all | G§14, G§29 #11 (not in E§5 nav) | CORE screen / nav placement EXTRA | See **D1** | Clients lose one-click access; Home "Books status" link remains | |
| NAV-05 | Nav: Bills, Collect | L:33 | all | E§5 | CORE | Keep | — | |
| NAV-06 | Nav: Funding, CFO, Ask Fabrik | L:39-40 | all | E§5 | CORE | Keep | — | |
| NAV-07 | Nav: Documents | L:46 | all | E§5 | CORE | Keep | — | |
| NAV-08 | Nav: **Tax & Credits** with "Preview" tag | L:47 | all | none (out of scope G§28, E§31) | EXTRA | Hide behind feature flag (with TAX-*) | None | |
| NAV-09 | Nav: Integrations | L:53 | all | E§5 | CORE | Keep | — | |
| NAV-10 | Nav label "Team & Settings" | L:54 | all | E§5 "Settings"; G§29 "Team / Settings" | CORE | Simplify: rename to "Settings" | None | |
| NAV-11 | Staff nav group "Fabrik Operations": Operations, Work Queue, AI Review Queue | L:58-66 | staff | G§29 #16–18, E§24 | CORE | Keep | Breaks Ops portal | |
| NAV-12 | Staff nav: Clients | L:66 | staff | G§29 #18 "Client Workspace" (entry) | SUPPORTING | Keep | Ops KPI drill-downs break (OPS-05) | |
| NAV-13 | Staff nav: Administration (admin only) | L:67 | admin | G§23 | CORE | Keep | — | |
| NAV-14 | Staff nav: **Requirements** | L:68 | staff | none | EXTRA | Remove (with REQ-*) | None | |
| NAV-15 | Sidebar collapse toggle | S:120-125 | all | none | SUPPORTING | Keep | — | |
| NAV-16 | Org switcher (popover with search; static label if 1 org) and "Demo" badge | S:178-238 | all | G§4.1 "select organization" | CORE | Simplify: drop the industry sub-line; keep the "Demo" badge only in demo mode | Multi-org users can't switch | |
| NAV-17 | Global search "Search everything…" and Ctrl K command palette (transactions, vendors, documents, programs, pages; "Ask Fabrik: …") | S:151-155; command-palette.tsx; api/v1/search | all | none | EXTRA | Hide behind feature flag | None; Ask Fabrik has its own launcher | |
| NAV-18 | Top-bar "QuickBooks synced {time}" / "QuickBooks needs attention" | S:157-162 | all | G§21 sync status, G§22 example | SUPPORTING | Keep | Connection problems less visible | |
| NAV-19 | Notifications bell (unread count, list, "Mark all read") | S:240-290 | all | G§22 (in-app) | CORE | Keep | — | |
| NAV-20 | Notification footer "Notifications are bundled — never one per transaction." | S:285 | all | G§22 (describes it) | EXTRA (text) | Remove | None | |
| NAV-21 | User menu (name, role badge, "MFA on/off" badge, "Profile & security", "Sign out") | S:292-331 | all | G§4.1 | CORE | Simplify: drop the MFA badge | — | |
| NAV-22 | Floating "Ask Fabrik" launcher (all pages except /ask) | S:173; ask-panel.tsx:270-273 | all | G§13 "Persistent button: Ask Fabrik" | CORE | Keep | Breaks G§13 | |

---

## 2. Home `/`

Files: `src/app/(app)/page.tsx` (H), `src/components/charts.tsx`, `src/components/home/ask-accountant.tsx`, `src/server/services/finance.ts` (brief).

| ID | Item | File path(s) | Screen/route | PRD/workflow reference | Classification | Recommended action | Risk if removed | Decision |
|---|---|---|---|---|---|---|---|---|
| HOME-01 | Eyebrow "{legal name} · {date}" | H:51 | / | none | EXTRA | Simplify: date only, or remove | None | |
| HOME-02 | Greeting "Good morning, {name}" | H:52 | / | none | SUPPORTING (page title) | Simplify: plain "Home" or org name | None | |
| HOME-03 | Header button "Finance package" | H:55 | / | none on Home | EXTRA | Remove | None; package reachable from Monthly Close | |
| HOME-04 | Header button "Ask Fabrik" (**primary**) | H:56 | / | G§13 (already provided by NAV-22) | EXTRA (duplicate) | Remove | None | |
| HOME-05 | "Fabrik needs your help" banner: counts by type and "Review" (**primary**) → /inbox; tagline "— everything else is handled." | H:38-45, 60-78 | / | G§5 "Attention required", E§23 | CORE | Simplify: drop the tagline and the gradient/icon | Breaks G§5 | |
| HOME-06 | KPI cards: Cash, Revenue YTD, Expenses YTD, Net income YTD, Receivables, Upcoming bills | H:81-86 | / | E§6, Flow 1 | CORE | Keep (see **D3**) | Breaks Flow 1 | |
| HOME-07 | KPI extras: "vs last year" deltas, "across bank accounts", "{x}% margin" hints | H:81-84 | / | none | EXTRA (decorative stats) | Simplify: remove | None | |
| HOME-08 | Revenue vs Expenses chart with 3M/6M/12M/YTD | H:90-93; charts.tsx:69 | / | E§6 | CORE | Keep | Breaks E§6 | |
| HOME-09 | Chart subtitle "Monthly, accrual basis · from QuickBooks Online"; legend totals; **Net income line** | H:91; charts.tsx:68, 88 | / | none | EXTRA | Simplify: remove all three | None | |
| HOME-10 | "Fabrik Finance Brief" card and "AI-generated" badge | H:96-97 | / | E§6, Flow 1 | CORE | Simplify: drop the subtitle "Observations generated from your books, forecast and funding profile" | Breaks Flow 1 | |
| HOME-11 | Brief lines: revenue YTD, category expense increase, AR > 30 days, **cash sufficient for 13 weeks**, **N potential government funding programs identified**; each links to its data, with a "basis" sub-line | finance.ts:332-347; H:100-115 | / | E§6 example lists all five | CORE | Keep | Breaks Flow 1 | |
| HOME-12 | "Books status" card: month, %, progress bar, checklist (8 tasks with detail text), "View monthly close →" | H:119-135; close.ts:31-39 | / | G§5 "Books status" | CORE | Simplify: drop the per-task detail text. The 8 tasks are G§14's list; G§5's example has 5 | Breaks G§5 | |
| HOME-13 | "Next 13 weeks" forecast card (low point, buffer, mini chart, "Watch cash" badge, link) | H:138-154 | / | none on Home (E§18/19 live in CFO) | EXTRA | Remove | None; CFO has it | |
| HOME-14 | "Funding opportunities" card (top 3 programs, disclaimer, "All funding matches") | H:156-175 | / | none on Home | EXTRA (upsell) | Remove | None; the brief line HOME-11 still links to Funding | |
| HOME-15 | "Your Fabrik accounting team" card, "Dedicated team" badge (tooltip "Proposed Fondo-inspired addition…") | H:178-207 | / | none | EXTRA | Remove | None | |
| HOME-16 | "Message your team" button and modal (sends an accountant question to the inbox) | H:200; ask-accountant.tsx | / | none (G§6 lists accountant questions *from* Fabrik) | EXTRA | Hide behind feature flag | Only client-initiated way to create an accountant question | |
| HOME-17 | Footer "Figures are accrual-basis from QuickBooks Online as of {date}. Cash $x · AR aging…" | H:208-210 | / | none | EXTRA (text) | Remove | None | |

---

## 3. Finance Inbox `/inbox`

Files: `src/app/(app)/inbox/page.tsx` (P), `src/components/inbox/inbox-list.tsx` (IL).

| ID | Item | File path(s) | Screen/route | PRD/workflow reference | Classification | Recommended action | Risk if removed | Decision |
|---|---|---|---|---|---|---|---|---|
| INB-01 | Title and "{n} open" / "All clear" badge | P:43-45 | /inbox | G§6, E§23 | CORE | Keep | — | |
| INB-02 | Description "Fabrik only interrupts you when a person's input or decision is needed. Answers become structured bookkeeping information — no email chains." | P:44 | /inbox | none | EXTRA (text) | Remove | None | |
| INB-03 | Tabs "Needs your input" / "Answered" | P:36-54 | /inbox | none | SUPPORTING | Keep | History hidden | |
| INB-04 | Empty states ("Nothing needs your attention" + "Your books are being maintained…") | P:55-58 | /inbox | none | SUPPORTING | Simplify to one line | — | |
| INB-05 | Card type label, icon, title, body, "Fabrik AI · {date} UTC" | IL:38-48, 86-98 | /inbox | G§6 item types | CORE | Simplify: drop "UTC" | — | |
| INB-06 | Transaction clarification: context (raw bank text, date, account, amount), "Fabrik thinks" options with % and confidence bar, "Something else / add a comment", "Send answer" (**primary**) | IL:99, 126-167 | /inbox | G§6 example, G§19 | CORE | Simplify: show the vendor name instead of the raw bank string; drop the confidence bars (keep %) | Breaks G§19 loop | |
| INB-07 | Footnote "Your answer goes straight back into processing. Fabrik remembers it for similar transactions." | IL:167 | /inbox | none | EXTRA (text) | Remove | None | |
| INB-08 | Bill approval: Vendor/Bill #/Due/Amount, note field, Approve (**primary**) / Request review / Reject, "View invoice" | IL:178-193 | /inbox | E§10, E§23 | CORE | Keep | Breaks bill approval | |
| INB-09 | Bill helper "Approving doesn't pay the bill — payment stays in your bank. Approved bills feed your cash forecast." | IL:195 | /inbox | none | EXTRA (text) | Remove | None | |
| INB-10 | Missing document: drop zone "Upload the document — Fabrik will extract it and match it automatically", "Choose file" (**primary**), "I don't have it" | IL:205-252 | /inbox | G§6, E§23 | CORE | Simplify: label "Upload document" | Breaks missing-document flow | |
| INB-11 | "Use sample JD invoice" (AI-styled button, demo org only) | IL:242-250 | /inbox | none (demo helper) | EXTRA | See **D5** (demo mode) | Slower Flow 3 demo | |
| INB-12 | Overdue invoice: line, "Draft a reminder" (primary-styled) → /collect, "Not now" | IL:258-266 | /inbox | E§11, E§23 | CORE | Keep | Breaks inbox → Collect | |
| INB-13 | Funding info request: hard-coded "Base acres" field, "Save to profile" (**primary**), "View program" | IL:268-284 | /inbox | E§23 "Funding information request" | CORE | Simplify: drop the "View program" link | Request can't be answered | |
| INB-14 | Generic answer (textarea, Dismiss, Send) for accountant, close, integration, vendor and customer questions | IL:286-297 | /inbox | G§6 | CORE | Keep | Those types can't be answered | |
| INB-15 | Answered response box (answer, by, time) | IL:100-107 | /inbox | G§20 | SUPPORTING | Keep | — | |

---

## 4. Books `/books` (Transactions, Reports, AI rules, transaction drawer)

Files: `src/app/(app)/books/page.tsx` (B), `src/components/books/filters.tsx` (F), `txn-table.tsx` (T), `report.tsx` (R).

| ID | Item | File path(s) | Screen/route | PRD/workflow reference | Classification | Recommended action | Risk if removed | Decision |
|---|---|---|---|---|---|---|---|---|
| BOOK-01 | Title "Books" and "QuickBooks Online · synced {time} UTC" badge | B:31-33 | /books | E§7 | CORE | Simplify: drop "UTC" | — | |
| BOOK-02 | Description "Every transaction from QuickBooks Online, categorized by Fabrik AI. High-confidence, low-risk items are processed automatically; everything else is reviewed by a person." | B:32 | /books | none | EXTRA (text) | Remove | None | |
| BOOK-03 | Tabs "Transactions" / "Reports" | B:24-25 | /books | E§7, E§8 | CORE | Keep | Home/Ask links use `?tab=reports` | |
| BOOK-04 | Tab "AI rules" (learned-rule table, intro "When someone corrects a category, Fabrik remembers it…", footer "Rule types: … Manage in Team & Settings → AI") | B:26, 129-164 | /books | G§25 (the engine; no screen specified) | EXTRA (duplicate screen) | Hide behind feature flag; learned rules are also listed in Settings → AI (SET-14) | None; learning keeps working | |
| BOOK-05 | Status tabs: All, Needs review, Waiting for client, Processed, Approved, Excluded | F:10-17, 46-57 | /books | G§7 statuses, E§7 | CORE | Keep | — | |
| BOOK-06 | Filters: Date, Account, Category, Vendor, Amount min/max | F:63-98 | /books | E§7 | CORE | Keep | — | |
| BOOK-07 | Filter: AI confidence | F:88-93 | /books | G§7 (not in E§7) | CORE | Keep | — | |
| BOOK-08 | Search box and "Clear" | F:59-62, 99-103 | /books | none | SUPPORTING | Keep | Flow 2 uses search ("Deere") | |
| BOOK-09 | Columns: Date, Description, Amount, Category, AI confidence, Status | T:43-49 | /books | E§7 | CORE | Simplify: rename to "Vendor / Description" | — | |
| BOOK-10 | Column "Account" is hidden below the 2xl breakpoint | T:46, 65 | /books | E§7 Account column | CORE | Simplify: always show it | PRD column effectively missing on laptops | |
| BOOK-11 | Row icons (paperclip "Has document", shield "Risk: …"), pagination, empty state | T:36, 59-60, 77-83 | /books | E§7 (document match, risk) | SUPPORTING | Keep | — | |
| BOOK-12 | Drawer: vendor, date · account, amount, raw description, status | T:137-178 | drawer | G§7 detail | CORE | Keep | Breaks Flow 2 | |
| BOOK-13 | Drawer facts: Fabrik category, Transaction type, Normalized vendor | T:183-185 | drawer | E§7 AI categorization | CORE | Keep | — | |
| BOOK-14 | Drawer fact "Write-back to QuickBooks: Synced/Pending/Error" | T:186 | drawer | G§21 write-back | SUPPORTING | Keep for staff; Hide behind feature flag for clients | — | |
| BOOK-15 | AI recommendation box: suggested category, confidence badge and bar, "Reason: …" | T:197-207 | drawer | E§7, Flow 2 | CORE | Simplify: drop the bar | Breaks Flow 2 | |
| BOOK-16 | Model name and version shown in the recommendation box | T:199-201 | drawer | G§20 (store, not display) | EXTRA (shown to clients) | Simplify: staff only; still stored in the audit trail | None | |
| BOOK-17 | Alternative category chips "{name} · x%" | T:208-214 | drawer | none | EXTRA | Remove | None | |
| BOOK-18 | "Decision: eligible for automatic processing … thresholds ≥98% auto, ≥85% review" | T:215-217 | drawer | E§7 thresholds | SUPPORTING | Simplify: staff only | — | |
| BOOK-19 | Risk box "Needs a person — risk rules override confidence", anomaly, possible duplicate with "Exclude duplicate" | T:221-233 | drawer | E§7 (anomaly, duplicate, risk override) | CORE | Keep | — | |
| BOOK-20 | Footer: "Approve · {category}" (**primary**), "Change", "Ask client" (staff) | T:152-154 | drawer | E§7 [APPROVE][CHANGE], G§19 | CORE | Simplify: label "Approve" | Breaks Flow 2 / G§19 | |
| BOOK-21 | Ask-client panel with AI-drafted question, "Send to Finance Inbox" (**primary**), which can show alongside the footer primary | T:237-246 | drawer | G§19 | CORE | Simplify: hide the footer Approve while the panel is open (one primary) | — | |
| BOOK-22 | Change panel: "Fabrik will learn from this correction for {vendor}.", note field, Save | T:247-262 | drawer | E§7 [CHANGE], G§25 | CORE | Simplify: drop the "will learn" sentence | — | |
| BOOK-23 | "Recategorize" on processed/approved transactions | T:157-158 | drawer | none | SUPPORTING | Keep | No fix-after-approve path | |
| BOOK-24 | "Supporting documents" list; empty text "No document attached — purchases over $10,000 need an invoice." | T:264-281 | drawer | G§7 supporting document | CORE | Keep | — | |
| BOOK-25 | "Previous {vendor} transactions" (up to 6) | T:283-296 | drawer | none | EXTRA | Remove | None | |
| BOOK-26 | Audit trail timeline in the drawer | T:298-323 | drawer | G§20, E§25 | SUPPORTING | Keep (collapsed by default) | No visible audit on a transaction | |
| BOOK-27 | Reports: P&L (Monthly/Quarterly/Annual, year select), Balance Sheet (as-of date), Cash Flow (date range) | R:66-96 | /books?tab=reports | E§8, G§12 | CORE | Keep | — | |
| BOOK-28 | Export PDF / Excel | B:101-106 | reports | E§8 | CORE | Keep | — | |
| BOOK-29 | Report integrity badges "✓ Assets = Liabilities + Equity", "✓ Net change ties to bank balances", "Source: QuickBooks Online" | B:116-119 | reports | none | EXTRA | Simplify: show only when a check fails; remove the source badge | None | |
| BOOK-30 | Report footer "Reports come from the accounting system of record; Fabrik doesn't keep a parallel ledger. Items still awaiting review appear under Uncategorized until approved." | B:124 | reports | none | EXTRA (text) | Simplify: keep only the second sentence | None | |

---

## 5. Bills `/bills`

Files: `src/app/(app)/bills/page.tsx` (P), `src/components/bills/bills-table.tsx` (T).

| ID | Item | File path(s) | Screen/route | PRD/workflow reference | Classification | Recommended action | Risk if removed | Decision |
|---|---|---|---|---|---|---|---|---|
| BILL-01 | Title "Bills" | P:14 | /bills | E§10 | CORE | Keep | — | |
| BILL-02 | Description "Accounts payable from QuickBooks and uploaded invoices. Approve what's correct — approved and upcoming bills flow into your 13-week cash forecast." | P:14 | /bills | none | EXTRA (text) | Remove | None | |
| BILL-03 | KPIs Outstanding, Due this week, Overdue | P:16-18 | /bills | E§10 "Bills dashboard" | CORE | Keep | — | |
| BILL-04 | KPI "Awaiting approval" | P:19 | /bills | none | EXTRA | Remove | None | |
| BILL-05 | Tabs Open / Needs approval / Approved / Paid & rejected / All | T:28-58 | /bills | none | SUPPORTING | Simplify: Open / All | — | |
| BILL-06 | Columns Vendor, Invoice #, Amount, Invoice date, Due date, Category, Status | T:66-94 | /bills | E§10 | CORE | Keep | — | |
| BILL-07 | "From document" badge (AI styling) | T:81 | /bills | E§10 (source) | SUPPORTING | Simplify: neutral icon | — | |
| BILL-08 | Row actions Approve (**primary**, one per row), Review, Reject | T:95-101 | /bills | E§10 Approve / Reject / Request Review | CORE | Simplify: rename "Review" to "Request review"; make Approve secondary in the table | Breaks approval and forecast input | |
| BILL-09 | Approved-row text "Ready to pay" | T:103 | /bills | none (implies payment, E§31) | EXTRA (wording) | Simplify: "Approved" | None | |
| BILL-10 | Notice "No payments are made from Fabrik — Bill payment and ACH transfers are outside the Expo MVP. Pay from your bank or QuickBooks…" | P:25 | /bills | none (internal wording) | EXTRA | Remove | None | |

---

## 6. Collect `/collect`

Files: `src/app/(app)/collect/page.tsx` (P), `src/components/collect/collect-table.tsx` (T).

| ID | Item | File path(s) | Screen/route | PRD/workflow reference | Classification | Recommended action | Risk if removed | Decision |
|---|---|---|---|---|---|---|---|---|
| COL-01 | Title "Collect" | P:21 | /collect | E§11 | CORE | Keep | — | |
| COL-02 | Description "Accounts receivable from QuickBooks, with AI-drafted collection reminders. Nothing is sent without your approval." | P:21 | /collect | none | EXTRA (text) | Remove | None | |
| COL-03 | Outstanding AR and aging Current / 1–30 / 31–60 / 60+ | P:22-25; charts.tsx:220-230 | /collect | E§11 dashboard | CORE | Simplify: drop subtitle "Aging by days past due" | — | |
| COL-04 | Aging stacked bar | charts.tsx:210-219 | /collect | none | EXTRA (decorative) | Remove (figures remain) | None | |
| COL-05 | Columns Customer, Invoice #, Invoice date, Due date, Amount, Outstanding, Days overdue, Status | T:42-65 | /collect | E§11 | CORE | Keep | — | |
| COL-06 | Column "Fabrik recommends" with "Send reminder" on overdue rows | T:50, 69-70 | /collect | E§11 "may recommend: Send reminder" | CORE | Keep | Breaks E§11 | |
| COL-07 | Empty state "No open invoices / Everyone has paid. Nice." | T:34 | /collect | none | SUPPORTING | Simplify: drop "Nice." | — | |
| COL-08 | Reminder drawer: "Generate a professional reminder" + paragraph "Fabrik writes the message… before anything is sent." | T:126-129 | drawer | E§11 | CORE / paragraph EXTRA | Simplify: drop the paragraph | — | |
| COL-09 | "Generate reminder" | T:130-136 | drawer | E§11 | CORE | Keep | Breaks E§11 | |
| COL-10 | Draft: "AI draft — review before sending" badge, To, Subject, Message | T:140-143 | drawer | E§11 | CORE | Keep | — | |
| COL-11 | "{friendly/firm} tone" badge | T:140 | drawer | none | EXTRA | Remove | None | |
| COL-12 | "Approve & send" (**primary**), "Discard" | T:108-117 | drawer | E§11 "user must approve" | CORE | Keep | Breaks E§11 | |
| COL-13 | Notice "Demo: approved emails are delivered to the development outbox, not to the customer." (**always shown**) | T:144 | drawer | none | EXTRA | Hide behind feature flag (demo mode only, **D5**) | None | |
| COL-14 | "Sent reminders" history | T:147-157 | drawer | G§20 | SUPPORTING | Keep | — | |
| COL-15 | Notice "Human approval required — Fabrik drafts; you decide. Automated collection workflows and customer payments are outside the Expo MVP." | P:34 | /collect | none (internal wording) | EXTRA | Remove | None | |

---

## 7. Documents `/documents`

Files: `src/app/(app)/documents/page.tsx` (DP), `src/components/documents/documents-view.tsx` (DV).

| ID | Item | File path(s) | Screen/route | PRD/workflow reference | Classification | Recommended action | Risk if removed | Decision |
|---|---|---|---|---|---|---|---|---|
| DOC-01 | Title, "FabrikIDP" badge, description "Drop invoices, receipts and statements here. FabrikIDP extracts the key fields and matches each document to its QuickBooks transaction." | DP:49-53 | /documents | E§9 | CORE / description EXTRA | Simplify: remove the description | — | |
| DOC-02 | Drag-and-drop zone, "Choose files" (**primary**), helper "Invoices, receipts, bank and credit-card statements · PDF, PNG, JPEG, WebP · up to 15 MB each, 10 at a time" | DV:118-162 | /documents | E§9 upload, Flow 3 | CORE | Simplify: helper "PDF or image, up to 15 MB" | Breaks Flow 3 | |
| DOC-03 | Upload "Document type" select incl. Entity document, Farm record, Tax document | DV:151-160 | /documents | E§9 (4 types) | SUPPORTING / 3 options EXTRA | Simplify: auto-detect only, or the 4 PRD types | — | |
| DOC-04 | "Sample John Deere invoice" button (AI-filled, demo org only) and `/api/v1/samples/john-deere-invoice` | DV:163-172; api route | /documents | Flow 3 (demo helper) | SUPPORTING (demo) | See **D5**; restyle as secondary so "Choose files" is the only primary | Slower Flow 3 demo | |
| DOC-05 | Type tabs All / Invoices / Receipts / Statements | DV:36, 53-59 | /documents | E§9 "view processed documents" | CORE | Keep | — | |
| DOC-06 | Type tabs "Entity & farm", "Tax" | DV:36 | /documents | none (tax out of scope) | EXTRA | Remove "Tax"; Hide behind feature flag "Entity & farm" | None; documents still under All | |
| DOC-07 | Search, empty state | DV:60-67 | /documents | none | SUPPORTING | Keep | — | |
| DOC-08 | Table: Document, Type, Vendor · number, Total, Matched transaction ("NN% match found"), Status | DV:69-110 | /documents | E§9 | CORE | Keep | — | |
| DOC-09 | Drawer: preview, Download, extracted fields (vendor, number, dates, PO, subtotal, tax, total, currency), line items | DV:201-254 | drawer | E§9 AI extraction, Flow 3 | CORE | Keep | Breaks Flow 3 | |
| DOC-10 | Caption "… · stored securely outside the web root" / "Seeded record — preview is generated from extracted fields (synthetic)." | DV:210 | drawer | none | EXTRA (technical text) | Remove the first; synthetic note only in demo mode | None | |
| DOC-11 | Raw tag badges (e.g. `funding:entity`, `tax:2025`) and "Extracted by {provider}" | DV:215-219 | drawer | none | EXTRA | Remove | None | |
| DOC-12 | Per-field confidence % | DV:235 | drawer | none | EXTRA | Simplify: show only when below 95% | None | |
| DOC-13 | Notice "Stored for your records. Fabrik extracts fields from invoices, receipts and bank/card statements in this release." | DV:222 | drawer | none | EXTRA | Remove | None | |
| DOC-14 | "Correct fields" editor ("Confirm the key fields", Save & match) | DV:228, 321-365 | drawer | none (human review of extraction) | SUPPORTING | Keep | Low-confidence extractions can't be fixed | |
| DOC-15 | Match: "Possible transaction", "Match confidence: NN%", reason badges, "Match" (**primary**), "Not this one" | DV:271-291 | drawer | E§9 example, Flow 3 | CORE | Simplify: drop the confidence bar; at most 2 reason badges | Breaks Flow 3 | |
| DOC-16 | Matched state "✓ Matched", "Open transaction →" | DV:263-270 | drawer | E§9 | CORE | Keep | — | |
| DOC-17 | No-match helper "If this is an unpaid invoice, create a bill so it shows in Bills and your cash forecast." and Category + "Create bill" | DV:299-309 | drawer | E§10 says bills may come from document upload | SUPPORTING (the only document→bill path) / text EXTRA | Simplify: keep "Create bill", drop the sentence | Bills can't originate from uploads (E§10) | |
| DOC-18 | Footnote "Model: {provider} {version}. Every extraction and match decision is recorded in the audit trail." | DV:314 | drawer | none | EXTRA | Remove | None | |

---

## 8. Funding `/funding`, `/funding/[id]`, `/funding/profile`

Files: `src/app/(app)/funding/page.tsx` (FL), `[id]/page.tsx` (FD), `profile/page.tsx` (PP), `src/components/funding/*` (FA = funding-actions, PF = profile-form).

| ID | Item | File path(s) | Screen/route | PRD/workflow reference | Classification | Recommended action | Risk if removed | Decision |
|---|---|---|---|---|---|---|---|---|
| FUND-01 | Eyebrow "Fabrik Funding", title "Potential funding opportunities" | FL:26-28 | /funding | E§16 | CORE | Simplify: drop the eyebrow | — | |
| FUND-02 | Description "Government grants, loans, cost-share, assistance and incentive programs matched to your farm/business profile. Every program links to its official source." | FL:29 | /funding | none | EXTRA (text) | Remove | None | |
| FUND-03 | Summary "N programs identified" with High / Possible / More info required counts | FL:33-44 | /funding | E§16, Flow 5 | CORE | Simplify: label "High potential" (PRD wording) | Breaks E§16 | |
| FUND-04 | Profile completeness card (%, bar, "Add … to sharpen your matches…", "Review profile") and header "Edit farm profile" | FL:30, 45-53 | /funding | E§13 | SUPPORTING | Simplify: one line "Profile NN% complete · Review"; drop the duplicate header button | — | |
| FUND-05 | Disclaimer "Potential matches, not eligibility decisions…" | FL:56-58 | /funding | E§15 "must not claim the business qualifies", E§17 | CORE | Simplify: one sentence | Compliance risk | |
| FUND-06 | Program cards grouped by level: score, agency, name, level badge, type badge, deadline, "Verified {date}" | FL:60-92 | /funding | E§14–16 | CORE | Keep | Breaks Flow 5 | |
| FUND-07 | Card extras: icon tile, "State program/Federal" badge, source-kind label, hover arrow, first qualifying factor | FL:70, 81, 84-90 | /funding | none | EXTRA (decorative) | Simplify: remove all but "Verified {date}" | None | |
| FUND-08 | Watch-status badges ("saved", "preparing") and detail buttons Save / Preparing / Hide, "Status: …" | FL:82; FA:23, 28-32 | /funding, /funding/[id] | none | EXTRA | Hide behind feature flag | None | |
| FUND-09 | "Show all N programs in the database" toggle | FL:98-100 | /funding | E§15 "Unlikely match" level | SUPPORTING | Keep | Unlikely matches invisible | |
| FUND-10 | Detail: back link, title, type, description; Match score and level; "Why Fabrik identified this" (qualifying factors, information required, disqualifiers) | FD:38-78 | /funding/[id] | E§15–16, Flow 5 | CORE | Simplify: drop subtitle "Criteria checked against your farm/business profile" | Breaks Flow 5 | |
| FUND-11 | Application readiness: 7 items and "NN% ready" (plus progress ring) | FD:83-97 | /funding/[id] | E§17 (exact items, "71% READY") | CORE | Simplify: drop the ring (duplicates %) | Breaks E§17 | |
| FUND-12 | Documents available: P&L, Balance Sheet, Cash Flow, tagged documents, "Additional farm information" | FD:100-112 | /funding/[id] | E§16 | CORE | Keep (drop subtitle) | Breaks E§16 | |
| FUND-13 | "Check eligibility" (**primary**) and helper "Your Fabrik team reviews the program with you… Nothing is submitted on your behalf." | FA:24-27 | /funding/[id] | E§16 [CHECK ELIGIBILITY], E§17 | CORE | Simplify: helper "Nothing is submitted on your behalf." | Breaks E§16 | |
| FUND-14 | Official source link, "Last verified {date} · {source kind}" | FD:120-127 | /funding/[id] | E§14, E§34 #14 | CORE | Simplify: drop source kind | — | |
| FUND-15 | Program details (agency, type, geography, range, deadline, eligible entities) and cards Eligible activities / Financial criteria / Agricultural criteria / Required documents | FD:129-151 | /funding/[id] | E§14 | CORE | Simplify: merge into one details card | — | |
| FUND-16 | "Verification notes" (internal research notes, e.g. "The NRCS program page … timed out repeatedly…") | FD:152 | /funding/[id] | none | EXTRA | Remove (or staff only) | None | |
| FUND-17 | Profile: financials pre-filled from QuickBooks (read-only) | PF:66-75 | /funding/profile | E§13 | CORE | Keep | — | |
| FUND-18 | Profile: legal name, entity type, state, county, employees, owners and %, acreage, crops, livestock, properties, equipment, planned investments, business activities | PF:79-176 | /funding/profile | E§13 (exact list) | CORE | Keep | Breaks matching | |
| FUND-19 | Profile: years farming, beginning farmer, base acres, project description, conservation practices, five Yes/No questions | PF:89-92, 113, 167-185 | /funding/profile | none (each feeds a program rule; project description feeds E§17) | SUPPORTING | Keep; group under "More details" | Programs drop to "More information required" | |
| FUND-20 | Profile: EIN (masked), "Rural area?" | PF:85, 93-95 | /funding/profile | none (no rule uses them) | EXTRA | Remove "Rural area?"; Hide behind feature flag EIN | None | |
| FUND-21 | Save bar "Saving re-runs funding matching immediately.", Reset, "Save profile" (**primary**) | PF:188-194 | /funding/profile | none | SUPPORTING | Simplify: drop the sentence | — | |

---

## 9. CFO `/cfo` (Dashboard, 13-week forecast, Scenarios)

Files: `src/app/(app)/cfo/page.tsx` (CP), `src/components/cfo/forecast.tsx` (FC), `scenarios.tsx` (SC).

| ID | Item | File path(s) | Screen/route | PRD/workflow reference | Classification | Recommended action | Risk if removed | Decision |
|---|---|---|---|---|---|---|---|---|
| CFO-01 | Title "CFO" and tagline "Your accounting turned into decisions: where cash is heading, what's changed, and what a big purchase would do to the business." | CP:26 | /cfo | E§18 | CORE / tagline EXTRA | Simplify: remove the tagline | — | |
| CFO-02 | Tabs CFO dashboard / 13-week cash forecast / Scenarios | CP:27-31 | /cfo | E§18–20 | CORE | Keep | Ask links target these tabs | |
| CFO-03 | KPIs Cash, Revenue, Expenses, Net income, Operating margin, AR, AP, Cash in 13 weeks | CP:67-74 | /cfo | E§18 | CORE | Simplify: drop the "low $X" hint | — | |
| CFO-04 | "13-week projected cash" chart (known solid, estimated hatched), "Inspect" | CP:77-82 | /cfo | E§18, E§19 | CORE | Keep | — | |
| CFO-05 | "AI insights" (material changes with basis lines) | CP:83-101 | /cfo | E§18 | CORE | Simplify: drop the subtitle | — | |
| CFO-06 | Business ratios (current ratio, working capital, debt-to-assets, DSCR) with formula notes | CP:58-63, 103-114 | /cfo | E§18 "selected business ratios" | CORE | Simplify: drop formula notes and subtitle | — | |
| CFO-07 | Footer "TTM revenue … · TTM profit … · total debt … · N acres farmed." | CP:115 | /cfo | none | EXTRA (decorative stats) | Remove | None | |
| CFO-08 | Forecast controls: seasonal-sales slider (+ helper), cash buffer, "Include estimated amounts" | FC:18-30 | forecast | none (E§19: *inspect* assumptions) | EXTRA | Hide behind feature flag (use defaults) | None; buffer default still drives badges/verdicts | |
| CFO-09 | Forecast KPIs Cash today, Week 13, Known in/out, Estimated in/out; Lowest point | CP:129-133 | forecast | E§19 | CORE / Lowest point SUPPORTING | Keep | — | |
| CFO-10 | "Projected cash by week" chart and buffer badge/subtitle ("Watch"/"Sufficient") | CP:135-140 | forecast | E§19 / badge none | CORE / badge EXTRA | Simplify: drop the badge and buffer text | — | |
| CFO-11 | Week-by-week table, expandable to every flow (known/estimated, source) | FC:36-98 | forecast | E§19 by week, known vs estimated | CORE | Simplify: drop subtitle "Expand a week to see…" | Breaks E§19 | |
| CFO-12 | "Assumptions" card; "Excluded from the forecast" card | CP:144-168 | forecast | E§19 inspect assumptions | CORE / Excluded SUPPORTING | Simplify: subtitle "What the forecast is based on" | Breaks E§19 | |
| CFO-13 | Scenario types: farmland, equipment, hire, revenue change, customer stops paying | SC:14-20, 77-85 | scenarios | E§20 (exact five), Flow 4 | CORE | Keep | Breaks Flow 4 | |
| CFO-14 | Scenario inputs (price, down %, count, change %, plus rate, term, week, net/acre, depreciation, burden %) | SC:22-48, 88-100 | scenarios | E§20 | CORE (headline) / SUPPORTING (rest) | Simplify: show 1–2 headline inputs, others under "Assumptions" | — | |
| CFO-15 | "Run scenario" (**primary**); save-scenario icon | SC:102-103 | scenarios | E§20 / save: none | CORE / save EXTRA | Hide behind feature flag the save button | None | |
| CFO-16 | Verdict (Sparkles AI styling, bullets incl. "(lenders commonly look for 1.25× or more)") | SC:113-117 | scenarios | Flow 4 "explains the financial impact" | SUPPORTING | Simplify: remove AI styling (it is computed); shorten the bullets | Ask reuses the verdict text | |
| CFO-17 | Impact table rows Cash wk 13, Annual expenses, Annual profit, Total debt / extra rows Lowest cash, D/A, DSCR | SC:118-154 | scenarios | E§20 output list | CORE / 3 rows EXTRA | Simplify: keep the PRD rows | None | |
| CFO-18 | 13-week cash chart with verdict-level badge; "Assumptions used" | SC:155-170 | scenarios | E§20 | CORE / badge EXTRA | Simplify: drop the badge and subtitles | — | |

---

## 10. Ask Fabrik `/ask` and slide-over panel

Files: `src/app/(app)/ask/page.tsx` (AP), `src/components/ask/ask-panel.tsx` (AK), `src/server/services/ask.ts` (AS).

| ID | Item | File path(s) | Screen/route | PRD/workflow reference | Classification | Recommended action | Risk if removed | Decision |
|---|---|---|---|---|---|---|---|---|
| ASK-01 | Chat (full page and slide-over with "Open full page") | AK:147-297; AP:28-30 | /ask, panel | E§21, Flow 4, Flow 6 | CORE | Keep | Breaks Flow 4/6 | |
| ASK-02 | Empty state "Ask anything about {org}" and paragraph "Fabrik routes your question to Books, Bills, Collect, Funding, CFO or Documents… Read-only — it never moves money." | AK:183-189 | /ask, panel | E§22 | SUPPORTING | Simplify: heading only | — | |
| ASK-03 | Starter questions (8 page / 5 panel) incl. the two Flow 6 questions and the farmland question | AK:11-20, 190-196 | /ask, panel | E§21 examples, Flow 4, Flow 6 | CORE | Keep | Presenters must type questions | |
| ASK-04 | Answer: module badges, summary, metrics, bullets, supporting table, "Open supporting data", Sources | AK:29-132 | answers | E§21 "supporting data", E§22 grounded | CORE | Keep | — | |
| ASK-05 | Answer "Read-only" refusal | AK:37; AS:157-167 | answers | G§13 | CORE | Keep | Breaks G§13 | |
| ASK-06 | Answer link "Open this scenario in CFO" | AS:491 | answers | Flow 4 | CORE | Keep | Breaks Flow 4 hand-off | |
| ASK-07 | Answer cross-sell links ("Funding that may help"; "Open Bills/Collect" on refusals) | AS:163, 491 | answers | none | EXTRA (unsolicited) | Remove | None | |
| ASK-08 | Follow-up suggestion chips (up to 3 after every answer) | AK:133-141 | answers | Flow 6 (the second question) | SUPPORTING | Simplify: at most 1 | Flow 6 second question needs typing | |
| ASK-09 | "Wording by {model}; figures computed by Fabrik." | AK:142 | answers | none | EXTRA | Remove | None | |
| ASK-10 | Composer disclaimer "Answers are computed from your QuickBooks data, documents and verified program sources. Funding matches are potential, not confirmed eligibility." | AK:254 | /ask, panel | E§15 | SUPPORTING | Simplify: second sentence only | — | |
| ASK-11 | Side card "How Ask Fabrik answers" (3 bullets) and AI provider/model badges | AP:32-39 | /ask | none | EXTRA | Remove | None | |
| ASK-12 | Side card "Try asking" (12 questions by module) | AP:41-55 | /ask | E§21 examples | CORE content / duplicate | Simplify: keep one question list (ASK-03) | None | |
| ASK-13 | Side card "Recent questions" | AP:56-68 | /ask | none | EXTRA | Hide behind feature flag | None | |
| ASK-14 | Intent `books.close_status` (answers monthly-close status) | AS:181, 382-391 | answers | none (outside E§21 categories) | EXTRA | Hide behind feature flag | None | |
| ASK-15 | **Bug to fix, not cut:** Flow 6 answer contains the hard-coded line "Farm profile: entity, ownership (60/40), 2,400 acres, crops and equipment" | AS:536 | answers | E§22 "grounded in actual customer data" | CORE (defect) | Simplify: compute from the profile | Wrong for any other org | |

---

## 11. Monthly Close `/close` and Finance Package `/close/[period]/package`

Files: `src/app/(app)/close/page.tsx` (CP), `src/components/close/close-actions.tsx` (CA), `[period]/package/page.tsx` (PK), `src/server/services/package.ts`, `src/server/pdf.ts`.

| ID | Item | File path(s) | Screen/route | PRD/workflow reference | Classification | Recommended action | Risk if removed | Decision |
|---|---|---|---|---|---|---|---|---|
| CLOSE-01 | Title "Monthly Close" | CP:25 | /close | G§14, G§29 #11 | CORE | Keep | — | |
| CLOSE-02 | Description "Each period has a close workflow. Fabrik completes the automatic steps; your bookkeeper and an independent reviewer finish it." | CP:26 | /close | none | EXTRA (text) | Remove | None | |
| CLOSE-03 | Badge "Schedule: monthly/quarterly/annual" | CP:27 | /close | none (PRD close is monthly) | EXTRA | Remove (with SET-17) | None | |
| CLOSE-04 | "Finance package" button | CP:28 | /close | G§15 | SUPPORTING | Keep. **Bug:** for quarterly orgs it links to `/close/2026-Q3/package`, which returns 404 | Package harder to reach | |
| CLOSE-05 | "Periods" list (4 months with bars) | CP:31-49 | /close | G§14 "each month" | SUPPORTING | Simplify: period select, no bars | Past months unreachable | |
| CLOSE-06 | Period header: progress ring, title, status, "Target close … · N days left · X of Y steps" | CP:54-62 | /close | G§14 | CORE / ring EXTRA | Simplify: drop the ring and target-date text | — | |
| CLOSE-07 | Actions "Complete bookkeeper review", "Approve & close books" (**primary**), "Reopen period", confirm modal | CA:23-50 | /close | G§14 Bookkeeper review, Reviewer approval | CORE | Simplify: one-line modal descriptions | Close can't complete | |
| CLOSE-08 | "Close checklist" (8 PRD tasks with detail and "Go →"); subtitle "Tasks are generated automatically from the state of your books" | CP:68-90 | /close | G§14 (exact list) | CORE | Simplify: drop the subtitle | Breaks G§14 | |
| CLOSE-09 | Owner badges (AI/Bookkeeper/Reviewer/Client) and "auto-tracked" tag | CP:77-78 | /close | none | EXTRA | Remove "auto-tracked"; keep owner badges | None | |
| CLOSE-10 | "Catch-up bookkeeping" card with "B · Proposed" badge and "Historical cleanup is a proposed Fondo-inspired service…" | CP:94-99 | /close | none (Fondo) | EXTRA | Remove | None | |
| CLOSE-11 | Notice "Bookkeeping schedule — … Quarterly and annual schedules are a proposed addition (classification B)… PRD target: monthly close in under 10 business days." | CP:100-102 | /close | none (internal) | EXTRA | Remove | None | |
| PKG-01 | Title "{Month} Finance Package", status pill, "Download PDF" (**primary**) | PK:22-26 | package | G§15, G§29 #12 | CORE | Keep | — | |
| PKG-02 | Draft view before close, with notice "Draft — Some transactions may still be under review…" | PK:18, 25, 28 | package | G§15 "once books are closed" | EXTRA (draft for clients) | Hide behind feature flag: drafts visible to staff only; remove the duplicate notice | Staff lose the preview if fully removed | |
| PKG-03 | Executive summary with AI observations | PK:30-38 | package | G§15 | CORE | Simplify: drop subtitle "What changed this month, in plain English" | — | |
| PKG-04 | KPI cards Revenue, Expenses, Net income, Ending cash | PK:42-47 | package | G§15 Executive Summary (implied) | SUPPORTING | Keep | — | |
| PKG-05 | Revenue & expense trend chart | PK:49-54 | package | G§15 | CORE | Simplify: remove the single-option "6M" toggle and the legend totals | — | |
| PKG-06 | Major expense changes, Notable transactions, P&L, Balance Sheet, Cash Flow | PK:57-104 | package | G§15 | CORE | Simplify: add headers to the expense-change table | — | |
| PKG-07 | "Reviewed by a person" anomaly badges on notable transactions | PK:85-92 | package | none | EXTRA | Remove | None | |

---

## 12. Reconciliation `/reconciliation`, `/reconciliation/[id]`

Files: `src/app/(app)/reconciliation/page.tsx` (RL), `[id]/page.tsx` (RD), `src/components/reconciliation/workspace.tsx` (RW).

| ID | Item | File path(s) | Screen/route | PRD/workflow reference | Classification | Recommended action | Risk if removed | Decision |
|---|---|---|---|---|---|---|---|---|
| REC-01 | Title, description "Fabrik matches every statement line to the books. A person resolves exceptions and approves the final reconciliation." | RL:21 | /reconciliation | G§11 | CORE / description EXTRA | Simplify: remove the description | — | |
| REC-02 | Period tabs; account cards with status, statement/book balance, difference, matched/unmatched/duplicates (+ book-only), "Open workspace"; "Statement not received" state | RL:22-55 | /reconciliation | G§11 (exact display) | CORE | Keep | Breaks G§11 | |
| REC-03 | Workspace header, "View statement", KPI strip (incl. Outstanding items), status and "Approve reconciliation" (**primary**) with confirm | RD:25-29; RW:69-93, 165-172 | /reconciliation/[id] | G§11 "human approves" | CORE | Simplify: shorten the confirm text | Close blocked | |
| REC-04 | Notice "AI-assisted matching — Fabrik matched {n} statement lines… The items below need a person: …" | RW:99-103 | /reconciliation/[id] | G§11 "AI should assist" | SUPPORTING | Simplify: "Fabrik auto-matched N lines" | — | |
| REC-05 | Unmatched statement lines with "Suggested match · NN%" Accept/Reject, and "Record as…" + Record | RW:105-118, 185-202 | /reconciliation/[id] | G§11 | CORE | Simplify: only "Approve reconciliation" stays primary; row buttons become secondary | Difference can't reach $0 | |
| REC-06 | Hint "Looks like a bank-only item — record it in the books" (regex guess) | RW:178, 186 | /reconciliation/[id] | none | EXTRA (unsolicited) | Remove (keep the account pre-selection) | None | |
| REC-07 | Possible duplicates ("Exclude duplicate"), book-only items ("Mark outstanding"), Outstanding items ("Undo"), Matched lines (collapsible) | RW:120-163 | /reconciliation/[id] | G§11 duplicates/matched | CORE / outstanding SUPPORTING | Simplify: drop card subtitles | Difference can't reach $0 | |

---

## 13. Integrations `/integrations`

Files: `src/app/(app)/integrations/page.tsx` (IP), `src/components/integrations/qbo-controls.tsx` (QC), `src/server/services/integrations.ts` (IS).

| ID | Item | File path(s) | Screen/route | PRD/workflow reference | Classification | Recommended action | Risk if removed | Decision |
|---|---|---|---|---|---|---|---|---|
| INT-01 | Description "QuickBooks Online is your system of record. Fabrik syncs from it, works on top of it, and writes approved categorizations back." | IP:46 | /integrations | G§21 | SUPPORTING | Remove | None | |
| INT-02 | QuickBooks card: name, status, "Sync now" (**primary**), "Reconnect", "Disconnect" (confirm) | IP:49-63; QC:16-40 | /integrations | G§4.1 "see connected integrations", G§21 | CORE | Keep | — | |
| INT-03 | Badges "Synthetic sandbox"/"Live" and "A · PRD"; catalog description sentence | IP:57-60 | /integrations | none | EXTRA | Remove "A · PRD" and the sentence; "Synthetic sandbox" in demo mode only | None | |
| INT-04 | Notice "Your QuickBooks connection needs attention" | IP:66-72 | /integrations | G§22 example | CORE | Keep | — | |
| INT-05 | Stats: Company (+ Realm ID), Connected by, Last sync, pending write-backs | IP:77-80 | /integrations | G§21 sync status | CORE / Realm ID EXTRA | Simplify: drop Realm ID | — | |
| INT-06 | Stat "Sync success rate" | IP:80 | /integrations | none on screen (G§27 metric) | EXTRA | Remove | None | |
| INT-07 | Dev strip "Live OAuth is ready — set QBO_CLIENT_ID/SECRET/REDIRECT_URI…" + "Connect live QuickBooks" (looks disabled but works) | IP:95-104 | /integrations | none | EXTRA | Remove from UI | None | |
| INT-08 | "Demo controls" card with "Simulate next sync failure" | IP:108-115; QC:45-56 | /integrations | none (demo of G§21 retry) | EXTRA | See **D5** | Demo of error path lost | |
| INT-09 | "What syncs" list (9 items) and write-back note | IP:118-130 | /integrations | G§21 import list | SUPPORTING | Simplify: collapse to one line | — | |
| INT-10 | "Reliability" card (sync status, retry with backoff, error logging, duplicate prevention, idempotency keys, with explanations) | IP:132-137 | /integrations | G§21 (backend requirements, not UI) | EXTRA | Remove | None | |
| INT-11 | Sync history table | IP:141-191 | /integrations | G§21 sync status, error logging | CORE | Simplify: drop the Attempt and Idempotency key columns | — | |
| INT-12 | "More connectors — Roadmap — not available in the Expo MVP." tiles: **Mercury, Plaid, Ramp, Gusto, Stripe, Xero** ("C · Future", "Phase 2 (proposed)", "Coming later") | IP:194-220; IS:24-29 | /integrations | none (pp. 32–33 commentary; Xero/banking/payroll out of scope E§31) | EXTRA | Remove | None | |
| INT-13 | Footer "QuickBooks Online is the only accounting integration in the Expo MVP (PRD §21). Additional connectors are proposed for Phase 2." | IP:222 | /integrations | none (internal) | EXTRA | Remove | None | |

---

## 14. Settings `/settings` (tabs Team, Profile & security, AI & rules, Bookkeeping, Audit trail)

Files: `src/app/(app)/settings/page.tsx` (SP), `src/components/settings/team.tsx` (ST), `profile.tsx` (SPF), `ai.tsx` (SA).

| ID | Item | File path(s) | Screen/route | PRD/workflow reference | Classification | Recommended action | Risk if removed | Decision |
|---|---|---|---|---|---|---|---|---|
| SET-01 | Title "Team & Settings" and description "{Org} · who has access, how Fabrik's AI behaves, and a full record of what happened." | SP:36 | /settings | E§5 "Settings" | CORE / description EXTRA | Simplify: title "Settings", no description | — | |
| SET-02 | Team: members table (name, email, role, status, two-factor), role change, Remove (confirm) | SP:87-90; ST:31-108 | team | G§4.1 invite users, G§3 | CORE | Keep | — | |
| SET-03 | Invite form (email, name, role, "Send invite" **primary**); subtitle "They'll get an email to set a password. Invitations expire in 7 days." | SP:91-99; ST:113-154 | team | G§4.1 | CORE | Simplify: drop subtitle | — | |
| SET-04 | Role option "External Accountant / CPA" in role pickers | ST:14 | team | none | EXTRA | See **D2** | — | |
| SET-05 | Role help "Business Owners manage… External Accountants get read access to books, reports and tax items." | SP:96 | team | none | EXTRA (text) | Remove | None | |
| SET-06 | Staff read-only notice | SP:84-86 | team | G§26 RBAC | SUPPORTING | Simplify: one line | — | |
| SET-07 | "Your Fabrik team" card (Bookkeeper, Reviewer) | SP:100-117 | team | G§3 roles | SUPPORTING | Keep | — | |
| SET-08 | "Dedicated accountant" row with "B · Proposed" | SP:80, 110 | team | none (Fondo) | EXTRA | Remove row (field stays; it grants staff access, `session.ts:29`) | None | |
| SET-09 | Profile: name, title, "Save profile" (**primary**) | SPF:27-34, 71-75 | profile | G§4.1 basic profile | CORE | Keep | — | |
| SET-10 | Notification switches (email / in-app) with helper lines | SPF:35-51 | profile | G§22 | SUPPORTING | Simplify: drop helper lines | — | |
| SET-11 | "Email digest" Real-time / Daily / Weekly | SPF:52-68 | profile | E§32 P2 "advanced notifications" | EXTRA | Hide behind feature flag | None | |
| SET-12 | Two-factor set up / turn off (QR, key, code); setup button is a second **primary** on the tab; notice "Two-factor is only switched on after the code is verified." | SPF:89-166 | profile | G§4.1 MFA, G§26 | CORE | Simplify: setup button secondary; remove the notice | — | |
| SET-13 | "Need a new password? Send a reset link"; Access card (org, role, last sign-in, session expiry) | SP:139-156 | profile | G§4.1 reset; G§26 session | SUPPORTING | Simplify: Access card org and role only | — | |
| SET-14 | AI & rules: thresholds form (+ "PRD default 98%" hints), 3 duplicate band cards, risk-override notice, "AI provider: …", risk rules list, learned rules list | SP:174-238; SA | ai | E§7 thresholds, G§23, G§25 | CORE / bands, provider, PRD hints EXTRA | Simplify: remove band cards, provider line and "PRD default" hints. Clients see thresholds read-only (Business Owner editing is a §23 deviation, but permissions stay unchanged per your rules; flagged for your decision) | — | |
| SET-15 | Bookkeeping tab: Close frequency (Monthly/Quarterly/Annual) with "B · Proposed" and "…Fondo-inspired option…" | SP:252-265 | bookkeeping | G§23 close schedules (admin) / Fondo | EXTRA | Hide behind feature flag (admin keeps it in /ops/admin). Also removes the quarterly 404 | Quarterly orgs keep their setting | |
| SET-16 | Bookkeeping tab: Accounting setup (basis, fiscal year, plan, legal name, state) | SP:266-279 | bookkeeping | none for clients | EXTRA | Hide behind feature flag (whole tab) | None | |
| SET-17 | Audit trail: search, table (time, actor, action, record, change, AI confidence/model, risk), pager; subtitle "… (PRD §20, §25)." | SP:316-418 | audit | G§20, E§25 | CORE | Simplify: drop "(PRD §20, §25)" | Breaks G§20 visibility | |
| SET-18 | Audit detail "Ns human time" | SP:401 | audit | none | EXTRA | Remove | None | |

---

## 15. Sign-in screens `/login`, `/login/mfa`, `/forgot-password`, `/reset-password`

Files: `src/app/(auth)/layout.tsx` (AL), `src/components/auth/forms.tsx` (AF).

| ID | Item | File path(s) | Screen/route | PRD/workflow reference | Classification | Recommended action | Risk if removed | Decision |
|---|---|---|---|---|---|---|---|---|
| AUTH-01 | Brand side panel: "Books · Funding · CFO", "Know your numbers. Find funding. Make better decisions.", paragraph, 4 feature bullets, footer "QuickBooks Online remains your system of record. Demo data is synthetic." | AL:7-37 | all auth | E§33 positioning (marketing copy) | EXTRA (on a sign-in screen) | Simplify: wordmark and tagline only | None | |
| AUTH-02 | "Sign in", email, password, "Sign in" (**primary**), "Forgot password?" | AF:31-48 | /login | G§4.1 | CORE | Keep | — | |
| AUTH-03 | Tagline "Welcome back to your AI finance department." and "MFA supported" label | AF:32, 49 | /login | none | EXTRA | Remove | None | |
| AUTH-04 | "Expo demo accounts" picker (6 personas incl. **Linda Park, CPA**) and shared password | AF:52-75 | /login | E§28/E§34 demo (helper) | SUPPORTING (demo) | See **D5**; drop the CPA persona per **D2** | Slower demos | |
| AUTH-05 | MFA challenge (code, "Verify and continue", "Use a different account") | AF:84-103 | /login/mfa | G§4.1 MFA | CORE | Keep | — | |
| AUTH-06 | Demo notice with the current MFA code | AF:98-102 | /login/mfa | none (demo) | SUPPORTING (demo) | See **D5** | Admin demo login harder | |
| AUTH-07 | Forgot / reset password forms and messages | AF:110-155 | /forgot-password, /reset-password | G§4.1 | CORE | Keep | — | |
| AUTH-08 | "Demo: emails are delivered to the development outbox (Operations → Admin)." (**not gated, shows in production**) | AF:115 | /forgot-password | none | EXTRA | Hide behind feature flag (demo mode) | None | |

---

## 16. Operations dashboard `/ops`

File: `src/app/(app)/ops/page.tsx` (O).

| ID | Item | File path(s) | Screen/route | PRD/workflow reference | Classification | Recommended action | Risk if removed | Decision |
|---|---|---|---|---|---|---|---|---|
| OPS-01 | Eyebrow "Operations Portal", title "Fabrik Operations", description "Exceptions across N active clients · {date}. Automation handles the routine — your team handles what needs judgment." | O:36-38 | /ops | G§16, E§24 | CORE / eyebrow, description EXTRA | Simplify: title only | e2e asserts the title | |
| OPS-02 | Header buttons "Work queue", "AI review queue →" (**primary**) | O:41-44 | /ops | none (duplicate nav) | EXTRA | Remove | None | |
| OPS-03 | KPIs Active clients, Books current, Needs attention, At risk, AI processed, Human reviewed, Client questions, Automation rate | O:51-58 | /ops | G§16, E§24 (exact) | CORE | Simplify: drop hints ("on Fabrik", "needs a plan this week", "target > 80%") | Breaks G§16 | |
| OPS-04 | "North Star" card: Human minutes per client per month, per 100 transactions | O:61-73 | /ops | G§27 / E§30 north star (no screen named) | CORE metric / placement unspecified | Simplify: fold into the KPI row as one stat | e2e asserts this text; metric has no other home | |
| OPS-05 | KPI drill-down links to /ops/clients?health=… | O:51-54 | /ops | none | SUPPORTING | Keep | — | |
| OPS-06 | 3-month trend bar chart ("Lower is better") | O:74-88 | /ops | none | EXTRA (decorative) | Remove | None | |
| OPS-07 | "Critical metrics vs targets" table (7 metrics, On target/Miss) | O:94-123 | /ops | G§27 / E§30 ("deserves its own analytics layer") | SUPPORTING (metrics) / placement EXTRA | Hide behind feature flag | §27 metrics lose their only surface | |
| OPS-08 | "Top of the work queue" (5 rows) | O:125-149 | /ops | none (duplicates /ops/queue) | EXTRA | Remove | None | |
| OPS-09 | "Clients at a glance" table and footer | O:152-198 | /ops | none (duplicates /ops/clients) | EXTRA | Remove | None | |

## 17. Work Queue `/ops/queue`

Files: `src/app/(app)/ops/queue/page.tsx` (Q), `src/components/ops/queue-controls.tsx`.

| ID | Item | File path(s) | Screen/route | PRD/workflow reference | Classification | Recommended action | Risk if removed | Decision |
|---|---|---|---|---|---|---|---|---|
| Q-01 | Title; eyebrow; description "Everything that needs a person, across every client you serve — generated from live books, reconciliations, close and integrations." | Q:63-65 | /ops/queue | G§17 | CORE / eyebrow, description EXTRA | Simplify: title only | — | |
| Q-02 | Badges "N active", priority tallies, "N items assigned to you" | Q:66-75 | /ops/queue | none | EXTRA | Remove | None | |
| Q-03 | Filters Client, Bookkeeper, Task type, Priority, Month, Status; Clear | Q:51-56 | /ops/queue | G§17 (exact) | CORE | Keep | — | |
| Q-04 | Columns Priority, Client, Task, Type, Age, Assigned (reassign for reviewer/admin), Status | Q:89-134 | /ops/queue | G§17, E§24 (exact) | CORE | Keep | — | |
| Q-05 | Column "Update" (status select) | Q:96, 135-137 | /ops/queue | none | SUPPORTING | Simplify: merge into Status | Items can't be marked done | |
| Q-06 | Sub-labels "Active workspace", "{Month} · auto-generated/manual" | Q:108, 118 | /ops/queue | none | EXTRA | Simplify: month only | None | |
| Q-07 | Footer "N items shown · Sorted by priority, then oldest first · Reassignment is available to reviewers and admins"; empty-state second sentence | Q:84, 144-148 | /ops/queue | none | EXTRA (text) | Remove | None | |

## 18. AI Review Queue `/ops/review`

Files: `src/app/(app)/ops/review/page.tsx` (R), `src/components/ops/review-queue.tsx` (RQ).

| ID | Item | File path(s) | Screen/route | PRD/workflow reference | Classification | Recommended action | Risk if removed | Decision |
|---|---|---|---|---|---|---|---|---|
| REV-01 | Client name title, "N items need review" badge, client picker, auto-switch for deep links | R:30-36, 71-75 | /ops/review | G§18 "ACME HOLDINGS — 27 ITEMS NEED REVIEW" | CORE | Keep | Work-queue links open the wrong client | |
| REV-02 | Description "Only transactions the AI is unsure about, or that a risk rule flagged, reach people. Approve in one keystroke; corrections teach Fabrik." | R:74 | /ops/review | none | EXTRA (text) | Remove | None | |
| REV-03 | Side card "This client's AI policy" (thresholds, large txn, automation 30d) | R:85-101 | /ops/review | G§23 (admin config, not review) | EXTRA | Remove | None | |
| REV-04 | Risk banner "Risk rules override confidence. N items here were held by a risk rule…" | R:102-107 | /ops/review | none (per-card chips already show it) | EXTRA | Remove | None | |
| REV-05 | Side card "Keyboard" and inline key hints (J/K/A/C/Q/E/X) | R:111-121; RQ:286-290 | /ops/review | none | EXTRA | Remove | None | |
| REV-06 | Keyboard shortcut handler | RQ:110-136 | /ops/review | none | EXTRA | Hide behind feature flag | Power users slower | |
| REV-07 | Card: vendor, date, amount, AI recommendation, Confidence, Reason, risk-rule chips, "Escalated"/"Client input suggested" badges | RQ:226-270 | /ops/review | G§18, E§24 | CORE | Simplify: drop the raw bank text and bank account from the meta line | Breaks G§18 | |
| REV-08 | Actions Approve (**primary**, on every card), Change, Ask client, Escalate | RQ:274-285 | /ops/review | G§18, E§24 | CORE | Simplify: Approve primary only on the focused card | Breaks G§18 | |
| REV-09 | Change panel (account select with AI alternatives, comment, "Approve with change") and helper "Fabrik learns from corrections and may apply this to similar pending transactions." | RQ:316-359 | /ops/review | G§18 CHANGE | CORE / helper EXTRA | Simplify: remove helper | — | |
| REV-10 | Ask-client panel (AI-drafted question, "Send to client") and helper "The client answers with one tap; their answer returns to processing." | RQ:364-391 | /ops/review | G§19 | CORE / helper EXTRA | Simplify: remove helper | Breaks G§19 | |
| REV-11 | Escalate panel (note, Escalate) | RQ:397-419 | /ops/review | E§24 Escalate | CORE | Simplify: drop placeholder example | — | |
| REV-12 | Select all, "N selected", bulk bar "Approve N as suggested" | RQ:151-153, 189-199 | /ops/review | G§18 bulk approval | CORE | Simplify: drop "Highest risk and lowest confidence first" and the "i / N" counter | Breaks bulk approval | |
| REV-13 | Empty state "Queue clear — automation is handling everything for this client" + second sentence | RQ:138-144 | /ops/review | none | SUPPORTING | Simplify: "Queue clear" | — | |
| REV-14 | Hidden handling timer (records human seconds) | RQ:59, 92, 104 | /ops/review | G§27 human minutes | SUPPORTING | Keep | North Star metric goes to 0 | |

## 19. Clients `/ops/clients`

File: `src/app/(app)/ops/clients/page.tsx` (C), `src/components/ops/org-nav.tsx`.

| ID | Item | File path(s) | Screen/route | PRD/workflow reference | Classification | Recommended action | Risk if removed | Decision |
|---|---|---|---|---|---|---|---|---|
| CLI-01 | Screen as a whole (title, health tabs, client table, "Review queue" / "Open workspace") | C:35-101; org-nav.tsx:46-51 | /ops/clients | G§29 #18 "Client Workspace" (entry), G§16 health | SUPPORTING | Keep | Ops KPI links break; no ops entry into a client | |
| CLI-02 | Description "Every client you serve, at-risk first. Open a workspace to work inside a client's books, or jump straight to its review queue." | C:35 | /ops/clients | none | EXTRA (text) | Remove | None | |
| CLI-03 | Industry · state line, plan badge, close progress bar, Automation % column, Questions column | C:74-75, 93, 96-97 | /ops/clients | none | EXTRA | Remove (Questions: Hide behind feature flag) | None | |
| CLI-04 | Health reasons list | C:80-86 | /ops/clients | none | SUPPORTING | Simplify: first reason only | — | |
| CLI-05 | Footer "Not shown: … Onboarding and paused clients don't count toward portfolio metrics." | C:113 | /ops/clients | none | EXTRA | Remove | None | |

## 20. Administration `/ops/admin`

Files: `src/app/(app)/ops/admin/page.tsx` (A), `src/components/ops/admin-panels.tsx` (AP2).

| ID | Item | File path(s) | Screen/route | PRD/workflow reference | Classification | Recommended action | Risk if removed | Decision |
|---|---|---|---|---|---|---|---|---|
| ADM-01 | Title; eyebrow; "Fabrik Admin" badge; description "Organizations, staff access, risk policy and the demo environment. Every change here is written to the audit trail." | A:26-29 | /ops/admin | G§23 | CORE / rest EXTRA | Simplify: title only | — | |
| ADM-02 | Header link and bottom card "Requirements traceability" | A:30-34, 187-196 | /ops/admin | none | EXTRA | Remove (with REQ-*) | None | |
| ADM-03 | Stat tiles Organizations, Fabrik staff, Client users, Active sessions | A:37-49 | /ops/admin | none | EXTRA | Remove | None | |
| ADM-04 | Organizations table: Plan, Status, Bookkeeper, Reviewer, Close frequency | A:51-83 | /ops/admin | G§23 plans, account status, bookkeepers, reviewer assignment, close schedules | CORE | Simplify: drop the "N users · N transactions" line and the subtitle | Breaks assignment | |
| ADM-05 | Organizations: "Dedicated accountant" select | A:82 | /ops/admin | none | EXTRA | Hide behind feature flag (field grants access) | — | |
| ADM-06 | Fabrik staff table: name, email, role select (incl. Disabled) | A:92-118 | /ops/admin | G§23 users, roles | CORE | Simplify: drop job title and subtitle | — | |
| ADM-07 | Staff MFA and Last sign-in columns | A:119-120 | /ops/admin | none | EXTRA | Remove | None | |
| ADM-08 | Risk rules toggles with descriptions | A:128-145 | /ops/admin | G§23 risk rules, G§9 | CORE | Simplify: drop the "weight N" badges; banner to one line | — | |
| ADM-09 | "Development email outbox" | A:153-175 | /ops/admin | none (dev tool) | EXTRA | See **D5** (invite/reset links are only visible here in the demo) | Invites and resets unusable in demo | |
| ADM-10 | "Demo environment" card and "Reset demo data" | A:178-186; AP2:151-181 | /ops/admin | E§28 stable demo (indirect) | SUPPORTING (demo) | See **D5** | Only in-app demo reset | |

## 21. Requirements `/ops/requirements`

| ID | Item | File path(s) | Screen/route | PRD/workflow reference | Classification | Recommended action | Risk if removed | Decision |
|---|---|---|---|---|---|---|---|---|
| REQ-01 | Entire page: requirements matrix, stat tiles, class/status/area filters, "Documented conflicts" | `src/app/(app)/ops/requirements/page.tsx` | /ops/requirements | none (the PRD asks the team for a planning matrix, not an in-app page) | EXTRA | Hide behind feature flag (keep `src/content/requirements.ts`, which `npm run docs:requirements` uses) | None | |
| REQ-02 | `ClassBadge` component (A · PRD / B · Proposed / C · Future) used across client screens | `src/components/ui/primitives.tsx:181-190` and usages in INT-03, CLOSE-10, SET-08, SET-15, TAX | many | none | EXTRA | Remove from all client-facing screens | None | |

## 22. Tax & Credits `/tax`

Files: `src/app/(app)/tax/page.tsx`, `src/components/tax/tax-requests.tsx`, `rd-screener.tsx`; services `taxWorkspace`/`rdScreener` in `src/server/services/admin.ts`; actions `taxRequestStatus`, `rdScreen` in `src/app/actions/app.ts:340-350`.

| ID | Item | File path(s) | Screen/route | PRD/workflow reference | Classification | Recommended action | Risk if removed | Decision |
|---|---|---|---|---|---|---|---|---|
| TAX-01 | Entire screen: header with "B · Proposed"; notice "Preview — proposed addition inspired by Fondo… Tax filing and R&D credits are outside the Expo MVP scope."; readiness ring; next deadline; documents outstanding; CPA on file | tax/page.tsx:61-116 | /tax | G§28 "Tax filing", "R&D tax credits" out of scope; E§31 | EXTRA | Hide behind feature flag (whole route), or Remove | None; nothing in the workflow depends on it | |
| TAX-02 | Tax calendar | tax/page.tsx:120-158 | /tax | out of scope | EXTRA | as TAX-01 | None | |
| TAX-03 | Document collection & approvals (requests table, advance modal, "Approve for filing") | tax/page.tsx:162-173; tax-requests.tsx | /tax | out of scope | EXTRA | as TAX-01 | None | |
| TAX-04 | R&D tax credit screener ("C · Future") | tax/page.tsx:176-189; rd-screener.tsx | /tax | explicitly out of scope | EXTRA | Remove | None | |
| TAX-05 | Global search entry "Tax & Credits" | `src/server/services/admin.ts:201` | search | none | EXTRA | Remove (with NAV-17/TAX-01) | None | |

---

## 23. User roles and personas

| Role (code) | Seeded user | PRD defines it? | Where | Recommendation | Decision |
|---|---|---|---|---|---|
| Business Owner (`business_owner`) | Dan Smith | Yes, G§3 "Customer administrator" | permissions.ts:88 | Keep | |
| Client Finance User (`client_finance_user`) | Karen Smith | Yes, G§3 | permissions.ts:99 | Keep | |
| Fabrik Bookkeeper (`fabrik_bookkeeper`) | Sarah Chen, Tom Alvarez, Jess Kim | Yes, G§3 | permissions.ts:101 | Keep | |
| Fabrik Reviewer (`fabrik_reviewer`) | Marcus Reed, Elena Rossi | Yes, G§3 | permissions.ts:102 | Keep | |
| Fabrik Admin (`fabrik_admin`) | Priya Nair (MFA on) | Yes, G§3 | permissions.ts:103 | Keep | |
| **External Accountant / CPA** (`external_accountant`) | Linda Park | **No.** E§3 only says the farmer "uses external accountant/CPA" (a profile trait, not a role) | permissions.ts:100, 113; team.tsx:14; layout.tsx:17; settings SP:96; login picker | See **D2**. Has its own nav variant (no Bills/Collect/Funding/CFO) | |
| Personas E§3 (farmer; landowners, investors, farm management companies…) | n/a | Market personas, not system roles | — | No change | |

Related deviations, flagged but not proposed for change because your rules say role permissions stay as they are:
- The Business Owner can edit AI thresholds (G§23 lists them under Fabrik Admin).
- Every client role can press "Sync now".

---

## 24. Seed and demo data not needed to demonstrate the workflow

Files: `src/server/db/seed/*`, `src/content/*`.

| ID | Seed item | File | Needed for | Classification | Recommendation | Decision |
|---|---|---|---|---|---|---|
| SEED-01 | Smith Family Farms ledger, vendors, customers, invoices, bills, receipts, equipment purchases, seasonal expenses, reports | smith.ts, process.ts | E§28 demo company (exact list), Flow 1–6 | CORE | Keep | |
| SEED-02 | 6 inbox items (2 transactions, 1 bill approval, 1 missing document, 1 funding question, 1 overdue invoice) and 3 resolved history items | smith-workflow.ts:142-239 | E§23 example (exact), G§19 | CORE / history SUPPORTING | Keep | |
| SEED-03 | 12 funding programs (`funding-programs.json`, `funding.ts`) | src/content | E§14 database, Flow 5 | CORE | Keep | |
| SEED-04 | Farm profile | smith-workflow.ts:312-370 | E§13 | CORE | Keep | |
| SEED-05 | Entity documents (Articles of Organization, Operating Agreement), equipment list | smith-workflow.ts:130-134 | E§16 "Documents available", E§17 readiness | SUPPORTING | Keep | |
| SEED-06 | Tax documents `2025_Form_1065_Smith_Family_Farms.pdf`, `2025_CCC-1099-G_USDA.pdf` (uploaded by Linda/Karen; the 1065's `funding:tax-return` tag is not read anywhere) | smith-workflow.ts:132-133 | Tax & Credits only | EXTRA | Remove with TAX-* (or leave if TAX is hidden) | |
| SEED-07 | Tax deadlines and tax document requests | smith-workflow.ts:374-389 | /tax only | EXTRA | Remove with TAX-* (or leave dormant if hidden) | |
| SEED-08 | Funding "watch" (ARC/PLC "preparing" + note) | smith-workflow.ts:372 | FUND-08 only | EXTRA | Remove with FUND-08 | |
| SEED-09 | User Linda Park (CPA) and her membership | people.ts:23, 56 | External Accountant role only | EXTRA | Per **D2** | |
| SEED-10 | 24 portfolio client orgs (Acme, LandCo, FarmCo, ABC, …) with transactions, reconciliations, health states | portfolio.ts:34-57 | Ops dashboard "Active clients 25 / 19 / 4 / 2" (E§24 example) and Work Queue examples (G§17 names Acme, LandCo, FarmCo, ABC) | SUPPORTING | Keep | |
| SEED-11 | Extra staff Tom Alvarez, Jess Kim, Elena Rossi | people.ts:27-29 | Portfolio assignment, Bookkeeper filter (G§17) | SUPPORTING | Keep | |
| SEED-12 | FarmCo "catch-up" backlog (`catchUp` field) | portfolio.ts:130 | CLOSE-10 card only (FarmCo's at-risk status comes from its health setting) | EXTRA | Remove the field with CLOSE-10 | |
| SEED-13 | Quarterly close for Blue Stem Land Trust and Loess Hills Land | portfolio.ts:121 | SET-15 / CLOSE-03 only; causes the package 404 | EXTRA | Set to monthly | |
| SEED-14 | Dedicated accountant assignment (`dedicatedAccountantId`) | seed/index.ts:72 | HOME-15, SET-08 (also grants staff access) | EXTRA (display) | Keep the field and hide the UI (ADM-05, SET-08) | |
| SEED-15 | Dev outbox emails (2) | seed/index.ts:93-96 | ADM-09 only | EXTRA | Per **D5** | |
| SEED-16 | Notifications (inbox, September close, funding matches, August books ready) | smith-workflow.ts:391-397 | G§22 examples | SUPPORTING | Keep | |
| SEED-17 | QBO connection and sync runs incl. one failed-then-retried run | smith-workflow.ts:300-310 | G§21 sync status/retry | SUPPORTING | Keep | |
| SEED-18 | Learned rules and the SP Digital correction audit sequence | smith-workflow.ts:13-68 | G§20 example (exact), G§25 | CORE | Keep | |
| SEED-19 | Close periods (closed/in review/open) and Chase/credit-card reconciliations | smith-workflow.ts:241-296 | G§14, G§11 (exact Chase ••••1245 example) | CORE | Keep | |

---

## 25. Screens with more than one primary action or excessive text

| Screen | Primary actions visible at once | Excessive text | Recommendation |
|---|---|---|---|
| Home | **2**: "Ask Fabrik" and "Review" (plus "Send" in the team modal) | Banner tagline; chart subtitle; brief subtitle; funding disclaimer; team-card paragraph; footer sentence | One primary: "Review" (HOME-04, 05, 09, 10, 14–17) |
| Finance Inbox | One per open card (5–6 on screen) | Page description; footnote; bill helper; drop-zone sentence; empty-state line | Acceptable per card; trim text (INB-02, 04, 07, 09, 10) |
| Books (drawer) | **2** while Ask-client is open | Page description; Rules intro; report footer; "will learn" sentence; threshold line | BOOK-02, 04, 18, 21, 22, 30 |
| Bills | One "Approve" per row | Description; "No payments…" notice; empty-state line | Make row Approve secondary (BILL-02, 08, 10) |
| Collect | 1 at a time | Description; drawer paragraph; demo notice; "Human approval required" notice | COL-02, 08, 13, 15 |
| Documents | **2**: "Choose files" and AI-filled "Sample John Deere invoice"; drawer: one "Match" per candidate plus "Save & match" | Description; drop-zone helper; storage caption; "in this release" notice; create-bill sentence; model footnote | DOC-01, 02, 04, 10, 13, 17, 18 |
| Funding | 0–1 | Description; profile hint; disclaimer; verification notes; profile hints | FUND-02, 04, 05, 16, 21 |
| CFO | 0–1 | Tagline; ratio formula notes; slider helper; table and assumption subtitles; DSCR lender note | CFO-01, 06, 08, 11, 12, 16 |
| Ask Fabrik | 1 | Empty-state paragraph; composer disclaimer; "How Ask Fabrik answers" card; "Wording by…" | ASK-02, 09, 10, 11 |
| Monthly Close | 1 | Description; checklist subtitle; catch-up paragraph; schedule notice | CLOSE-02, 08, 10, 11 |
| Finance Package | 1 | Draft notice duplicating the pill; summary subtitle | PKG-02, 03 |
| Reconciliation workspace | **Many**: Approve plus Accept / Record / Exclude duplicate per row | AI notice; card subtitles; confirm text | REC-04, 05, 07 |
| Integrations | 1 | Description; catalog sentence; Reliability card; dev strip; demo copy; roadmap; footer | INT-01, 03, 07, 08, 10, 12, 13 |
| Settings → Profile | **2** when MFA is off: "Save profile" and "Set up two-factor" | MFA explainer and notice; notification helpers | SET-10, 12 |
| Settings (other tabs) | 1 | Page description; role help; invite subtitle; "PRD default" hints; Fondo paragraph; "(PRD §20, §25)" | SET-01, 03, 05, 14, 15, 17 |
| Sign-in | 1 | Marketing side panel; tagline; un-gated outbox note | AUTH-01, 03, 08 |
| Ops dashboard | 1 (duplicate nav button) | Description; KPI hints; card subtitles; "Lower is better" | OPS-01–03, 06–09 |
| Work Queue | 0 | Description; footer lines; sub-labels | Q-01, 02, 06, 07 |
| AI Review Queue | **Many**: Approve on every card, plus bulk "Approve N", plus panel primaries | Description; risk banner; keyboard card; panel helpers; empty-state line | REV-02–06, 08–10, 12, 13 |
| Clients | 0 | Description; footer; reasons list | CLI-02, 04, 05 |
| Administration | 0 | Description; card subtitles; risk banner; demo paragraph | ADM-01, 03, 08 |
| Tax & Credits | **2+** | Nearly all text | TAX-* |

---

## 26. Other things found during the audit

These are defects and gaps, not scope cuts. They're listed so Phase 2 doesn't make them worse. Fixing them would be new work, so it needs your go-ahead.

1. **Quarterly-close 404.** Quarterly orgs link to `/close/YYYY-Qn/package`, which returns 404. Fixed as a side effect of SEED-13 / SET-15.
2. **Hard-coded farm-profile line in the Flow 6 answer** (ASK-15).
3. **Funding readiness can't be completed from the UI.** "Entity information" and "Additional certification" need `funding:*` document tags that no upload control sets (`src/app/actions/app.ts:135`).
4. **Bills has no upload entry point.** E§10 says bills may come from document upload. Today that is only possible through Documents → "Create bill" (DOC-17).
5. **Inbox vendor/customer clarification types** have no dedicated UI. They fall back to a generic text answer.
6. **No lint script exists** in `package.json`. Phase 3 can run the build, `tsc` and tests, but not lint, unless you want ESLint added.
7. **e2e coupling.** `tests/e2e/expo-demo.spec.ts` asserts "Fabrik Operations", "Human minutes per client per month" and "Fabrik staff only", and clicks the demo persona buttons. Phase 2 updates the tests together with any approved change.

## Counts (current state, for the before/after summary)

| | Count |
|---|---|
| Page routes (`page.tsx`, excluding API) | 28 (24 in the app, 4 sign-in) |
| Client nav items (Business Owner) | 14. E§5 lists 11; the extra 3 are Reconciliation, Monthly Close and Tax & Credits |
| Staff nav items | 6. G§29 names 3 Ops screens; the extra 3 are Clients, Administration and Requirements |
| React component files (`src/components/**/*.tsx`) | 34 |
| Audited items (sections 1–22) | **297**: CORE 143 · SUPPORTING 50 · EXTRA 104 |
| Recommended actions | Keep 87 · Simplify 108 · Hide behind feature flag 20 · Remove 70 · pending a decision (D1–D5) 12 |
| Seed items (section 24) | 19 |
