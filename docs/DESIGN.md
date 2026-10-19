# Fabrik Finance — User Interface Design

> **Last updated:** 2026-10-19 · matches the theme on `main` (introduced on `design/twisty-theme`)
> **Keep this file current.** If you change a token in `src/app/globals.css` or a shared component in `src/components/ui/`, update this file in the same commit. Screen-by-screen behaviour lives in [WORKFLOW.md](WORKFLOW.md); this file covers how things look and why.

This is the design system for the Fabrik Finance prototype: its colours, type, shapes, components and patterns. It is written for anyone building or reviewing a screen.

---

## 1. Principles

1. **Calm canvas, clear focus.** A cool grey canvas with white cards. Colour is reserved for meaning: navy for "this is selected / do this", orange-red for "this needs you", blue for "AI wrote this".
2. **One primary action per view.** Navy pill buttons are rare; most actions are white outlined pills.
3. **Numbers are the hero.** Large, light-weight figures (`font-normal`, tight tracking) with small muted labels above.
4. **Soft, round, quiet.** 24px cards, pill-shaped controls, near-invisible borders, shadows that only appear on hover or for overlays.
5. **Never colour alone.** Every status has a text label, every chart series has a legend, and estimated values also use hatching.
6. **Behaviour never depends on the theme.** Changing tokens must not change routes, workflows or permissions.

---

## 2. Colour

All colours are Tailwind 4 theme tokens in `src/app/globals.css` (`@theme`), used as classes such as `bg-canvas`, `text-ink`, `ring-ai-100`. Don't hard-code hex values in components. The exceptions are third-party marks (the QuickBooks logo) and chart SVG fills via `SERIES` in `src/components/charts.tsx`.

### Surfaces and text

| Token | Hex | Use |
|---|---|---|
| `canvas` | `#e8eaee` | Page background, sidebar, header |
| `surface` | `#ffffff` | Cards, dialogs, inputs |
| `surface-2` | `#f5f6f8` | Secondary panels inside cards |
| `sunken` | `#eef0f3` | Chips, tracks, icon tiles, hover fills |
| `line` / `line-strong` | `#e3e6eb` / `#d0d5dd` | Dividers / input and pill borders |
| `ink` | `#1c2230` | Primary text |
| `ink-2` | `#3a4252` | Secondary text, icons |
| `muted` | `#646c7a` | Labels, descriptions (meets 4.5:1 on white) |
| `subtle` | `#8e95a2` | Placeholders, axis ticks, decorative only |

### Brand and roles

| Role | Tokens | Where it appears |
|---|---|---|
| **Navy (brand)** | `brand-50…900`, main `brand-700 #1e2637` | Primary buttons, active sidebar item, selected pill or segment, tab underline, progress fill, chart tooltips, the `brand` badge (solid, like "Demo") |
| **Accent (orange-red)** | `accent-50…700`, main `accent-600 #e2472b` | The logo mark, sidebar and tab counts, notification badge, unread dots, the "Fabrik needs your help" banner |
| **AI (blue)** | `ai-50/100/500/600/700`, main `ai-600 #3f6db3` | `AiBadge`, AI-generated cards, "Fabrik thinks" confidence bars, the staff nav group label |
| **OK** | `ok-50/100/600` | Processed, matched, closed, connected |
| **Warn** | `warn-50/100/500/700` | Needs review, in review, in progress (close) |
| **Risk** | `risk-50/100/600` | Low confidence, 31–60 days late |
| **Crit** | `crit-50/100/600/700` | Errors, rejected, 60+ days late, destructive buttons |
| **Info (slate)** | `info-50/100/600` | Waiting for client, approved, CPA reviewed |

Soft tones follow one recipe: `bg-<role>-50 text-<role>-600 ring-<role>-100`.

### Chart series (`SERIES` in `charts.tsx`)

| Series | Hex | Typical meaning |
|---|---|---|
| `s1` | `#1e293b` navy | Revenue, inflows |
| `s2` | `#e2472b` orange-red | Expenses, outflows |
| `s3` | `#5b8bd0` blue | Projected cash balance, scenario line |
| `muted` | `#9aa1ad` | Baseline, cash buffer (dashed) |

The three series differ in lightness as well as hue, so they stay distinct for colour-blind users. Estimated amounts are hatched.

---

## 3. Typography

- **Font:** Inter (`next/font`, `--font-inter`), with `cv11`/`ss01` features. Body text is 14px.
- **Numbers:** add `tabular` (or use `<Money>`) so columns line up.

| Style | Classes | Example |
|---|---|---|
| Page title | `text-[28px] sm:text-[34px] font-normal tracking-[-0.03em]` | "Home", "Monthly Close" (via `PageHeader`) |
| Hero figure | `text-[44px] font-normal tracking-[-0.04em]` | "63% complete" |
| KPI figure | `text-[30px] font-normal tracking-[-0.03em]` | "$482K" |
| Card title | `text-[17px] font-medium tracking-[-0.015em]` | "Revenue vs expenses" (via `CardHeader`) |
| Dialog title | `text-[20px] font-normal` | Drawer and Modal headers |
| Body | `text-[13px]–[14px]` | Descriptions, table cells |
| Label / eyebrow | `text-[11px]–[13px] text-muted`; uppercase with wide tracking for eyebrows | "FABRIK NEEDS YOUR HELP" |

