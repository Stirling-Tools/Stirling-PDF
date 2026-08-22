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

function shouldIgnore(text: string): boolean {
  return IGNORED.some((re) => re.test(text));
}

/** Placeholder for an error the browser gave us nothing usable about. */
const NO_DETAIL = "(no message or stack - see in-page detail below)";

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
    // WebKit hands back an empty message AND an empty stack for cross-origin
    // script failures and for rejections whose reason is not an Error, so keep
    // a marker rather than an empty string - attachInPageErrorCapture below
    // supplies the detail those cases drop.
    entries.push({
      type: "pageerror",
      text: err.stack || err.message || NO_DETAIL,
    });
  });
  return entries;
}

/**
 * Record raw `error` / `unhandledrejection` events inside the page.
 *
 * Playwright's `pageerror` drops everything WebKit sanitises, which is how
 * this suite ended up reporting a bare `[pageerror]` with no text and no way
 * to act on it. The in-page events still carry the script URL, line and the
 * raw rejection value, so a CI failure names its own cause.
 */
async function attachInPageErrorCapture(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const sink: string[] = [];
    (window as unknown as { __e2eErrorDetail: string[] }).__e2eErrorDetail =
      sink;
    const describe = (value: unknown): string => {
      if (value instanceof Error) {
        return value.stack || `${value.name}: ${value.message}`;
      }
      if (value && typeof value === "object") {
        try {
          return JSON.stringify(value);
        } catch {
          return Object.prototype.toString.call(value);
        }
      }
      return String(value);
    };
    window.addEventListener("error", (event) => {
      // Resource-load failures bubble here with no `error` object and never
      // reach `pageerror`, so record where they came from rather than
      // pretending they were throws.
      const origin = event.filename
        ? `${event.filename}:${event.lineno}:${event.colno}`
        : describe(event.target);
      sink.push(
        `[window.onerror] ${event.message || "(sanitised)"} @ ${origin} :: ${describe(event.error)}`,
      );
    });
    window.addEventListener("unhandledrejection", (event) => {
      sink.push(`[unhandledrejection] ${describe(event.reason)}`);
    });
  });
}

/** Drain the in-page sink. Never throws - it only ever adds context. */
async function readInPageErrorDetail(page: Page): Promise<string[]> {
  return page
    .evaluate(
      () =>
        (window as unknown as { __e2eErrorDetail?: string[] })
          .__e2eErrorDetail ?? [],
    )
    .catch(() => []);
}

/** Appended to the failure message so a bare `[pageerror]` names its cause. */
function formatInPageDetail(inPageDetail: string[]): string {
  if (!inPageDetail.length) return "";
  const lines = inPageDetail.map((d) => `    ${d}`).join("\n");
  return `\n  in-page detail:\n${lines}`;
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
  inPageDetail: string[],
) {
  expect(
    entries,
    `Page produced unexpected console output:\n${formatEntries(entries)}${formatInPageDetail(inPageDetail)}`,
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
    test(`${route.name} (${route.path})`, async ({ page }) => {
      const entries = attachListeners(page);
      await attachInPageErrorCapture(page);
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
      await expectCleanConsole(entries, await readInPageErrorDetail(page));
    });
  }
});
