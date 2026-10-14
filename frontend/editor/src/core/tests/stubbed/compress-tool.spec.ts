import type { Page } from "@playwright/test";
import path from "path";
import fs from "fs";
import { test, expect } from "@app/tests/helpers/stub-test-base";
import {
  uploadFiles,
  switchToEditorIfViewerMode,
  runToolAndWaitForReview,
} from "@app/tests/helpers/ui-helpers";

const FIXTURES_DIR = path.join(import.meta.dirname, "../test-fixtures");
const SAMPLE_PDF = path.join(FIXTURES_DIR, "sample.pdf");
const SAMPLE_PDF_BYTES = fs.readFileSync(SAMPLE_PDF);
const SMALLER_PDF_BYTES = fs.readFileSync(
  path.join(FIXTURES_DIR, "cropbox-control.pdf"),
);
const NO_REDUCTION_NOTICE = /can't be compressed any further/i;

async function stubCompressResponse(page: Page, body: Buffer) {
  await page.route("**/api/v1/misc/compress-pdf", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/pdf",
      headers: {
        "Content-Disposition": 'attachment; filename="sample_Optimized.pdf"',
      },
      body,
    }),
  );
}

async function compressSample(page: Page) {
  await uploadFiles(page, SAMPLE_PDF);
  await switchToEditorIfViewerMode(page);
  await runToolAndWaitForReview(page);
}

test.describe("8. Compress Tool", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/compress");
    await page.waitForLoadState("domcontentloaded");
  });

  test.describe("8.1 Compress - Page Structure", () => {
    test("should load correctly with disabled action button", async ({
      page,
    }) => {
      // Step 1: Verify the page shows the Files and Settings steps
      await expect(page.getByText("Files").first()).toBeVisible();
      await expect(page.getByText("Settings").first()).toBeVisible();

      // Step 2: Verify the "Compress" button is present and disabled
      const compressButton = page
        .getByRole("button", { name: /compress/i })
        .first();
      await expect(compressButton).toBeVisible();
      await expect(compressButton).toBeDisabled();

      // Step 3: Verify the file upload area is displayed
      await expect(page.getByText(/upload/i).first()).toBeVisible();
    });
  });

  test.describe("8.2 Compress - No size reduction", () => {
    test("says so when the result is no smaller than the input", async ({
      page,
    }) => {
      await stubCompressResponse(page, SAMPLE_PDF_BYTES);
      await compressSample(page);

      await expect(page.getByText(NO_REDUCTION_NOTICE)).toBeVisible();
    });

    test("stays quiet when the result is smaller", async ({ page }) => {
      await stubCompressResponse(page, SMALLER_PDF_BYTES);
      await compressSample(page);

      await expect(
        page.locator('[data-testid="review-panel-container"]'),
      ).toBeVisible();
      await expect(page.getByText(NO_REDUCTION_NOTICE)).toHaveCount(0);
    });
  });
});
