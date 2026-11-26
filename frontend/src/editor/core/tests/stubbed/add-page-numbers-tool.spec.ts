import { test, expect } from "@editor/tests/helpers/stub-test-base";
import { uploadFiles } from "@editor/tests/helpers/ui-helpers";
import path from "path";

const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);

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

    await uploadFiles(page, SAMPLE_PDF);

    // After upload the run button should enable (default position selected)
    await expect(runBtn).toBeEnabled({ timeout: 5_000 });
  });

  test("preview draws the number where it will be stamped", async ({
    page,
  }) => {
    await page.goto("/add-page-numbers");
    await page.waitForLoadState("domcontentloaded");
    await uploadFiles(page, SAMPLE_PDF);

    const label = page.getByTestId("page-number-preview-label");
    await expect(label).toHaveText("1", { timeout: 5_000 });

    // The label's parent box is the preview page.
    const preview = label.locator("xpath=ancestor::div[1]");
    await preview.getByRole("button", { name: "9", exact: true }).click();
    await page.mouse.move(0, 0);

    const pageBox = await preview.boundingBox();
    const labelBox = await label.boundingBox();
    if (!pageBox || !labelBox) throw new Error("preview not laid out");
    // Medium margin is 3.5% of the page; allow for font metrics.
    const rightGap = pageBox.x + pageBox.width - (labelBox.x + labelBox.width);
    const bottomGap =
      pageBox.y + pageBox.height - (labelBox.y + labelBox.height);
    expect(rightGap / pageBox.width).toBeGreaterThan(0.02);
    expect(rightGap / pageBox.width).toBeLessThan(0.05);
    expect(bottomGap / pageBox.height).toBeGreaterThan(0.01);
    expect(bottomGap / pageBox.height).toBeLessThan(0.05);
  });
});