Large text is light and small text is medium. Don't use `font-semibold` above 20px.

---

## 4. Shape, elevation and spacing

| Token | Value | Use |
|---|---|---|
| `--radius-card` | 24px | `Card`, `KpiCard`, hand-built cards |
| `--radius-control` | 9999px (pill) | Inputs, selects; buttons use `rounded-full` |
| Overlays | 28px | Drawer (inset 8px from the edge on desktop), Modal |
| Menus, toasts | 20px | Popover, toast |
| Inner panels | `rounded-2xl` (16px) | Panels inside cards, textareas, Notice |

| Shadow | Use |
|---|---|
| `--shadow-card` | Resting cards: barely visible on the canvas |
| `--shadow-raised` | Hover on clickable cards, inner option buttons |
| `--shadow-pop` | Drawer, Modal, Popover, toast, floating Ask button |
| `--shadow-focus` | 4px navy halo on focused inputs |

- **Spacing:** card padding is `px-5` with `pt-5`; grids of cards use `gap-3`; sections use `space-y-6`.
- **Main column:** max 1440px wide, with `px-4 sm:px-6 lg:px-8` side padding. Pages keep `pb-28` so the floating Ask button never covers the last row.

---

## 5. Components

Shared components live in `src/components/ui/primitives.tsx` (server-safe) and `src/components/ui/client.tsx` (interactive).

### Buttons — `Button`, `LinkButton`, `buttonClass(variant, size)`

| Variant | Look | Use for |
|---|---|---|
| `primary` | Navy pill, soft shadow that grows on hover | The one main action ("Review", "Approve", "Sign in") |
| `secondary` | White pill, `line-strong` border (default) | Everything else ("Go", "Finance package") |
| `subtle` | Grey chip | Low-emphasis toggles |
| `ghost` | Text only, grey fill on hover | Tertiary ("Reject", "Not now") |
| `ai` | Blue pill | Actions that run AI ("Use sample JD invoice") |
| `danger` | Red pill | Destructive confirmation only |

- **Sizes:** `sm` 32px, `md` 40px, `lg` 48px. All are `rounded-full`.
- **Pressed state:** `translate-y-px scale-[.985]`. Disabled buttons are dimmed and lose their shadow.

### Surfaces
- **`Card`:** white, 24px radius, white border, card shadow.
- **`CardHeader`:** title, optional subtitle, optional `icon` (a 36px grey rounded tile) and right-aligned `action`.
- **`PageHeader`:** light title with an optional `eyebrow`, `badge`, `description` and `actions`.
- **`KpiCard`:** muted label with a large light figure and an optional hint. With `href`, it shows a round arrow chip that turns navy on hover, and the card lifts 2px.

### Navigation and filters
- **`PageTabs`:** URL tabs with an ink text and navy 2px underline for the active tab; counts use an orange-red pill when active. They scroll with faded edges on small screens.
- **`pillListClass` + `pillClass(on)` + `pillCountClass(on)`:** a white pill track with the selected filter as a navy pill. Used for status and type filters (Books, Bills, Documents).
- **`Segmented`:** the same look as the filter pills, for in-place switches (chart range 3M/6M/12M/YTD).

### Status and labels
- **`Badge`:** a 22px pill in one of the tones `neutral`, `brand` (solid navy), `ok`, `warn`, `risk`, `crit`, `info` or `ai`, with an optional leading dot.
- **`StatusPill status="…"`:** maps every domain status to a tone and label. The map is in `primitives.tsx`; add new statuses there, never inline.
- **`AiBadge`:** blue pill with a sparkle. It must mark all AI-generated content.
- **`ConfidenceBadge`:** shows the percentage in the ok, warn or risk tone, using the PRD thresholds of 98% and 85%.

### Progress
- **`ProgressBar`:** 8px rounded bar in the navy, warn, ok or ai tone.
- **`TickBar`:** a row of thin ticks, filled navy up to the value, with the rest grey and shorter. Used for close progress on Home and Monthly Close. It exposes `role="progressbar"`.
- **`ProgressRing`:** a circular variant for compact spots.

### Forms
- **`Input` / `Select`:** 40px pill fields that are white with a `line-strong` border; they get a navy border and focus halo on focus. `Select` draws its own chevron (`.select-chevron`).
- **`Textarea`:** the same style, with a 16px radius.
- **`Field`:** a label above the control, with a hint or error (the error is in `role="alert"`) below.
- **Widths:** a control fills its container unless you pass a width class (`w-…`, `min-w-…`, `max-w-…`, `flex-1`).

