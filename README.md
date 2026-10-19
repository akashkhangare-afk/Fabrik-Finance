# Fabrik Finance

**AI Finance for Land & Agriculture** — *Know your numbers. Find funding. Make better decisions.*

Fabrik Finance is an AI-first bookkeeping and financial-intelligence platform for agricultural and land-related businesses. QuickBooks Online stays the system of record; Fabrik adds the AI bookkeeping workflow, document intelligence, a 13-week cash forecast and scenarios, government-funding discovery, and a conversational finance assistant — plus an internal Operations Portal where Fabrik's accountants manage exceptions across many clients.

This repository contains a working web application built from `Fabrik Finance PRD.pdf` (with the Expo MVP section governing the first release), extended with clearly-labelled Fondo-inspired additions from `Fondo vs Fabrik Finance PRD Missing Features Analysis.pdf`.

---

## Quick start

Requirements: **Node.js 22.6+** (developed on Node 24). No database or external services are needed for the demo.

```bash
npm install
npm run dev            # http://localhost:3000
```

The first start seeds the permanent demo organization, **Smith Family Farms LLC** (Story County, Iowa · corn & soybeans · 2,400 acres). All data is synthetic.

Sign in with any demo persona — the login page lists them. Password for all: `FabrikDemo!2026`.

| Persona | Email | What to show |
|---|---|---|
| Business owner | `dan@smithfamilyfarms.example` | Home, Inbox, Funding, CFO, Ask Fabrik |
| Client finance user | `karen@smithfamilyfarms.example` | Documents, Bills, Collect |
| Fabrik bookkeeper | `sarah.chen@fabrik.example` | AI Review Queue, Reconciliation |
| Fabrik reviewer | `marcus.reed@fabrik.example` | Close approval, Work Queue |
| Fabrik admin (MFA) | `priya.nair@fabrik.example` | Administration |

Priya has MFA enabled with a published test secret; in demo mode the MFA screen shows the current code. The **Expo walkthrough** is in [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md).

### Useful scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build && npm start` | Production build and server (requires `SESSION_SECRET`, `ENCRYPTION_KEY`, or `FABRIK_DEMO_MODE=true`) |
| `npm test` | 45 unit/integration tests — engines, workflows, Ask Fabrik routing, RBAC, tenant isolation, crypto |
| `npm run test:e2e` | Browser test of the full Expo demo flow (Playwright, isolated datastore on port 3100) |
| `npm run typecheck` | TypeScript |
| `npm run db:reset` | Delete the local datastore; the next start reseeds the demo |
| `npm run docs:requirements` | Regenerate `docs/REQUIREMENTS_MATRIX.md` |

Admins can also restore the demo from **Operations → Administration → Reset demo data**.

### Configuration

Copy `.env.example` to `.env.local`. Everything is optional for the demo:

- `SESSION_SECRET`, `ENCRYPTION_KEY` — **required in production** (session signing; AES-256-GCM encryption of OAuth tokens and MFA secrets).
- `SHOW_EXTRAS` — set to `true` to show screens and widgets beyond the PRD that were hidden in the minimal-UX cleanup (Tax & Credits, the requirements matrix, forecast controls, keyboard shortcuts, …). See [`docs/cleanup-summary.md`](docs/cleanup-summary.md).
- `FABRIK_CLOCK` — anchors "today" (default `2026-10-16`) so the seeded story is stable. Set empty for real time.
- `QBO_CLIENT_ID` / `QBO_CLIENT_SECRET` / `QBO_REDIRECT_URI` — enables the live QuickBooks Online OAuth adapter.
- `FABRIKIDP_URL` / `FABRIKIDP_API_KEY` — routes document extraction to FabrikIDP (images need it; text PDFs work locally).
- `ANTHROPIC_API_KEY` — optional: Ask Fabrik answers are computed deterministically; an LLM (default `claude-opus-5-5`) may only rephrase them, and any rephrasing that introduces a new number is discarded.

---

## What's in the product

**Client portal** (role-aware navigation):

- **Overview** — Home dashboard (PRD KPIs, revenue-vs-expenses trend, AI Finance Brief, books status, "Fabrik needs your help"), Finance Inbox.
- **Finance** — Books (AI-categorized transactions, explainable detail, P&L / Balance Sheet / Cash Flow with PDF & Excel export), Monthly Close + Finance Package, Bills Lite, Collect Lite. Reconciliation is in the navigation for Fabrik staff.
- **Intelligence** — Funding (profile, 12 researched programs, explainable matching, readiness), CFO (dashboard, 13-week forecast, scenarios), Ask Fabrik.
- **Documents** — FabrikIDP upload → extraction → transaction matching.
- **Manage** — Integrations (QuickBooks connection and sync history), Settings (team, profile & MFA, AI thresholds and rules, audit trail).

**Operations Portal** (Fabrik staff only): portfolio dashboard with the north-star *human minutes per client per month*, auto-generated global work queue, AI Review Queue with bulk approve, clients list and administration.

## Requirements traceability

- [`docs/REQUIREMENTS_MATRIX.md`](docs/REQUIREMENTS_MATRIX.md) — 89 requirements with source page, persona, screen, data, dependencies, acceptance criteria, priority, status and classification (**A** PRD-confirmed · **B** proposed Fondo-inspired · **C** future/restricted). Also rendered in-app at `/ops/requirements` when `SHOW_EXTRAS=true`.
- [`docs/cleanup-audit.md`](docs/cleanup-audit.md) and [`docs/cleanup-summary.md`](docs/cleanup-summary.md) — the PRD scope audit and what the minimal-UX cleanup removed, hid or simplified.
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — conflicts between sources and how they were resolved, plus technical decisions and known limitations.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — layers, AI agents, data model, integrations, production path.
- [`docs/SECURITY.md`](docs/SECURITY.md) — controls implemented and what deployment must add.

## Important limitations (read before demoing to customers)

- Demo data is **synthetic**. Funding programs are real and sourced from official pages (verified 2026-10-16); four were verified against federal regulations on eCFR because agency sites blocked automated access — Fabrik staff see each program's verification note. Fabrik never states that a business qualifies.
- The QuickBooks integration in the demo is a **synthetic sandbox** that behaves like QBO (reports, sync runs, write-back, failures). The live OAuth/API adapter is implemented but has not been exercised against a real Intuit sandbox.
- The datastore is a local JSON file standing in for PostgreSQL (see `db/schema.sql` and `docs/DECISIONS.md`). It is single-process and not intended for production.
- Tax & Credits (behind `SHOW_EXTRAS`) is a **preview of a proposed module**: it tracks deadlines, documents and approvals; it does not prepare, calculate or file anything.
