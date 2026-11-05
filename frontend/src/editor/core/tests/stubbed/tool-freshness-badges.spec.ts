import { test, expect } from "@editor/tests/helpers/stub-test-base";
import type { Page, Route } from "@playwright/test";

/**
 * "New"/"Updated" tool badges, driven by newInVersion/updatedInVersion tags in
 * the registry compared against app-config's appVersion (see toolFreshness.ts).
 * The app version is pinned per test so these stay hermetic as releases move on:
 * the tags used here record past releases, so they never change.
 */

test.use({ autoGoto: false });

async function openEditorAtVersion(page: Page, appVersion: string) {
  // Last-registered route wins, so this overrides the fixture's app-config stub.
  await page.route("**/api/v1/config/app-config", (route: Route) =>
    route.fulfill({
      json: {
        enableLogin: false,
        isAdmin: false,
        languages: ["en-US"],
        defaultLocale: "en-US",
        appVersion,
      },
    }),
  );
  await page.goto("/editor", { waitUntil: "domcontentloaded" });
}

const toolButton = (page: Page, toolId: string) =>
  page.locator(`[data-tour="tool-button-${toolId}"]`).first();
const badge = (page: Page, toolId: string, label: string) =>
  toolButton(page, toolId).getByText(label, { exact: true });

test.describe("Tool freshness badges", () => {
  test("recent tools show New/Updated and opening a tool clears its badge", async ({
    page,
  }) => {
    await openEditorAtVersion(page, "3.0.1");

    // autoRotate: newInVersion 3.0.0. multiTool: updatedInVersion 3.2.0,
    // ahead of this build, which also counts as recent.
    await expect(badge(page, "autoRotate", "New")).toBeVisible();
    await expect(badge(page, "multiTool", "Updated")).toBeVisible();

    // An untagged tool gets neither badge.
    await expect(toolButton(page, "merge")).toBeVisible();
    await expect(badge(page, "merge", "New")).toHaveCount(0);
    await expect(badge(page, "merge", "Updated")).toHaveCount(0);

    // Opening the tool acknowledges it; back on the list the badge is gone.
    await toolButton(page, "autoRotate").click();
    // Wait for the route so the acknowledgement effect has run before navigating.
    await expect(page).toHaveURL(/\/auto-rotate(?:$|[/?#])/);
    await page.goto("/editor", { waitUntil: "domcontentloaded" });
    await expect(toolButton(page, "autoRotate")).toBeVisible();
    await expect(badge(page, "autoRotate", "New")).toHaveCount(0);
    await expect(badge(page, "multiTool", "Updated")).toBeVisible();

    // The acknowledgement is persisted, so a reload doesn't resurrect it.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(toolButton(page, "autoRotate")).toBeVisible();
    await expect(badge(page, "autoRotate", "New")).toHaveCount(0);
  });

  test("badges expire once the tagged release is over a minor behind", async ({
    page,
  }) => {
    await openEditorAtVersion(page, "3.4.0");

    // pdfTextEditor: updatedInVersion 3.3.0, one minor back, so still shown.
    await expect(badge(page, "pdfTextEditor", "Updated")).toBeVisible();
    // multiTool (3.2.0) and autoRotate (3.0.0) are now too old.
    await expect(toolButton(page, "multiTool")).toBeVisible();
    await expect(badge(page, "multiTool", "Updated")).toHaveCount(0);
    await expect(toolButton(page, "autoRotate")).toBeVisible();
    await expect(badge(page, "autoRotate", "New")).toHaveCount(0);
  });
});
