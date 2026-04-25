import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

const SAMPLE_PDF = path.join(__dirname, "../test-fixtures/sample.pdf");

/**
 * Add Page Numbers walks the user through a multi-step config: position
 * (corner / centre), font/size, page range. Asserting the run button
 * starts disabled and enables only after a file is uploaded catches
 * the most common regression — a config-validation effect that fails
 * to mark the form valid.
 */
test.describe("Add Page Numbers tool — config validation", () => {
  test("run button stays disabled until a PDF is uploaded", async ({
    page,
  }) => {
    await page.goto("/add-page-numbers");
    await page.waitForLoadState("domcontentloaded");

    const runBtn = page.locator('[data-tour="run-button"]');
    await expect(runBtn).toBeVisible({ timeout: 5_000 });
    await expect(runBtn).toBeDisabled();

    // Upload via the files modal
    await page.getByTestId("files-button").click();
    await page.waitForSelector(".mantine-Modal-overlay", {
      state: "visible",
      timeout: 5_000,
    });
    await page.locator('[data-testid="file-input"]').setInputFiles(SAMPLE_PDF);
    await page.waitForSelector(".mantine-Modal-overlay", {
      state: "hidden",
      timeout: 10_000,
    });

    // After upload the run button should enable (default position selected)
    await expect(runBtn).toBeEnabled({ timeout: 5_000 });
  });
});
