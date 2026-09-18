import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page, Route } from "@playwright/test";

/**
 * "New"/"Updated" tool badges, driven by newInVersion/updatedInVersion tags in
 * the registry compared against app-config's appVersion (see toolFreshness.ts).
 * The app version is pinned per test so these stay hermetic as releases move on:
 * autoRotate keeps newInVersion 2.15.0 forever, so at a pinned 2.15.x it is
 * always "recent" here regardless of the real current version.
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
    await openEditorAtVersion(page, "2.15.1");

    // autoRotate: newInVersion 2.15.0. formFill: updatedInVersion 2.15.0.
    await expect(badge(page, "autoRotate", "New")).toBeVisible();
    await expect(badge(page, "formFill", "Updated")).toBeVisible();

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
    await expect(badge(page, "formFill", "Updated")).toBeVisible();

    // The acknowledgement is persisted, so a reload doesn't resurrect it.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(toolButton(page, "autoRotate")).toBeVisible();
    await expect(badge(page, "autoRotate", "New")).toHaveCount(0);
  });

  test("badges expire once the tagged release is over a minor behind", async ({
    page,
  }) => {
    await openEditorAtVersion(page, "2.17.0");

    await expect(toolButton(page, "autoRotate")).toBeVisible();
    await expect(badge(page, "autoRotate", "New")).toHaveCount(0);
    await expect(toolButton(page, "formFill")).toBeVisible();
    await expect(badge(page, "formFill", "Updated")).toHaveCount(0);
  });
});
