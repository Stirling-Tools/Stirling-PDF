import { test, expect } from "@app/tests/helpers/stub-test-base";
import { openSettings } from "@app/tests/helpers/ui-helpers";
import type { Page } from "@playwright/test";

/**
 * Super search E2E: the bar itself (open, filter, select, show-more, XSS
 * hygiene) plus the access gating — a user without Processor access must see
 * no Processor chips, no Processor results, and trigger no entity fetches.
 *
 * Portal-lane presence differs by build: `vite dev` ships the portal, the CI
 * preview build does not. Gate-closed assertions hold in both (closed lanes
 * look identical to absent ones); gate-open lane assertions skip themselves
 * when the build ships no portal.
 */

const INPUT = "#super-search-input";

/**
 * URLs only the search's Processor entity fetch hits. `/api/v1/policies`
 * itself is deliberately absent: the editor's policy auto-run also reads it at
 * boot for every user, so it can't distinguish a search leak.
 */
const ENTITY_API_PATTERN =
  /\/api\/v1\/policies\/overview|\/api\/v1\/sources|\/api\/v1\/proprietary\/ui-data\/admin-settings/;

async function openSearch(page: Page) {
  const input = page.locator(INPUT);
  await input.click();
  await expect(input).toHaveAttribute("aria-expanded", "true");
  return input;
}

test.describe("Super search — bar basics", () => {
  test("Ctrl+K opens the bar and results filter as you type", async ({
    page,
  }) => {
    const input = page.locator(INPUT);
    // The shortcut listener mounts with the bar — wait for it before pressing.
    await expect(input).toBeVisible();
    await page.keyboard.press("Control+KeyK");
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute("aria-expanded", "true");

    await input.fill("merge");
    await expect(
      page.getByRole("option", { name: /Merge/ }).first(),
    ).toBeVisible();

    // A different query replaces the results in place.
    await input.fill("compress");
    await expect(
      page.getByRole("option", { name: /Compress/ }).first(),
    ).toBeVisible();
    await expect(page.getByRole("option", { name: /^Merge/ })).toHaveCount(0);
  });

  test("selecting a tool result opens that tool", async ({ page }) => {
    const input = await openSearch(page);
    await input.fill("merge");
    await page
      .getByRole("option", { name: /^Merge/ })
      .first()
      .click();
    await page.waitForURL("**/merge**");
  });

  test("shows the empty state for a query with no matches", async ({
    page,
  }) => {
    const input = await openSearch(page);
    await input.fill("xyznonexistent123");
    await expect(page.getByText("No results found")).toBeVisible();
  });

  test("treats markup in the query as plain text", async ({ page }) => {
    let dialogFired = false;
    page.on("dialog", (dialog) => {
      dialogFired = true;
      void dialog.dismiss();
    });

    const input = await openSearch(page);
    const payload =
      '<img src=x onerror="window.__xss=1"><script>alert(1)</script>';
    await input.fill(payload);
    await expect(input).toHaveValue(payload);

    await expect(page.getByText("No results found")).toBeVisible();
    expect(dialogFired).toBe(false);
    expect(
      await page.evaluate(
        () => (window as unknown as { __xss?: number }).__xss,
      ),
    ).toBeUndefined();
  });

  test("show more reveals the rest of a large group and collapses again", async ({
    page,
  }) => {
    const input = await openSearch(page);
    // Broad query — the tools lane alone exceeds the 5-row collapsed slice.
    // Assertions scope to the Tools group: other groups (docs, entities)
    // pop in asynchronously, so page-wide option counts are racy.
    await input.fill("pdf");
    const tools = page.getByRole("group", { name: "Tools" });
    await expect(tools.getByRole("option").first()).toBeVisible();

    const collapsedCount = await tools.getByRole("option").count();
    const showMore = tools.getByRole("button", { name: /Show \d+ more/ });
    await expect(showMore).toBeVisible();
    const hidden = Number(
      (await showMore.innerText()).match(/\d+/)?.[0] ?? "0",
    );
    await showMore.click();

    await expect(tools.getByRole("option")).toHaveCount(
      collapsedCount + hidden,
    );
    const showLess = tools.getByRole("button", { name: "Show less" });
    await expect(showLess).toBeVisible();

    await showLess.click();
    await expect(tools.getByRole("option")).toHaveCount(collapsedCount);
  });

  test("selecting a tool from the /files page leaves the file manager", async ({
    page,
  }) => {
    await page.goto("/files");
    const input = page.locator(INPUT).first();
    await expect(input).toBeVisible({ timeout: 15000 });
    await input.click();
    await input.fill("merge");
    await page
      .getByRole("option", { name: /^Merge/ })
      .first()
      .click();

    // The selection pins its tool URL via raw history.pushState, which the
    // router never sees — the sink must leave /files through the router or
    // the myFiles workbench swallows the selection (and "/" is a role router
    // on processor-shipping builds, so the exit must target the editor home).
    await expect(page.locator(".files-page-header-search")).not.toBeVisible({
      timeout: 5000,
    });
    await expect(page).toHaveURL(/\/merge/);
  });

  test("Ctrl+K inside the settings modal closes it and focuses the bar", async ({
    page,
  }) => {
    const input = page.locator(INPUT);
    await expect(input).toBeVisible();
    await openSettings(page);

    // The modal traps focus, so the bar's own shortcut is inert; the modal
    // cedes: it closes itself and hands focus to the bar.
    await page.keyboard.press("Control+KeyK");
    await expect(page.locator(".modal-container")).not.toBeVisible();
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute("aria-expanded", "true");

    // Full loop: a settings result deep-links straight back into the modal.
    await input.fill("general");
    await page
      .getByRole("option", { name: /General/ })
      .first()
      .click();
    await expect(page.locator(".modal-container")).toBeVisible();
  });
});

