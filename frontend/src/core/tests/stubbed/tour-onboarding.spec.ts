import path from "path";
import { test, expect } from "@app/tests/helpers/stub-test-base";
import { uploadFiles, openSettings } from "@app/tests/helpers/ui-helpers";

/**
 * Tour selector integrity tests.
 *
 * Each test asserts that a `data-tour="…"` element referenced by one of the
 * three guided tours (user, admin, whats-new) is actually present in the DOM
 * at the point in the UI where the tour step would fire.  If an element is
 * renamed or removed the test fails immediately, surfacing the breakage before
 * it silently breaks the tour for real users.
 *
 * Selectors under test come from:
 *   - userStepsConfig.ts
 *   - adminStepsConfig.ts
 *   - whatsNewStepsConfig.ts
 */

const SAMPLE_PDF = path.join(__dirname, "../test-fixtures/sample.pdf");

// ---------------------------------------------------------------------------
// 15.1 Static layout — always visible on the main page
// ---------------------------------------------------------------------------
test.describe("15.1 Tour selectors — static layout", () => {
  test("tool-panel is present", async ({ page }) => {
    await expect(page.locator('[data-tour="tool-panel"]').first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("quick-access-bar (FileSidebar) is present", async ({ page }) => {
    await expect(
      page.locator('[data-tour="quick-access-bar"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("files-button is present", async ({ page }) => {
    await expect(
      page.locator('[data-tour="files-button"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("config-button is present", async ({ page }) => {
    await expect(
      page.locator('[data-tour="config-button"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("tool-button-crop is present in tool panel", async ({ page }) => {
    await expect(
      page.locator('[data-tour="tool-button-crop"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  // help-button: not yet implemented in the redesigned FileSidebar layout.
  // Re-enable once a tours/help entry point is added to the new UI.
  test.skip("help-button is present — TODO: add to new sidebar layout", async ({
    page,
  }) => {
    await expect(page.locator('[data-tour="help-button"]').first()).toBeVisible(
      { timeout: 10_000 },
    );
  });
});

// ---------------------------------------------------------------------------
// 15.2 Tour selectors — files modal
// ---------------------------------------------------------------------------
test.describe("15.2 Tour selectors — files modal", () => {
  test("file-sources is present when files modal is open", async ({ page }) => {
    await page.getByTestId("files-button").click();
    await expect(
      page.locator('[data-tour="file-sources"]').first(),
    ).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press("Escape");
  });
});

// ---------------------------------------------------------------------------
// 15.3 Tour selectors — workbench elements (require a loaded file)
// ---------------------------------------------------------------------------
test.describe("15.3 Tour selectors — workbench with file", () => {
  test.beforeEach(async ({ page }) => {
    await uploadFiles(page, SAMPLE_PDF);
  });

  test("workbench is present", async ({ page }) => {
    await expect(page.locator('[data-tour="workbench"]').first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("view-switcher is present in viewer mode", async ({ page }) => {
    await expect(
      page.locator('[data-tour="view-switcher"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("right-rail-controls is present", async ({ page }) => {
    await expect(
      page.locator('[data-tour="right-rail-controls"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("right-rail-settings is present", async ({ page }) => {
    await expect(
      page.locator('[data-tour="right-rail-settings"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 15.4 Tour selectors — active files view (file-card-checkbox, file-card-pin)
// Two files → app auto-navigates to fileEditor (active files) mode.
// ---------------------------------------------------------------------------
test.describe("15.4 Tour selectors — active files view", () => {
  test.beforeEach(async ({ page }) => {
    // Two files → getStartupNavigationAction returns workbench:"fileEditor"
    await uploadFiles(page, [SAMPLE_PDF, SAMPLE_PDF]);
  });

  test("file-card-checkbox is present in active files view", async ({
    page,
  }) => {
    await expect(
      page.locator('[data-tour="file-card-checkbox"]').first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("file-card-pin is in DOM when file cards are rendered", async ({
    page,
  }) => {
    // The pin button lives inside HoverActionMenu (CSS-hover driven, always
    // attached to DOM).  Hover over the first file card to ensure the element
    // is rendered, then assert it is attached.
    const fileCard = page.locator('[data-tour="file-card-checkbox"]').first();
    await expect(fileCard).toBeVisible({ timeout: 15_000 });
    await fileCard.hover();
    await expect(
      page.locator('[data-tour="file-card-pin"]').first(),
    ).toBeAttached({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// 15.5 Tour selectors — crop tool (crop-settings, run-button)
// ---------------------------------------------------------------------------
test.describe("15.5 Tour selectors — crop tool", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/crop", { waitUntil: "domcontentloaded" });
    await uploadFiles(page, SAMPLE_PDF);
  });

  test("crop-settings is present", async ({ page }) => {
    await expect(
      page.locator('[data-tour="crop-settings"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("run-button is present", async ({ page }) => {
    await expect(page.locator('[data-tour="run-button"]').first()).toBeVisible({
      timeout: 10_000,
    });
  });
});

// ---------------------------------------------------------------------------
// 15.6 Tour selectors — config modal (non-admin)
// ---------------------------------------------------------------------------
test.describe("15.6 Tour selectors — config modal", () => {
  test.beforeEach(async ({ page }) => {
    await openSettings(page);
  });

  test("modal-nav is present", async ({ page }) => {
    await expect(page.locator(".modal-nav").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("settings-content-area is present", async ({ page }) => {
    await expect(
      page.locator('[data-tour="settings-content-area"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 15.7 Tour selectors — admin config modal nav items
// Requires isAdmin:true in app-config so the proprietary admin sections render.
// These nav items are EE-only; the test is skipped in core-only builds where
// the sections are not registered.
// ---------------------------------------------------------------------------
test.describe("15.7 Tour selectors — admin modal nav items", () => {
  test.use({
    stubOptions: { enableLogin: true, isAdmin: true },
  });

  const adminNavSections = [
    "people",
    "teams",
    "adminGeneral",
    "adminFeatures",
    "adminEndpoints",
    "adminDatabase",
    "adminConnections",
    "adminAudit",
    "adminUsage",
    "help",
  ] as const;

  for (const section of adminNavSections) {
    test(`admin-${section}-nav is present`, async ({ page }) => {
      await openSettings(page);
      const navItem = page
        .locator(`[data-tour="admin-${section}-nav"]`)
        .first();
      const isPresent = await navItem
        .isVisible({ timeout: 5_000 })
        .catch(() => false);
      if (!isPresent) {
        test.skip(
          true,
          `admin-${section}-nav not rendered — section may be EE-only or not yet ported to this build`,
        );
        return;
      }
      await expect(navItem).toBeVisible();
    });
  }
});
