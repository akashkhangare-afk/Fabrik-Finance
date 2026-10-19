import { expect, test, type Page } from "@playwright/test";

/**
 * The Expo MVP Definition of Done (PRD §34): a salesperson completes the Smith Family Farms
 * demonstration without developer help. This walks the six-step demo flow (PRD §29) in a browser.
 */

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", "FabrikDemo!2026");
  await page.click("button[type=submit]");
  if (email.startsWith("priya")) {
    await page.waitForURL(/\/login\/mfa/);
    const code = (await page.locator("span.font-mono").first().textContent())!.trim();
    await page.fill("#code", code);
    await page.click("button[type=submit]");
  }
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

async function ask(page: Page, q: string) {
  const box = page.getByRole("textbox", { name: "Ask Fabrik" });
  await box.fill(q);
  await box.press("Enter");
}

test.describe.configure({ mode: "serial" });

test("1 · Home: cash, revenue, profit, receivables, bills and the AI Finance Brief", async ({ page }) => {
  await signIn(page, "dan@smithfamilyfarms.example");
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  for (const [label, value] of [["Cash", "$482K"], ["Revenue YTD", "$3.8M"], ["Expenses YTD", "$3.18M"], ["Net income YTD", "$620K"], ["Receivables", "$310K"], ["Upcoming bills", "$184K"]]) {
    await expect(page.locator("a", { hasText: label }).filter({ hasText: value }).first()).toBeVisible();
  }
  await expect(page.getByText("Fabrik Finance Brief")).toBeVisible();
  await expect(page.getByText(/Revenue increased 8\.4% YTD/)).toBeVisible();
  await expect(page.getByText("Fabrik needs your help")).toBeVisible();
});

test("2 · Books: AI categorizes agricultural transactions with explanations", async ({ page }) => {
  await signIn(page, "dan@smithfamilyfarms.example");
  await page.goto("/books?q=JOHN%20DEERE");
  await expect(page.getByRole("cell", { name: /Equipment \/ Machinery/ }).first()).toBeVisible();
  await page.goto("/books?q=CASEYS");
  await expect(page.getByRole("cell", { name: /Fuel & Oil/ }).first()).toBeVisible();
  await page.goto("/books?q=PIONEER");
  await expect(page.getByRole("cell", { name: /^Seed/ }).first()).toBeVisible();
  await page.locator("tbody tr").first().click();
  await expect(page.getByText("AI recommendation")).toBeVisible();
  await expect(page.getByText("Audit trail")).toBeVisible();
});

test("3 · Document AI: upload the John Deere invoice, extract it and match it", async ({ page }) => {
  await signIn(page, "dan@smithfamilyfarms.example");
  await page.goto("/documents");
  await page.getByRole("button", { name: /Sample John Deere invoice/ }).click();
  await expect(page.getByText("JD-28712").first()).toBeVisible();
  await expect(page.getByText(/Match confidence: 99%/)).toBeVisible();
  await page.getByRole("button", { name: "Match", exact: true }).click();
  await expect(page.getByText(/Matched — supporting document cleared the review flag/)).toBeVisible();
});

test("4 · CFO: 'Can we afford another $1 million of farmland?' runs a scenario", async ({ page }) => {
  await signIn(page, "dan@smithfamilyfarms.example");
  await page.goto("/ask");
  await ask(page, "Can we afford to purchase another $1 million of farmland?");
  await expect(page.getByText(/purchase farmland/).first()).toBeVisible();
  await expect(page.getByText("Debt service coverage").first()).toBeVisible();
  await page.getByRole("link", { name: "Open this scenario in CFO" }).click();
  await expect(page.getByText("Impact")).toBeVisible();
  await expect(page.getByText("Assumptions used")).toBeVisible();
});

test("5 · Funding: high-potential USDA/FSA match with an explanation and official source", async ({ page }) => {
  await signIn(page, "dan@smithfamilyfarms.example");
  await page.goto("/funding");
  await expect(page.getByText(/programs identified/)).toBeVisible();
  await page.getByRole("link", { name: /Agriculture Risk Coverage/ }).click();
  await expect(page.getByText("Why Fabrik identified this")).toBeVisible();
  await expect(page.getByText(/71% ready/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Official source/ })).toHaveAttribute("href", /fsa\.usda\.gov/);
});

test("6 · Ask Fabrik wow moment: programs, then documents for 'these applications'", async ({ page }) => {
  await signIn(page, "dan@smithfamilyfarms.example");
  await page.goto("/ask");
  await ask(page, "What government programs could potentially help Smith Family Farms expand?");
  await expect(page.getByText(/could potentially help with expansion/)).toBeVisible();
  await ask(page, "What documents do we already have for these applications?");
  await expect(page.getByText(/you already have \d+ key items ready/)).toBeVisible();
  await expect(page.getByText("Application readiness")).toBeVisible();
});

test("Reports export as PDF and Excel", async ({ page }) => {
  await signIn(page, "dan@smithfamilyfarms.example");
  const pdf = await page.request.get("/api/v1/reports/export?kind=pnl&view=monthly&year=2026&format=pdf");
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  const xlsx = await page.request.get("/api/v1/reports/export?kind=balance_sheet&format=xlsx");
  expect(xlsx.status()).toBe(200);
  expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
});

test("Access control: clients can't open the Operations Portal; APIs require a session", async ({ page, request }) => {
  const anon = await request.get("/api/v1/search?q=deere");
  expect(anon.status()).toBe(401);
  await signIn(page, "dan@smithfamilyfarms.example");
  await page.goto("/ops");
  await expect(page.getByText(/Fabrik staff only/i)).toBeVisible();
});

test("Screens outside the PRD are hidden unless SHOW_EXTRAS is on", async ({ page }) => {
  await signIn(page, "dan@smithfamilyfarms.example");
  await expect(page.getByRole("link", { name: "Tax & Credits" })).toHaveCount(0);
  expect((await page.goto("/tax"))?.status()).toBe(404);
});

test("Operations: admin signs in with MFA and sees the portfolio", async ({ page }) => {
  await signIn(page, "priya.nair@fabrik.example");
  await page.goto("/ops");
  await expect(page.getByRole("heading", { name: "Fabrik Operations" })).toBeVisible();
  await expect(page.getByText(/Human minutes per client per month/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Requirements" })).toHaveCount(0);
  expect((await page.goto("/ops/requirements"))?.status()).toBe(404);
});
