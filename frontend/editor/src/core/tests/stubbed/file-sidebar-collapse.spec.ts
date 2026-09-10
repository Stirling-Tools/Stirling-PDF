import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page, Route } from "@playwright/test";
import path from "path";

const FIXTURES_DIR = path.join(import.meta.dirname, "../test-fixtures");
const SAMPLE_PDF = path.join(FIXTURES_DIR, "sample.pdf");

const sidebar = '[data-sidebar="file-sidebar"]';

/** Last-registered-wins over the fixture's app-config stub. */
async function stubGoogleDriveConfigured(page: Page): Promise<void> {
  await page.route("**/api/v1/config/app-config", (route: Route) =>
    route.fulfill({
      json: {
        enableLogin: false,
        isAdmin: false,
        languages: ["en-US"],
        defaultLocale: "en-US",
        googleDriveEnabled: true,
        googleDriveClientId: "stub-client-id",
        googleDriveApiKey: "stub-api-key",
        googleDriveAppId: "stub-app-id",
      },
    }),
  );
}

test.describe("File sidebar collapse", () => {
  test("collapsing takes the sidebar off the layout instead of leaving a rail", async ({
    page,
  }) => {
    await page.goto("/editor");
    const panel = page.locator(sidebar);
    await expect(panel).toBeVisible();

    const railWidth = await page
      .locator(".quick-nav-rail-container")
      .evaluate((el) => el.getBoundingClientRect().width);

    await page.getByRole("button", { name: /collapse sidebar/i }).click();

    await expect
      .poll(async () =>
        panel.evaluate((el) => el.getBoundingClientRect().width),
      )
      .toBe(0);
    // The workbench starts where the quick nav rail ends: nothing between them.
    await expect
      .poll(async () =>
        panel.evaluate((el) => el.getBoundingClientRect().right),
      )
      .toBe(railWidth);

    // The floating control is the only way back once the header toggle is gone.
    await page.getByTestId("file-sidebar-expand").click();
    await expect
      .poll(async () =>
        panel.evaluate((el) => el.getBoundingClientRect().width),
      )
      .toBeGreaterThan(0);
    await expect(page.getByTestId("file-sidebar-expand")).toHaveCount(0);
  });

  test("the rail opens files from the computer while the sidebar is collapsed", async ({
    page,
  }) => {
    await page.goto("/editor");
    await page.getByRole("button", { name: /collapse sidebar/i }).click();

    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("quicknav-open-from-computer").click();
    await (await chooser).setFiles(SAMPLE_PDF);

    await page.getByTestId("file-sidebar-expand").click();
    await expect(page.locator(".file-sidebar-file-item").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("the file library is reachable from the rail only, not duplicated in the sidebar", async ({
    page,
  }) => {
    await page.goto("/editor");
    await expect(
      page.locator(sidebar).getByTestId("my-files-button"),
    ).toHaveCount(0);

    await page.getByTestId("my-files-button").click();
    await expect(page).toHaveURL(/\/files(?:$|[/?#])/);
  });
});

test.describe("File sidebar library header", () => {
  test("hides the Google Drive button when Drive is not configured", async ({
    page,
  }) => {
    await page.goto("/editor");
    await expect(page.getByTestId("files-button")).toBeVisible();
    await expect(page.getByTestId("google-drive-button")).toHaveCount(0);
  });

  test("shows the Google Drive button beside the add button", async ({
    page,
  }) => {
    await stubGoogleDriveConfigured(page);
    await page.goto("/editor");
    const drive = page.getByTestId("google-drive-button");
    await expect(drive).toBeVisible();

    const driveBox = await drive.boundingBox();
    const addBox = await page.getByTestId("files-button").boundingBox();
    expect(driveBox).not.toBeNull();
    expect(addBox).not.toBeNull();
    // Immediately to the left of Add, on the same row.
    expect(driveBox!.y).toBeCloseTo(addBox!.y, 0);
    expect(addBox!.x - (driveBox!.x + driveBox!.width)).toBeLessThan(12);
  });
});
