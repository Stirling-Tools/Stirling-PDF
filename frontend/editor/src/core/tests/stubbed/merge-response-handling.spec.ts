import type { Page, Route } from "@playwright/test";
import { test, expect } from "@app/tests/helpers/stub-test-base";
import {
  uploadFiles,
  switchToEditorIfViewerMode,
  runToolAndWaitForReview,
} from "@app/tests/helpers/ui-helpers";
import path from "path";
import fs from "fs";

// Regression coverage: the merge endpoint used to misroute a PDF into JSZip
// when the Content-Type wasn't an exact `application/pdf`, producing a bogus
// `result.zip` instead of the merged file. The UI fix uses signature-based
// detection - %PDF wins regardless of Content-Type.

const FIXTURES_DIR = path.join(__dirname, "../test-fixtures");
const SAMPLE_PDF = path.join(FIXTURES_DIR, "sample.pdf");
const SAMPLE_PDF_BYTES = fs.readFileSync(SAMPLE_PDF);

async function mockMergeWithContentType(page: Page, contentType: string) {
  await page.route("**/api/v1/general/merge-pdfs", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType,
      headers: {
        "Content-Disposition": 'attachment; filename="merged_unsigned.pdf"',
      },
      body: SAMPLE_PDF_BYTES,
    }),
  );
}

async function runMergeAndOpenReview(page: Page) {
  await page.goto("/merge");
  await uploadFiles(page, [SAMPLE_PDF, SAMPLE_PDF]);
  await switchToEditorIfViewerMode(page);
  await runToolAndWaitForReview(page);
}

test.describe("Merge multi-file response detection", () => {
  test('"application/pdf;charset=UTF-8" -> merged PDF, not result.zip', async ({
    page,
  }) => {
    await mockMergeWithContentType(page, "application/pdf;charset=UTF-8");
    await runMergeAndOpenReview(page);

    const review = page.locator('[data-testid="review-panel-container"]');
    await expect(review).toBeVisible();
    await expect(review.getByText(/result\.zip/i)).toHaveCount(0);
  });

  test('"application/octet-stream" -> merged PDF, not result.zip', async ({
    page,
  }) => {
    await mockMergeWithContentType(page, "application/octet-stream");
    await runMergeAndOpenReview(page);

    const review = page.locator('[data-testid="review-panel-container"]');
    await expect(review).toBeVisible();
    await expect(review.getByText(/result\.zip/i)).toHaveCount(0);
  });

  test('"APPLICATION/PDF" -> merged PDF, not result.zip', async ({ page }) => {
    await mockMergeWithContentType(page, "APPLICATION/PDF");
    await runMergeAndOpenReview(page);

    const review = page.locator('[data-testid="review-panel-container"]');
    await expect(review).toBeVisible();
    await expect(review.getByText(/result\.zip/i)).toHaveCount(0);
  });
});
