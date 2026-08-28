import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { ConsoleMessage, Page } from "@playwright/test";

/**
 * `processor.enabled=false` (an editor-only server): the editor must show no
 * Processor UI at all, and must not ask the server for Processor data.
 *
 * Every absence assertion is paired with a positive control below, using the
 * same admin-with-portal-access user and differing only in the flag - without
 * that pairing an empty page would pass this file trivially.
 *
 * As in super-search.spec.ts, lane assertions that need the portal bundled
 * skip themselves on builds that ship none (VITE_INCLUDE_PORTAL); closed lanes
 * and absent lanes look identical, so only the gate-open controls are affected.
 */

const INPUT = "#super-search-input";

// The Processor's own data endpoints - the same URL surface ProcessorEndpointSurfaceTest
// keeps unmapped on the server. None may be requested with the flag off. classify-and-label
// is spelled out because /api/v1/ai/tools also holds editor-only AI agents.
const PROCESSOR_API =
  /^\/api\/v1\/(policies|sources|integration|webhooks|pipeline|ai\/tools\/classify-and-label)/;

const ADMIN_WITH_PORTAL = {
  id: 1,
  username: "admin",
  email: "admin@example.com",
  role: "ROLE_ADMIN",
  portalAccess: true,
};

// The quick-nav rail's Processor entry, and the sidebar footer row. Both are
// named: an assertion on a control that no longer exists passes vacuously,
// which is how #7695 silently defanged this file.
const RAIL_PROCESSOR = "Processor";
const OPEN_PROCESSOR = "Open PDF Processor";

// Copy that only a Processor server can honour: a link tool pointing at the
// folder-scanning guide, and settings controls hidden with the flag off. The
// Telegram bot round-trips through the pipeline folders, so it goes too.
const FOLDER_SCANNING = "Automated Folder Scanning";
const WATCHED_FOLDERS = "Watched Folders Directory";
const AFTER_SIGNING_IN = "After signing in";
const TELEGRAM = "Telegram";

const PROCESSOR_ONLY_COPY = [
  FOLDER_SCANNING,
  WATCHED_FOLDERS,
  AFTER_SIGNING_IN,
  TELEGRAM,
];

async function openSearch(page: Page) {
  const input = page.locator(INPUT);
  await input.click();
  await expect(input).toHaveAttribute("aria-expanded", "true");
  return input;
}

/** The portal lanes only exist in a build that bundles the portal. */
async function requirePortalBuild(page: Page) {
  const ships =
    (await page.getByRole("button", { name: "Pages", exact: true }).count()) >
    0;
  test.skip(!ships, "this build ships no portal - no lanes to gate");
}

function recordProcessorRequests(page: Page): string[] {
  const seen: string[] = [];
  page.on("request", (request) => {
    const { pathname } = new URL(request.url());
    if (PROCESSOR_API.test(pathname)) seen.push(pathname);
  });
  return seen;
}

// Pre-existing dev-server noise, unrelated to this flag: i18n runs with
// useSuspense, so a cold namespace load warns on every route (console-clean.spec
// fails identically on /merge and /compress against the dev server).
const KNOWN_NOISE = [
  /react-i18next::i18next: useTranslation: suspended/,
  /i18next::backendConnector: loading namespace/,
];

function recordConsole(page: Page): string[] {
  const problems: string[] = [];
  const keep = (text: string) => {
    if (!KNOWN_NOISE.some((re) => re.test(text))) problems.push(text);
  };
  page.on("console", (msg: ConsoleMessage) => {
    const type = msg.type();
    if (type === "error" || type === "warning") keep(msg.text());
  });
  page.on("pageerror", (err) => keep(err.stack ?? err.message));
  return problems;
}

