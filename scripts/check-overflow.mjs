import { chromium } from "@playwright/test";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.goto("http://localhost:3200/login"); await p.fill("#email","dan@smithfamilyfarms.example"); await p.fill("#password","FabrikDemo!2026"); await p.click("button[type=submit]"); await p.waitForURL("http://localhost:3200/");
for (const path of ["/","/inbox","/books","/books?tab=reports","/reconciliation","/close","/bills","/collect","/funding","/funding/fsa-arc-plc","/funding/profile","/cfo","/cfo?tab=forecast","/cfo?tab=scenarios","/ask","/documents","/tax","/integrations","/settings"]) {
  await p.goto("http://localhost:3200"+path, { waitUntil: "networkidle" });
  const w = await p.evaluate(() => document.documentElement.scrollWidth);
  console.log(path.padEnd(22), w > 392 ? `OVERFLOW ${w}px` : "ok");
}
await b.close();
