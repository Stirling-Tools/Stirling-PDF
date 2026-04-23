import { defineConfig, devices } from "@playwright/test";

/**
 * Stirling-PDF E2E Test Configuration
 * Tests are generated and maintained by Playwright Test Agents (planner, generator, healer).
 *
 * @see https://playwright.dev/docs/test-agents
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./src/core/tests",
  testMatch: "**/*.spec.ts",

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only — locally tests should pass cleanly */
  retries: process.env.CI ? 2 : 0,

  /* Workers: CI uses 1 for stability, locally use 50% of CPU cores */
  workers: process.env.CI ? 1 : "50%",

  /* Reporter to use */
  reporter: [
    ["html", { open: "never" }],
    ["list"],
  ],

  /* Global timeout per test */
  timeout: 60_000,

  /* Expect timeout */
  expect: {
    timeout: 10_000,
  },

  /* Shared settings for all the projects below */
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1920, height: 1080 },
      },
    },

    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },

    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },

  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: "npx vite",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
