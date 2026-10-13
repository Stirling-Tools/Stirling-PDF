import { test, expect } from "@app/tests/helpers/stub-test-base";
import { errors, type ConsoleMessage, type Page } from "@playwright/test";

/**
 * Smoke test: standard usage of the app must not produce any
 * console.error, console.warn, or uncaught page errors.
 *
 * Each test disables the fixture's auto-goto (via `test.use({ autoGoto:
 * false })`), attaches listeners inline with `attachListeners(page)` BEFORE
 * navigating, walks a representative route, lets it settle, then asserts
 * the captured buffer is empty.
 *
 * If you have a legitimate reason a warning fires on a given route
 * (third-party library noise we cannot influence, etc.), filter it via the
 * `IGNORED` allowlist below, but the default expectation is that the
 * console stays clean. Do not add entries casually; prefer fixing the
 * underlying issue.
 */

type ConsoleEntry = {
  type: "error" | "warn" | "pageerror";
  text: string;
  location?: string;
};

const IGNORED: RegExp[] = [
  // Add entries here only with a comment explaining why the warning is
  // unavoidable. Default: keep this list empty.
];

const WEBKIT_LOCALE_PRELOAD_WARNING =
  /^The resource (https?:\/\/\S+\/locales\/[A-Za-z-]{2,12}\/translation\.toml) was preloaded using link preload but not used within a few seconds from the window's load event\. Please make sure it wasn't preloaded for nothing\.$/;

function shouldIgnore(text: string): boolean {
  return IGNORED.some((re) => re.test(text));
}

function attachListeners(page: Page): ConsoleEntry[] {
  const entries: ConsoleEntry[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    const type = msg.type();
    if (type !== "error" && type !== "warning") return;
    const text = msg.text();
    if (shouldIgnore(text)) return;
    const loc = msg.location();
    entries.push({
      type: type === "warning" ? "warn" : "error",
      text,
      location: loc.url
        ? `${loc.url}:${loc.lineNumber}:${loc.columnNumber}`
        : undefined,
    });
  });
  page.on("pageerror", (err) => {
    if (shouldIgnore(err.message)) return;
    entries.push({ type: "pageerror", text: err.stack ?? err.message });
  });
  return entries;
}

function formatEntries(entries: ConsoleEntry[]): string {
  return entries
    .map(
      (e) =>
        `  [${e.type}] ${e.text}${e.location ? `\n    at ${e.location}` : ""}`,
    )
    .join("\n");
}

async function expectCleanConsole(
  entries: ConsoleEntry[],
  page: Page,
  browserName: string,
) {
  let unexpected = entries;
  if (browserName === "webkit") {
    // WebKit can warn about an unused fetch preload despite successfully
    // fetching the same translation (https://bugs.webkit.org/show_bug.cgi?id=236009).
    // Require a completed fetch before accepting that browser warning.
    const fetchedUrls = await page.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .filter(
          (entry) =>
            entry instanceof PerformanceResourceTiming &&
            entry.initiatorType === "fetch" &&
            entry.responseStart > 0 &&
            entry.responseEnd > 0,
        )
        .map((entry) => entry.name),
    );
    unexpected = entries.filter((entry) => {
      const url = WEBKIT_LOCALE_PRELOAD_WARNING.exec(entry.text)?.[1];
      return !(
        entry.type === "warn" &&
        !entry.location &&
        url &&
        fetchedUrls.includes(url)
      );
    });
  }
  expect(
    unexpected,
    `Page produced unexpected console output:\n${formatEntries(unexpected)}`,
  ).toEqual([]);
}

// ─── Routes to sweep ────────────────────────────────────────────────────────
//
// One entry per route we want to guarantee is console-clean on load. Mirrors
// the most common user entry points; expand cautiously - every entry adds CI
// time and triage surface for new warnings.

const ROUTES: { name: string; path: string }[] = [
  { name: "landing", path: "/" },
  { name: "files", path: "/files" },
  { name: "compress", path: "/compress" },
  { name: "split", path: "/split" },
  { name: "merge", path: "/merge" },
  { name: "convert", path: "/convert" },
  { name: "rotate", path: "/rotate" },
  { name: "addPageNumbers", path: "/add-page-numbers" },
];

// Disable the fixture's auto-goto so we can attach listeners before any
// navigation happens. Otherwise listeners miss early load-time noise.
test.use({ autoGoto: false });

test.describe("Console hygiene: representative routes load cleanly", () => {
  for (const route of ROUTES) {
    test(`${route.name} (${route.path})`, async ({ page, browserName }) => {
      const entries = attachListeners(page);
      const scriptRequests: string[] = [];
      page.on("request", (request) => {
        if (request.resourceType() === "script") {
          scriptRequests.push(request.url());
        }
      });
      await page.goto(route.path, { waitUntil: "domcontentloaded" });
      // Give async effects (i18n load, lazy chunks, posthog init) a beat to
      // surface anything they were going to log.
      await page
        .waitForLoadState("networkidle", { timeout: 10_000 })
        .catch((err) => {
          // networkidle can flake on third-party CDNs; treat ONLY the
          // timeout as benign and still run the console assertion on what
          // we captured. Anything else (frame detached, navigation abort,
          // etc.) is a real problem and should fail the test.
          if (!(err instanceof errors.TimeoutError)) throw err;
        });
      await expectCleanConsole(entries, page, browserName);
      const entryUrls = await page
        .locator('script[type="module"][src]')
        .evaluateAll((scripts) =>
          scripts.map((script) => (script as HTMLScriptElement).src),
        );
      for (const url of entryUrls) {
        expect(
          scriptRequests.filter((requestUrl) => requestUrl === url),
          `Entry module was fetched again by a lazy import: ${url}`,
        ).toHaveLength(1);
      }
    });
  }
});
