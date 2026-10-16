// Visual QA helper: signs in as a demo persona and screenshots pages.
// Usage: node scripts/shoot.mjs <outDir> <email> <path> [path...]   (env WIDTH, FULL=1)
import { chromium } from "@playwright/test";

const [outDir, email, ...paths] = process.argv.slice(2);
const width = Number(process.env.WIDTH ?? 1440);
const base = process.env.BASE ?? "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
await page.goto(`${base}/login`);
await page.fill("#email", email);
await page.fill("#password", "FabrikDemo!2026");
await page.click("button[type=submit]");
await page.waitForURL((u) => u.pathname !== "/login");
await page.waitForLoadState("networkidle");
if (page.url().includes("/login/mfa")) {
  const code = await page.locator("span.font-mono").filter({ hasText: /^\s*\d{6}\s*$/ }).first().textContent();
  await page.fill("#code", code.trim());
  await page.click("button[type=submit]");
  await page.waitForLoadState("networkidle");
}
for (const p of paths) {
  const t0 = Date.now();
  const res = await page.goto(`${base}${p}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const name = p.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home";
  await page.screenshot({ path: `${outDir}/${name}-${width}.png`, fullPage: process.env.FULL !== "0" });
  console.log(`${p} -> ${res?.status()} in ${Date.now() - t0}ms`);
}
if (errors.length) console.log("ERRORS:\n" + [...new Set(errors)].slice(0, 20).join("\n"));
await browser.close();
