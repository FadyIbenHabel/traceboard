import { defineConfig } from "@playwright/test";

// The suite starts the local app, or reuses an existing development server.
// Keep browser binaries outside the checkout when installing locally:
// PLAYWRIGHT_BROWSERS_PATH=/tmp/traceboard-browsers npx playwright install chromium
const production = Boolean(process.env.CI || process.env.TRACEBOARD_E2E_PRODUCTION);

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  webServer: {
    command: production ? "npm start -- --port 5173" : "npm run dev -- --port 5173",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  use: {
    baseURL: "http://127.0.0.1:5173",
    browserName: "chromium",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
    trace: "off",
  },
});
