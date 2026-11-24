import { test, expect } from "@editor/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";

async function openCreatePdfMenu(page: Page) {
  await page.goto("/editor", { waitUntil: "domcontentloaded" });
  await page.getByTestId("landing-create-pdf").click();
  await expect(page.getByTestId("create-pdf-blank")).toBeVisible();
}

test("offers a blank page and converting another file when the server can convert", async ({
  page,
}) => {
  await openCreatePdfMenu(page);
  await expect(page.getByTestId("create-pdf-source")).toBeVisible();
});

test("offers only a blank page when the server cannot convert files to PDF", async ({
  page,
}) => {
  await page.route("**/api/v1/config/endpoints-availability", (route) =>
    route.fulfill({
      json: { "file-to-pdf": { enabled: false, reason: "DEPENDENCY" } },
    }),
  );
  await openCreatePdfMenu(page);
  await expect(page.getByTestId("create-pdf-blank")).toBeVisible();
  await expect(page.getByTestId("create-pdf-source")).toHaveCount(0);
});

test("a blank page opens in the text editor", async ({ page }) => {
  await openCreatePdfMenu(page);
  await page.getByTestId("create-pdf-blank").click();
  await page.waitForURL(/pdf-text-editor/, { timeout: 30_000 });
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 30_000,
  });
});
