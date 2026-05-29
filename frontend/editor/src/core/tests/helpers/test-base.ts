import { test as base, expect, type Page } from "@playwright/test";

/**
 * Console message types that should fail the test if they appear.
 * `console.error()` -> type "error", `console.warn()` -> type "warning".
 */
const FAILING_CONSOLE_TYPES = new Set(["error", "warning"]);

/**
 * Patterns ignored globally on every page. Keep this list small and
 * well-justified — each entry suppresses a genuine console warning for
 * every test, which means we lose detection of regressions in that
 * surface. Only add things that:
 *
 *   - fire on first page render of *every* test (so per-test
 *     suppression would just be ceremony), AND
 *   - are environmental noise (third-party CDN, dev-server quirk,
 *     known init-order quirk) rather than something a test could
 *     reasonably assert.
 *
 * Anything that fires only on specific flows belongs in an inline
 * `expectConsoleError` / `suppressConsoleErrors` at the call site.
 */
const GLOBAL_IGNORE_PATTERNS: RegExp[] = [
  // Stripe.js logs an HTTP warning when loaded over localhost. Third-party,
  // expected in dev, no production impact.
  /You may test your Stripe\.js integration over HTTP/,
  // i18next's HTTP backend fails to load namespace files under Vite dev's
  // `@fs/` URLs; the app falls back to embedded English copy and tests
  // still pass functional assertions.
  /i18next::backendConnector: loading namespace/,
  // scarfTracking.firePixel() is invoked from a router effect on the first
  // route render, before the useScarfTracking hook has called
  // setScarfConfig(). Harmless (the pixel is a no-op on first call) but
  // worth a follow-up to reorder init. See utils/scarfTracking.ts.
  /\[scarfTracking\] firePixel\(\) called before setScarfConfig/,

  // ── Vite dev-server flakiness under parallel-worker load ────────────────
  // The next block suppresses the entire cascade that follows when Vite's
  // dev server briefly stops accepting connections (because several workers
  // hit it simultaneously). In CI we serve a pre-built dist via
  // `vite preview`, where none of this happens; locally the cascade is just
  // environmental noise. None of these patterns mask production-only bugs.

  // 1) Browser-level network failure for an unreachable URL.
  /Failed to load resource: net::ERR_/,
  // 2) Vite's lazy chunk loader sees the network failure and throws.
  /Failed to fetch dynamically imported module/,
  // 3) PDF.js / pdfium WASM streaming fetch trips on the same outage.
  /WebAssembly compilation aborted: Network error/,
  /wasm streaming compile failed/,
  /failed to asynchronously prepare wasm/,
  /falling back to ArrayBuffer instantiation/,
  // 4) React-dom logs its own wrapper line when the lazy chunk error reaches
  //    a Suspense / ErrorBoundary. Suppress only this exact wrapper — real
  //    React errors that aren't chunk-load failures still surface elsewhere.
  /The above error occurred in one of your React components/,
  // 5) Our ErrorBoundary's componentDidCatch dumps ~15 supplementary
  //    diagnostic lines. They are useful in prod but in tests they are
  //    pure noise on top of whatever already failed. Match by source URL.
  /\(https?:\/\/[^)]*\/src\/core\/components\/shared\/ErrorBoundary\.tsx:/,
];

/**
 * Per-page collector for console errors / warnings / uncaught page errors.
 *
 * The fixture installs one of these on every page. Messages that aren't
 * absorbed by an active `expectConsoleError` / `suppressConsoleErrors`
 * scope are reported in fixture teardown and fail the test.
 */
class ConsoleErrorRecorder {
  private readonly failed: string[] = [];
  private readonly scopes: Array<{ pattern: RegExp; matched: boolean }> = [];

  record(text: string): void {
    for (const pattern of GLOBAL_IGNORE_PATTERNS) {
      if (pattern.test(text)) return; // documented global noise
    }
    for (const scope of this.scopes) {
      if (scope.pattern.test(text)) {
        scope.matched = true;
        return; // absorbed by an active scope, not a failure
      }
    }
    this.failed.push(text);
  }