### Overlays — `client.tsx`
- **`Drawer`:** slides in from the right. On desktop it floats with a 28px radius; on mobile it is full-screen. Its round close button turns navy on hover, and it has an optional sticky footer.
- **`Modal` / `ConfirmDialog`:** a 28px dialog over a blurred navy backdrop, with actions bottom-right.
- **`Popover`:** a 20px menu panel that opens with `animate-pop` and is clamped to the viewport width.
- **Toasts (`useToast`):** dark navy rounded cards, bottom-right, with a coloured icon chip for success, error or info.
- **Escape and focus:** Escape closes the Drawer, Modal and Popover. The Drawer and Modal keep focus inside themselves while open.

### States
- **`EmptyState`:** a grey rounded icon tile, a 16px title, a muted description and an optional action.
- **`Skeleton`:** a shimmering block (`.skeleton`). `src/app/(app)/loading.tsx` shows a page-shaped skeleton on every navigation.
- **`Notice`:** a tinted rounded panel in any tone; `crit` uses `role="alert"`, the rest `role="status"`.

### Identity
- **`Avatar`:** round initials on a soft HSL tint, using each user's stored hue. On the sign-in persona picker, staff use hue 262 and clients use 150.
- **`LogoMark` / `Wordmark` (`src/components/brand.tsx`):** an orange-red rounded square with a white "F" and field rows, beside "FABRIK FINANCE" in uppercase with the tagline.

---

## 6. App shell (`src/components/shell/shell.tsx`)

- **Sidebar** (260px, or 72px collapsed): sits directly on the canvas with no border.
  - Group labels are small uppercase muted text; the staff group sits below a dashed divider and uses a blue label.
  - Items are 40px pills. The active item is a navy pill with white text and icon; hovering washes the item white.
  - Count badges are solid orange-red pills, or an orange-red dot when the sidebar is collapsed.
- **Header** (72px): blurred canvas.
  - From left to right: the org switcher pill, the search pill (with extras on), a spacer, the QuickBooks sync pill (with a live green dot), the round notification button with an orange-red count, and the avatar with name and role.
- **Mobile:** the sidebar becomes a drawer with rounded right corners, opened from a round menu button.
- **Ask Fabrik:** a floating navy pill, bottom-right on every page except `/ask`.

---

## 7. Charts (`src/components/charts.tsx`, Recharts)

- **Bars:** thin (max 14px) with fully rounded ends. Revenue is navy and expenses are orange-red.
- **Grid:** dashed horizontal grid lines only, with no vertical lines. The zero line is `#d0d5dd`.
- **Tooltip:** a dark navy rounded card with white values and muted labels, echoing the reference's "$2,567" bubble.
- **Legend:** every chart has a `Legend` above it. Lines and dashes mark balances and buffers; hatching marks estimated amounts.
- **Accessibility:** each chart sits in a `role="img"` wrapper with a descriptive `aria-label`.

---

## 8. Motion

| Class | Duration | Use |
|---|---|---|
| `animate-page` | 240ms rise | Main content after navigation |
| `animate-in` | 160ms fade | Cards and list items appearing |
| `animate-drawer` | 220ms slide | Drawer |
| `animate-pop` | 170ms scale | Popover, Modal |
| `animate-backdrop` | 180ms fade | Overlay backdrops |
| `animate-toast` | 220ms rise | Toasts |
| `.skeleton` | 1.4s shimmer | Loading placeholders |

The easing is `--ease-out` (`cubic-bezier(0.2, 0.8, 0.2, 1)`). Hover lifts are 1–2px. `prefers-reduced-motion` turns off every animation and transition.

---

## 9. Accessibility checklist

- **Contrast:** text contrast is at least 4.5:1. `muted` on white and `ai-600`, `risk-600` and `crit-600` on their 50 tints pass; `subtle` is for placeholders and decoration only.
- **Focus:** a visible focus ring everywhere: a 2px `brand-500` outline, or a navy halo on inputs.
- **Labels:** every icon-only button has an `aria-label`; tabs use `role="tab"` / `aria-selected`; segmented controls use `role="radiogroup"`.
- **Colour:** status is never conveyed by colour alone; there is always a label or icon.
- **Touch targets:** at least 32px, and 40px for primary controls.
- **Phone width:** at 390px wide no page scrolls horizontally. Wide tables scroll inside their card.

---

## 10. Adding or changing UI

1. Reach for a primitive first. If two screens hand-build the same thing, promote it to `primitives.tsx`.
2. Use tokens, not hex values. To add a colour, add the token to `@theme` in `globals.css` and to the table in section 2.
3. Keep one navy primary button per view, and use orange-red only for things that need the user.
4. Check the screen at 1440px and 390px wide, then run `npx tsc --noEmit`, `npm test` and the Playwright suite.
5. Update this file (visual changes) and [WORKFLOW.md](WORKFLOW.md) (behaviour changes) in the same commit.
