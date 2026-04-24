import { defineConfig, devices } from "@playwright/test";

/**
 * Stirling-PDF E2E Test Configuration
 *
 * The suite is split into two projects:
 *   - `stubbed` — backend-free specs that mock `/api/v1/*` via `page.route()`.
 *                 Safe to run in CI without the Spring Boot server. Lives in
 *                 `src/core/tests/stubbed/**`.
 *   - `live`    — specs that require a real backend on `localhost:8080`
 *                 (auth, admin mutation, real tool round-trips). Lives in
 *                 `src/core/tests/live/**`.
 *
 * Run one:
 *   npx playwright test --project=stubbed
 *   npx playwright test --project=live
 *
 * @see https://playwright.dev/docs/test-configuration
 */
const chromiumViewport = {
  ...devices["Desktop Chrome"],
  viewport: { width: 1920, height: 1080 },
};

export default defineConfig({
  testDir: "./src/core/tests",
  testMatch: "**/*.spec.ts",

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : "50%",
  reporter: [["html", { open: "never" }], ["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },

  projects: [
    // Stubbed — no backend required, chromium-only for CI speed
    {
      name: "stubbed",
      testDir: "./src/core/tests/stubbed",
      use: chromiumViewport,
    },

    // Live backend — auth + admin-mutation + real-tool smoke
    {
      name: "live",
      testDir: "./src/core/tests/live",
      use: chromiumViewport,
    },

    // Cross-browser coverage for the stubbed suite (opt-in locally)
    {
      name: "stubbed-firefox",
      testDir: "./src/core/tests/stubbed",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "stubbed-webkit",
      testDir: "./src/core/tests/stubbed",
      use: { ...devices["Desktop Safari"] },
    },
  ],

  webServer: {
    command: "npx vite",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