test.describe("Super search — user without Processor access", () => {
  // Login enabled, signed in as a plain member: no admin role, no portal
  // access. The Processor gate must stay closed.
  test.use({
    stubOptions: {
      enableLogin: true,
      user: {
        id: 33,
        username: "bob",
        email: "bob@example.com",
        role: "ROLE_USER",
        portalAccess: false,
      },
    },
    seedJwt: true,
  });

  test("sees no Processor chips, results or entity fetches", async ({
    page,
  }) => {
    const entityRequests: string[] = [];
    page.on("request", (request) => {
      if (ENTITY_API_PATTERN.test(request.url())) {
        entityRequests.push(request.url());
      }
    });

    const input = await openSearch(page);

    // Chip row: the editor lanes only. No Processor lanes of any kind.
    await expect(page.getByRole("button", { name: "Tools" })).toBeVisible();
    for (const lane of [
      "Pages",
      "Users",
      "Policies",
      "Pipelines",
      "Sources",
      "Docs",
    ]) {
      await expect(
        page.getByRole("button", { name: lane, exact: true }),
      ).toHaveCount(0);
    }

    // A query that would hit policies/docs/admin settings when the gate is
    // open must yield no Processor section for this user.
    await input.fill("security");
    await expect(page.getByRole("option").first()).toBeVisible();
    await expect(
      page.locator(".super-search-section-label", { hasText: "Processor" }),
    ).toHaveCount(0);

    // And the search must not have fetched any entity data on their behalf.
    await page.waitForTimeout(750);
    expect(entityRequests).toEqual([]);
  });

  test("sees login-gated settings but no admin settings", async ({ page }) => {
    const input = await openSearch(page);

    // Positive control — requiresLogin sections are visible to a signed-in
    // user, proving the settings lane itself works for this account.
    await input.fill("account");
    await expect(
      page.getByRole("option", { name: /Account Settings/ }).first(),
    ).toBeVisible();

    // Admin-only sections stay hidden (label and content matches alike).
    await input.fill("endpoints");
    await expect(page.getByRole("option", { name: /^Endpoints/ })).toHaveCount(
      0,
    );
  });
});

test.describe("Super search — portal access without admin", () => {
  // Self-hosted grants portal access beyond admins (team owners, ACL
  // grantees), but the users roster endpoint is admin-only — the Users lane
  // must not be offered to a session the endpoint would always refuse.
  test.use({
    stubOptions: {
      enableLogin: true,
      user: {
        id: 44,
        username: "owner",
        email: "owner@example.com",
        role: "ROLE_USER",
        portalAccess: true,
      },
    },
    seedJwt: true,
  });

  test("sees Processor lanes but no Users chip and no roster fetch", async ({
    page,
  }) => {
    const rosterRequests: string[] = [];
    page.on("request", (request) => {
      if (
        request.url().includes("/api/v1/proprietary/ui-data/admin-settings")
      ) {
        rosterRequests.push(request.url());
      }
    });
    for (const [pattern, json] of [
      ["**/api/v1/policies", []],
      ["**/api/v1/policies/runs", []],
      ["**/api/v1/policies/overview", { pipelines: [] }],
      ["**/api/v1/sources", { sources: [] }],
    ] as const) {
      await page.route(pattern, (route) => route.fulfill({ json }));
    }

    const input = await openSearch(page);
    const portalShips =
      (await page.getByRole("button", { name: "Pages", exact: true }).count()) >
      0;
    test.skip(!portalShips, "this build ships no portal — no lanes to gate");

    for (const lane of ["Policies", "Pipelines", "Sources"]) {
      await expect(
        page.getByRole("button", { name: lane, exact: true }),
      ).toBeVisible();
    }
    await expect(
      page.getByRole("button", { name: "Users", exact: true }),
    ).toHaveCount(0);

    // A query that used to fire the doomed roster fetch once per TTL.
    await input.fill("admin");
    await expect(page.locator(".super-search-dropdown").first()).toBeVisible();
    await page.waitForTimeout(1500);
    expect(rosterRequests).toEqual([]);
  });
});

