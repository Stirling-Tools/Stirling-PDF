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

test.describe("PDF Library cleanup", () => {
  test("keeps the File library action in quick navigation instead of duplicating it", async ({
    page,
  }) => {
    await page.goto("/editor");
    await expect(
      page.locator(sidebar).getByTestId("my-files-button"),
    ).toHaveCount(0);

    await page.getByTestId("my-files-button").click();
    await expect(page).toHaveURL(/\/files(?:$|[/?#])/);
  });

  test("opens computer files through quick navigation using the shared picker", async ({
    page,
  }) => {
    await page.goto("/editor");

    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("quicknav-open-from-computer").click();
    await (await chooser).setFiles(SAMPLE_PDF);

    await expect(page.locator(".file-sidebar-file-item").first()).toBeVisible({
      timeout: 10_000,
    });
  });

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
    expect(driveBox!.y).toBeCloseTo(addBox!.y, 0);
    expect(addBox!.x - (driveBox!.x + driveBox!.width)).toBeLessThan(12);
  });
});
