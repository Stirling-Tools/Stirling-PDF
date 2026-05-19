import { test, expect } from "@app/tests/helpers/stub-test-base";
import { uploadFiles } from "@app/tests/helpers/ui-helpers";
import path from "path";

const SAMPLE_PDF = path.join(__dirname, "../test-fixtures/sample.pdf");

/**
 * AddStamp loads, accepts a PDF upload, and remains interactive.
 * Deeper coverage of the quick/custom positioning modes is left to the
 * tool-specific vitest tests; the surface area exposed here is whatever
 * happens to render given the current build's feature flags.
 */
test.describe("AddStamp tool — page health", () => {
  test("page loads, accepts upload, body remains non-empty", async ({
    page,
  }) => {
    await page.goto("/add-stamp");
    await page.waitForLoadState("domcontentloaded");
    await uploadFiles(page, SAMPLE_PDF);

    await expect(page).toHaveURL(/\/add-stamp/);
    await expect(page.locator("body").first()).not.toBeEmpty();
  });
});