test.describe("Super search — admin with Processor access", () => {
  test.use({
    stubOptions: {
      enableLogin: true,
      isAdmin: true,
      user: {
        id: 1,
        username: "admin",
        email: "admin@example.com",
        role: "ROLE_ADMIN",
        portalAccess: true,
      },
    },
    seedJwt: true,
  });

  test("sees Processor lanes and live entity results", async ({ page }) => {
    // Entity data the gate-open bar fetches, stubbed with one source row.
    await page.route("**/api/v1/policies", (route) =>
      route.fulfill({ json: [] }),
    );
    await page.route("**/api/v1/policies/runs", (route) =>
      route.fulfill({ json: [] }),
    );
    await page.route("**/api/v1/policies/overview", (route) =>
      route.fulfill({ json: { pipelines: [] } }),
    );
    await page.route("**/api/v1/sources", (route) =>
      route.fulfill({
        json: {
          sources: [{ id: "src-1", name: "Contract Intake", type: "email" }],
        },
      }),
    );

    await openSearch(page);

    // The Processor lanes only exist in builds that ship the portal (dev,
    // VITE_INCLUDE_PORTAL) — the CI preview build has none to show.
    const portalShips =
      (await page.getByRole("button", { name: "Pages", exact: true }).count()) >
      0;
    test.skip(!portalShips, "this build ships no portal — no lanes to gate");

    for (const lane of ["Users", "Policies", "Pipelines", "Sources"]) {
      await expect(
        page.getByRole("button", { name: lane, exact: true }),
      ).toBeVisible();
    }

    const input = page.locator(INPUT);
    await input.fill("contract intake");
    await expect(
      page.getByRole("option", { name: /Contract Intake/ }).first(),
    ).toBeVisible();
    await expect(
      page
        .locator(".super-search-section-label", { hasText: "Processor" })
        .first(),
    ).toBeVisible();
  });
});

test.describe("Portal bar — tool results hop into the editor", () => {
  test.use({
    stubOptions: {
      enableLogin: true,
      isAdmin: true,
      user: {
        id: 1,
        username: "admin",
        email: "admin@example.com",
        role: "ROLE_ADMIN",
        portalAccess: true,
      },
    },
    seedJwt: true,
    autoGoto: false,
  });

  test("selecting a tool routes client-side, not via a full page load", async ({
    page,
  }) => {
    for (const [pattern, json] of [
      ["**/api/v1/policies", []],
      ["**/api/v1/policies/runs", []],
      ["**/api/v1/policies/overview", { pipelines: [] }],
      ["**/api/v1/sources", { sources: [] }],
      ["**/api/v1/team/my", []],
    ] as const) {
      await page.route(pattern, (route) => route.fulfill({ json }));
    }

    await page.goto("/processor");
    const input = page.locator("#portal-search-input");
    // The portal only ships in dev / VITE_INCLUDE_PORTAL builds — on the CI
    // preview build /processor falls through to the editor and there is no
    // portal bar to hop from.
    const portalShips = await input
      .waitFor({ state: "visible", timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!portalShips, "this build ships no portal — no bar to hop from");

    // A full page load would drop this marker — and on bundled deploys it
    // would also 401: document GETs carry no Authorization header, so the
    // backend bounces them to /login even with a live session.
    await page.evaluate(() => {
      (window as unknown as { __spaMarker?: boolean }).__spaMarker = true;
    });

    await input.click();
    await input.fill("merge");
    await page
      .getByRole("option", { name: /^Merge/ })
      .first()
      .click();

    await expect(page).toHaveURL(/\/merge/);
    // Editor mounted: its own search bar replaces the portal's.
    await expect(page.locator("#super-search-input")).toBeVisible({
      timeout: 15000,
    });
    // The editor's URL-driven tool init must run on this route-swap mount,
    // not just on a cold page load: the Merge tool panel actually opens.
    await expect(
      page.getByRole("button", { name: "Merge", exact: true }),
    ).toBeVisible({ timeout: 10000 });
    expect(
      await page.evaluate(
        () => (window as unknown as { __spaMarker?: boolean }).__spaMarker,
      ),
    ).toBe(true);
  });
});
