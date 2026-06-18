import { test as base, expect } from "@playwright/test";
import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * Custom test fixture that:
 *   1. auto-dismisses the cookie consent banner (the banner overlays
 *      the page and intercepts pointer events, causing click timeouts
 *      across all tests);
 *   2. optionally captures V8 JS coverage per test when PW_COVERAGE=1.
 *
 * Coverage notes:
 *   - Only chromium supports page.coverage.* - the try/catch silently
 *     skips collection on firefox/webkit so cross-browser runs don't
 *     fail when coverage is enabled.
 *   - Raw V8 dumps land under .test-state/playwright/coverage-pw/ as
 *     <test-title>-<testId>.json. CI post-processes them with
 *     scripts/playwright-coverage-summary.py into a vitest-shaped
 *     coverage-summary.json that the existing helper renders.
 *   - resetOnNavigation: false so navigation between pages inside the
 *     same test (login → tool page → preview) accumulates instead of
 *     starting fresh.
 *
 * Usage: import { test, expect } from '@app/tests/helpers/test-base';
 */
const COVERAGE_ENABLED = process.env.PW_COVERAGE === "1";

// Path is workspace-relative because Playwright cwd is frontend/editor/
// at runtime (defined by playwright.config.ts). Going up two levels
// lands at the repo root - the same `.test-state/playwright/` that
// `task e2e:live` already provisions.
const COVERAGE_DIR = path.resolve(
  process.cwd(),
  "..",
  "..",
  ".test-state",
  "playwright",
  "coverage-pw",
);

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    await page.context().addCookies([
      {
        name: "cc_cookie",
        value: JSON.stringify({
          categories: ["necessary"],
          revision: 0,
          data: null,
          rfc_cookie: false,
          consentTimestamp: new Date().toISOString(),
          consentId: "playwright-test",
        }),
        domain: "localhost",
        path: "/",
      },
    ]);

    if (COVERAGE_ENABLED) {
      try {
        await page.coverage.startJSCoverage({ resetOnNavigation: false });
      } catch {
        // Browser doesn't support V8 coverage (firefox/webkit) - silently skip.
      }
    }

    await use(page);

    if (COVERAGE_ENABLED) {
      try {
        const entries = await page.coverage.stopJSCoverage();
        if (entries.length > 0) {
          await fs.mkdir(COVERAGE_DIR, { recursive: true });
          // Sanitize the path so it survives every filesystem we run on.
          const safeTitle = testInfo.titlePath
            .join("-")
            .replace(/[^A-Za-z0-9._-]/g, "_")
            .slice(0, 120);
          const outPath = path.join(
            COVERAGE_DIR,
            `${safeTitle}-${testInfo.testId}.json`,
          );
          await fs.writeFile(outPath, JSON.stringify(entries));
        }
      } catch {
        // Browser closed or coverage unsupported - swallow so a coverage
        // failure never fails the underlying test.
      }
    }
  },
});

export { expect };