  async withScope<T>(
    pattern: RegExp,
    fn: () => Promise<T>,
    requireMatch: boolean,
  ): Promise<T> {
    const scope = { pattern, matched: false };
    this.scopes.push(scope);
    try {
      const result = await fn();
      if (requireMatch && !scope.matched) {
        throw new Error(
          `expectConsoleError: no console error/warning matched ${pattern} ` +
            `during the scoped action`,
        );
      }
      return result;
    } finally {
      const idx = this.scopes.indexOf(scope);
      if (idx >= 0) this.scopes.splice(idx, 1);
    }
  }

  failures(): string[] {
    return this.failed;
  }
}

const recordersByPage = new WeakMap<Page, ConsoleErrorRecorder>();

function attachConsoleErrorRecorder(page: Page): ConsoleErrorRecorder {
  const recorder = new ConsoleErrorRecorder();
  recordersByPage.set(page, recorder);

  page.on("console", (msg) => {
    const type = msg.type();
    if (!FAILING_CONSOLE_TYPES.has(type)) return;
    const { url, lineNumber, columnNumber } = msg.location();
    const where = url ? ` (${url}:${lineNumber}:${columnNumber})` : "";
    recorder.record(`[console.${type}] ${msg.text()}${where}`);
  });

  page.on("pageerror", (err) => {
    recorder.record(`[pageerror] ${err.message}`);
  });

  return recorder;
}

function getRecorder(page: Page, caller: string): ConsoleErrorRecorder {
  const recorder = recordersByPage.get(page);
  if (!recorder) {
    throw new Error(
      `${caller} requires the \`test\` exported from ` +
        `\`@app/tests/helpers/test-base\` (or stub-test-base). ` +
        `Are you importing \`test\` directly from "@playwright/test"?`,
    );
  }
  return recorder;
}

/**
 * Run `fn` and *require* at least one console error / warning / page error
 * that matches `pattern` to occur during it. Matching messages are
 * absorbed (they don't fail the test); if none match, this throws.
 *
 * Use when a test deliberately exercises an error path and the error
 * surfaces in the console:
 *
 *   await expectConsoleError(page, /Validation failed/, async () => {
 *     await page.getByRole("button", { name: "Submit" }).click();
 *     await expect(page.getByRole("alert")).toBeVisible();
 *   });
 *
 * The scope only covers messages emitted while `fn` is awaiting, so
 * remember to `await` any UI assertion that the error has surfaced
 * *inside* the callback rather than after it returns.
 */
export async function expectConsoleError<T>(
  page: Page,
  pattern: RegExp,
  fn: () => Promise<T>,
): Promise<T> {
  return getRecorder(page, "expectConsoleError").withScope(pattern, fn, true);
}

/**
 * Run `fn` and silently absorb any console errors / warnings / page
 * errors matching `pattern`, without asserting that one occurred. Use
 * sparingly — `expectConsoleError` is preferred because it also verifies
 * the error path actually fires.
 *
 *   await suppressConsoleErrors(page, /MUI Grid v1 deprecated/, async () => {
 *     await page.getByRole("button", { name: "Open settings" }).click();
 *   });
 */
export async function suppressConsoleErrors<T>(
  page: Page,
  pattern: RegExp,
  fn: () => Promise<T>,
): Promise<T> {
  return getRecorder(page, "suppressConsoleErrors").withScope(
    pattern,
    fn,
    false,
  );
}

/**
 * Custom test fixture shared across all Playwright suites. Two things
 * happen for every test that uses this base (directly or transitively
 * via `stub-test-base.ts`):
 *
 *   1. The cookie-consent cookie is seeded before any navigation so the
 *      `#cc-main` banner never renders and never intercepts clicks.
 *   2. Console errors/warnings and uncaught page errors are captured.
 *      If any unhandled message appears during the test, the fixture
 *      throws during teardown and the test fails. Tests that legitimately
 *      produce errors should wrap the offending step in
 *      `expectConsoleError(page, /pattern/, async () => { ... })`.
 *
 * Usage: import { test, expect } from '@app/tests/helpers/test-base';
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    const recorder = attachConsoleErrorRecorder(page);

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

    const failures = recorder.failures();
    if (failures.length > 0) {
      throw new Error(
        `Test produced ${failures.length} unhandled console error(s)/warning(s):\n` +
          failures.map((m) => `  ${m}`).join("\n") +
          `\n\nIf any of these are expected, wrap the action in ` +
          `expectConsoleError(page, /pattern/, async () => { ... }).`,
      );
    }
  },
});

export { expect };
