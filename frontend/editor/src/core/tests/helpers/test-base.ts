import { test as base, expect, type Page } from "@playwright/test";

/**
 * Console message types that should fail the test if they appear.
 * `console.error()` -> type "error", `console.warn()` -> type "warning".
 */
const FAILING_CONSOLE_TYPES = new Set(["error", "warning"]);

/**
 * Attach listeners that record any `console.error` / `console.warn` calls
 * and uncaught page errors. Returns a snapshot getter; the fixture asserts
 * the snapshot is empty during teardown so the failure is attributed to
 * the test that produced the noise.
 */
function attachConsoleErrorRecorder(page: Page): () => string[] {
  const messages: string[] = [];

  page.on("console", (msg) => {
    const type = msg.type();
    if (!FAILING_CONSOLE_TYPES.has(type)) return;
    const { url, lineNumber, columnNumber } = msg.location();
    const where = url ? ` (${url}:${lineNumber}:${columnNumber})` : "";
    messages.push(`[console.${type}] ${msg.text()}${where}`);
  });

  page.on("pageerror", (err) => {
    messages.push(`[pageerror] ${err.message}`);
  });

  return () => messages;
}

/**
 * Custom test fixture shared across all Playwright suites. Two things
 * happen for every test that uses this base (directly or transitively
 * via `stub-test-base.ts`):
 *
 *   1. The cookie-consent cookie is seeded before any navigation so the
 *      `#cc-main` banner never renders and never intercepts clicks.
 *   2. Console errors/warnings and uncaught page errors are captured.
 *      If any occur during the test, the fixture throws during teardown
 *      and the test fails.
 *
 * Usage: import { test, expect } from '@app/tests/helpers/test-base';
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    const snapshot = attachConsoleErrorRecorder(page);

    // Set the cookie consent cookie before any navigation so the banner
    // never appears. The cookieconsent library (orestbida/cookieconsent)
    // reads this cookie on init and skips the banner if consent exists.
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

    await use(page);

    const messages = snapshot();
    if (messages.length > 0) {
      throw new Error(
        `Test produced ${messages.length} console error(s)/warning(s):\n` +
          messages.map((m) => `  ${m}`).join("\n"),
      );
    }
  },
});

export { expect };
