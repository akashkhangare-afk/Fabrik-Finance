import { rmSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Every run starts from the permanent seeded demo.
rmSync(".data-e2e", { recursive: true, force: true });

/** E2E runs against an isolated, freshly seeded datastore on port 3100. */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure", viewport: { width: 1440, height: 900 } },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: "npx next dev -p 3100",
    url: "http://localhost:3100/login",
    timeout: 180_000,
    reuseExistingServer: false,
    env: { FABRIK_DATA_DIR: ".data-e2e", FABRIK_CLOCK: "2026-10-16", FABRIK_DEMO_MODE: "true" },
  },
});
