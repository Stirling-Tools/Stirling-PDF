import type { Page, Route } from "@playwright/test";
import { test, expect } from "@app/tests/helpers/stub-test-base";
import {
  uploadFiles,
  switchToEditorIfViewerMode,
  runToolAndWaitForReview,
} from "@app/tests/helpers/ui-helpers";
import path from "path";
import fs from "fs";

// Regression coverage for the "merge does nothing on connected backends" report.
//
// The shipped bug: useToolOperation's ToolType.multiFile branch decided "single
// PDF vs ZIP" with an exact-equality check on Content-Type. A reverse proxy
// (nginx `charset utf-8;`, an Apache module, a WAF, or a backend that just
// returns `application/octet-stream` with a .pdf filename) feeds the merged
// PDF into extractZipFiles(), which on a non-ZIP body returns a bogus
// `result.zip` wrapping the PDF bytes - the user sees a junk file or nothing.
//
// The fix in this PR replaces the equality check with file-signature
// detection: %PDF wins regardless of Content-Type. These tests exercise the
// real React UI against a mocked backend that returns each bug-trigger
// Content-Type variant and assert the user gets a merged PDF.

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
  test('handles "application/pdf;charset=UTF-8" (charset-suffixed) -> merged PDF, not result.zip', async ({
    page,
  }) => {
    await mockMergeWithContentType(page, "application/pdf;charset=UTF-8");
    await runMergeAndOpenReview(page);

    const review = page.locator('[data-testid="review-panel-container"]');
    // Positive: review surfaces the merged PDF.
    await expect(review).toBeVisible();
    // Negative: must NOT produce a `result.zip` (what the old exact-match
    // branch would have created by feeding a PDF into JSZip).
    await expect(review.getByText(/result\.zip/i)).toHaveCount(0);
  });

  test('handles "application/octet-stream" -> merged PDF, not result.zip', async ({
    page,
  }) => {
    await mockMergeWithContentType(page, "application/octet-stream");
    await runMergeAndOpenReview(page);

    const review = page.locator('[data-testid="review-panel-container"]');
    await expect(review).toBeVisible();
    await expect(review.getByText(/result\.zip/i)).toHaveCount(0);
  });

  test('handles "APPLICATION/PDF" (uppercase) -> merged PDF, not result.zip', async ({
    page,
  }) => {
    await mockMergeWithContentType(page, "APPLICATION/PDF");
    await runMergeAndOpenReview(page);

    const review = page.locator('[data-testid="review-panel-container"]');
    await expect(review).toBeVisible();
    await expect(review.getByText(/result\.zip/i)).toHaveCount(0);
  });

  test('canonical "application/pdf" still works (sanity)', async ({ page }) => {
    await mockMergeWithContentType(page, "application/pdf");
    await runMergeAndOpenReview(page);

    const review = page.locator('[data-testid="review-panel-container"]');
    await expect(review).toBeVisible();
    await expect(review.getByText(/result\.zip/i)).toHaveCount(0);
  });

  // Separately documents the symptom Gilles described ("fast animation then
  // nothing happens"). The multi-file response-detection fix above produces a
  // visible (wrong) result.zip pre-fix - which the user would see, not call
  // "nothing happens". A 401 from the connected backend on the other hand
  // produces no review panel, no result file. This test pins what the user
  // actually sees in that case so we can compare it to the report.
  test("401 on merge: no result panel, no result file appears", async ({
    page,
  }) => {
    await page.route("**/api/v1/general/merge-pdfs", (route: Route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unauthorized" }),
      }),
    );

    await page.goto("/merge");
    await uploadFiles(page, [SAMPLE_PDF, SAMPLE_PDF]);
    await switchToEditorIfViewerMode(page);

    const runBtn = page.locator('[data-tour="run-button"]');
    await expect(runBtn).toBeEnabled({ timeout: 15_000 });
    await runBtn.click();

    // Give the UI ample time to surface any result or error.
    await page.waitForTimeout(3000);

    // No successful result.
    await expect(
      page.locator('[data-testid="review-panel-container"]'),
    ).not.toBeVisible();
    // No bogus result.zip.
    await expect(page.getByText(/result\.zip/i)).toHaveCount(0);
    // No merged file in the file list.
    await expect(page.getByText(/merged_/i)).toHaveCount(0);
  });
});
