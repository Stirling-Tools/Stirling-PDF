import { defineConfig, devices } from "@playwright/test";

/**
 * Stirling-PDF E2E Test Configuration
 *
 * The suite is split into two projects:
 *   - `stubbed` - backend-free specs that mock `/api/v1/*` via `page.route()`.
 *                 Safe to run in CI without the Spring Boot server. Lives in
 *                 `src/core/tests/stubbed/**`.
 *   - `live`    - specs that require a real backend on `localhost:8080`
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

// Dedicated dev-server port via V2_PORT so local runs don't collide with a
// vite already on 5173 from other parallel work. Defaults to 5173.
const DEV_PORT = process.env.V2_PORT ?? "5173";

export default defineConfig({
  testDir: "./src/core/tests",
  testMatch: "**/*.spec.ts",

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : "50%",
  // In CI, add a JSON report alongside the HTML/list output so the workflow
  // can flag flaky tests (passed only on retry) as warnings without failing
  // the job. Path is pinned via PLAYWRIGHT_JSON_OUTPUT_FILE in the workflow;
  // the outputFile here is just a sane default. Omitted locally to keep dev
  // runs' terminal output clean.
  reporter: process.env.CI
    ? [
        ["html", { open: "never" }],
        ["list"],
        ["json", { outputFile: "playwright-report/results.json" }],
      ]
    : [["html", { open: "never" }], ["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${DEV_PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },

  projects: [
    // Stubbed - no backend required, chromium-only for CI speed
    {
      name: "stubbed",
      testDir: "./src/core/tests/stubbed",
      use: chromiumViewport,
    },

    // Live setup - runs once before the live suite to perform the real
    // forced-password-change first-login flow against a freshly-booted
    // backend. The live project depends on it.
    {
      name: "live-setup",
      testDir: "./src/core/tests/live-setup",
      testMatch: /.*\.setup\.ts$/,
      use: chromiumViewport,
    },

    // Live backend - auth + admin-mutation + real-tool smoke
    {
      name: "live",
      testDir: "./src/core/tests/live",
      use: chromiumViewport,
      dependencies: ["live-setup"],
    },

    // Enterprise - license-gated SSO/SAML/audit/teams against keycloak compose
    // Uses port 8080 directly (the docker compose stack publishes the
    // backend's built-in frontend there); the Vite dev server is bypassed
    // because the OAuth/SAML callback URLs are registered against 8080.
    {
      name: "enterprise",
      testDir: "./src/core/tests/enterprise",
      use: {
        ...chromiumViewport,
        baseURL: "http://localhost:8080",
      },
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
    // In CI, serve a pre-built `dist/` via `vite preview` so the heavy tool
    // pages don't pay vite's on-demand transform cost on first hit (which
    // blew the 30s navigationTimeout under --workers=3 - see
    // all-tool-pages-load.spec.ts). Locally, keep `vite` dev for HMR.
    command: process.env.CI
      ? `npx vite preview --port ${DEV_PORT} --strictPort`
      : `npx vite --port ${DEV_PORT} --strictPort`,
    url: `http://localhost:${DEV_PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
