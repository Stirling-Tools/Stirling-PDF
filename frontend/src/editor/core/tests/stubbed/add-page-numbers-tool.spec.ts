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

    const preview = page.getByTestId("page-number-preview-page");
    await preview.getByRole("button", { name: "9", exact: true }).click();
    await page.mouse.move(0, 0);

    // Both boxes in one read, polled: the panel can still be scrolling or
    // resizing after the click. Medium margin is 3.5% of the page; the range
    // allows for font metrics.
    const placement = () =>
      label.evaluate((el) => {
        const pageBox = el
          .closest('[data-testid="page-number-preview-page"]')!
          .getBoundingClientRect();
        const box = el.getBoundingClientRect();
        const right = (pageBox.right - box.right) / pageBox.width;
        const bottom = (pageBox.bottom - box.bottom) / pageBox.height;
        const ok =
          right > 0.02 && right < 0.05 && bottom > 0.01 && bottom < 0.05;
        return ok ? "bottom-right margin" : `right ${right}, bottom ${bottom}`;
      });
    await expect.poll(placement).toBe("bottom-right margin");
  });
});