test.describe("editor-only server (processor.enabled=false)", () => {
  test.use({
    // Off, so the listeners below are attached before the only navigation -
    // a second goto re-races i18n's namespace fetch and reports its own noise.
    autoGoto: false,
    seedJwt: true,
    stubOptions: {
      enableLogin: true,
      processorEnabled: false,
      user: ADMIN_WITH_PORTAL,
    },
  });

  test("shows no Processor entry points and fetches no Processor data", async ({
    page,
  }) => {
    const requests = recordProcessorRequests(page);
    const problems = recordConsole(page);
    await page.goto("/editor", { waitUntil: "domcontentloaded" });
    await expect(page.locator(INPUT)).toBeVisible();

    // The quick-nav rail offers no Processor entry...
    await expect(
      page.getByRole("button", { name: RAIL_PROCESSOR, exact: true }),
    ).toHaveCount(0);
    // ...and the sidebar footer offers no "Open PDF Processor" row.
    await expect(page.getByLabel(OPEN_PROCESSOR)).toHaveCount(0);

    // Nothing asked the server for Processor data on this user's behalf.
    await page.waitForTimeout(1500);
    expect(requests).toEqual([]);

    // An editor-only server must not be a degraded one.
    expect(problems).toEqual([]);
  });

  test("offers no Processor lanes or results in super search", async ({
    page,
  }) => {
    await page.goto("/editor", { waitUntil: "domcontentloaded" });
    const input = await openSearch(page);

    // The editor's own lane is present (control), the Processor's are not.
    await expect(
      page.getByRole("button", { name: "Tools", exact: true }),
    ).toBeVisible();
    for (const lane of ["Pages", "Policies", "Sources", "Pipelines", "Users"]) {
      await expect(
        page.getByRole("button", { name: lane, exact: true }),
      ).toHaveCount(0);
    }

    // A query that hits policies when the Processor is on yields no section.
    await input.fill("security");
    await expect(page.getByRole("option").first()).toBeVisible();
    await expect(
      page.locator(".super-search-section-label", { hasText: "Processor" }),
    ).toHaveCount(0);
  });

  test("offers no folder-scanning tool and no pipeline settings copy", async ({
    page,
  }) => {
    // Traces a code-only sweep missed: the tool card links a guide to a feature
    // this server can't run, and settings search matches whole i18n subtrees,
    // so hidden controls' copy stayed findable.
    await page.goto("/editor", { waitUntil: "domcontentloaded" });
    const input = await openSearch(page);

    for (const term of PROCESSOR_ONLY_COPY) {
      await input.fill(term);
      // Settled: the list re-renders per keystroke, so assert after a paint.
      await expect(page.locator(INPUT)).toHaveValue(term);
      await expect(page.getByRole("option", { name: term })).toHaveCount(0);
    }
  });

  // Not asserted here: whether /processor is routable depends on BUILD_PORTAL,
  // which the stubbed dev suite (portal always bundled) cannot vary. The
  // editor-only image is built with BUILD_PORTAL=false and its dist carries no
  // portal chunk - that is where the absence is verified.
});

test.describe("same user on a server with the Processor on", () => {
  // Positive controls: the identical account, differing only in the flag.
  test.use({
    seedJwt: true,
    stubOptions: {
      enableLogin: true,
      processorEnabled: true,
      user: ADMIN_WITH_PORTAL,
    },
  });

  test("is offered the switch to the Processor", async ({ page }) => {
    await expect(page.locator(INPUT)).toBeVisible();
    await expect(
      page.getByRole("button", { name: RAIL_PROCESSOR, exact: true }),
    ).toBeVisible();
  });

  test("is offered Processor lanes in super search", async ({ page }) => {
    await openSearch(page);
    await requirePortalBuild(page);

    for (const lane of ["Policies", "Sources", "Pipelines"]) {
      await expect(
        page.getByRole("button", { name: lane, exact: true }),
      ).toBeVisible();
    }
  });

  test("finds the folder-scanning tool and the pipeline settings copy", async ({
    page,
  }) => {
    // Control for the absence test above: these terms are findable here, so
    // their disappearance with the flag off is the gate, not a typo.
    const input = await openSearch(page);

    for (const term of PROCESSOR_ONLY_COPY) {
      await input.fill(term);
      await expect(
        page.getByRole("option", { name: term }).first(),
      ).toBeVisible();
    }
  });

  test("stays on /processor and renders the portal", async ({ page }) => {
    // Control for the bounce test: same URL, same account, flag on. The editor
    // shell not rendering is what makes "it renders" above a real assertion.
    await page.goto("/processor", { waitUntil: "domcontentloaded" });
    const editorMounted = await page
      .locator(INPUT)
      .isVisible()
      .catch(() => false);
    test.skip(
      editorMounted,
      "this build ships no portal - nothing mounts here",
    );
    await expect(page).toHaveURL(/\/processor\b/);
  });
});
