# Expo demo script — Smith Family Farms (5–10 minutes)

Story (PRD Expo §2): *Connect your accounting system → Fabrik understands your business → AI explains your finances → Fabrik forecasts your cash → Fabrik identifies potential funding → you can ask Fabrik financial questions.*

Before you start: `npm run dev`, or reset the demo from **Operations → Administration → Reset demo data** (signed in as Priya). Sign in as **Dan Smith** (`dan@smithfamilyfarms.example` / `FabrikDemo!2026`) — or click *Dan Smith* on the login page.

### 1 · Home (1 min)
- "Smith Family Farms — 2,400 acres of corn and soybeans in Story County, Iowa. QuickBooks is connected; Fabrik keeps the books current."
- Point at **Cash $482K · Revenue $3.8M · Expenses $3.18M · Net income $620K · Receivables $310K · Upcoming bills $184K**.
- Read the **Fabrik Finance Brief** — revenue +8.4% YTD, $82K of receivables over 30 days, cash sufficient for 13 weeks, funding programs identified. Each line links to the data.
- "Fabrik only interrupts Dan when it genuinely needs him" → the **6 items** banner.

### 2 · Books (1 min)
- Open **Books**. Search "Deere" → *Equipment / Machinery*; "Pioneer" → *Seed*; "Casey's" → *Fuel & Oil*.
- Click a row: AI recommendation, confidence, the reason ("…11 of the previous 12"), supporting document, and the audit trail.
- Status tabs: most transactions are *Processed* automatically; a handful *Need review*.

### 3 · Document AI (1 min)
- Open **Documents** → **Sample John Deere invoice**. FabrikIDP extracts *JD-28712*, dates, line items and *$14,820.00*.
- "Possible transaction: JOHN DEERE FINANCIAL $14,820 — match confidence 99%." Click **Match** → the invoice clears the review flag and the transaction finalizes; the Inbox request disappears.

### 4 · CFO (1–2 min)
- Open **CFO → 13-week cash forecast**: known amounts solid, estimated hatched; expand a week to see each bill, payroll run and collection with its source; adjust *seasonal sales*.
- Click **Ask Fabrik** (bottom right): *"Can we afford to purchase another $1 million of farmland?"* → verdict, cash low point, debt-to-assets and debt-service coverage, assumptions. **Open this scenario in CFO** to adjust down payment or rate.

### 5 · Funding (1–2 min)
- Open **Funding**: programs identified, by match level, each linked to an official source with a verification date.
- Open **Agriculture Risk Coverage (ARC) & Price Loss Coverage**: *Why Fabrik identified this*, *Information required* (base acres), *Documents available*, **71% ready**. Emphasize: potential matches only — the agency confirms eligibility; Fabrik doesn't submit applications.

### 6 · Ask Fabrik — the wow moment (1 min)
- *"What government programs could potentially help Smith Family Farms expand?"*
- Then: *"What documents do we already have for these applications?"* — Fabrik answers from **Funding + Books + Documents**, with readiness per program.

### Optional · Behind the scenes (Operations Portal)
Sign in as **Sarah Chen** (bookkeeper) → **AI Review Queue**: uncertain items only, approve with **A**, change with **C**, ask the client with **Q**, bulk approve. Sign in as **Marcus Reed** → **Reconciliation → Chase ••••1245 (September)**: record the bank fees, exclude the duplicate MidAmerican charge, mark the outstanding check → difference $0 → approve → **Monthly Close → Approve & close books** → the **Finance Package** is generated. The **Operations** dashboard shows the north star: *human minutes per client per month*.

Talking points: QuickBooks stays the ledger · AI does routine work, people handle exceptions · every number is traceable · funding sources are official and matches are never promises · Ask Fabrik is read-only.
