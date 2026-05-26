import { test, expect } from "@app/tests/helpers/stub-test-base";
import { uploadFiles } from "@app/tests/helpers/ui-helpers";
import path from "path";

const FIXTURES_DIR = path.join(__dirname, "../test-fixtures");
const SAMPLE_PDF = path.join(FIXTURES_DIR, "sample.pdf");

/**
 * Files uploaded on one tool page should remain in the workbench when the
 * user navigates to a different tool. This is FileContext behaviour and
 * easy to break with a stale-effect or unmount-clear bug.
 */
test.describe("File state persists across tool navigation", () => {
  test("file uploaded on /merge survives navigation to /split", async ({
    page,
  }) => {
    await uploadFiles(page, SAMPLE_PDF);

    // Sanity: the file picker now lists the upload
    await page.getByTestId("files-button").click();
    await expect(page.getByText(/sample\.pdf/i).first()).toBeVisible({
      timeout: 5_000,
    });
    await page.keyboard.press("Escape");

    // Navigate to /split
    await page.goto("/split");
    await page.waitForLoadState("domcontentloaded");

    // Re-open the files modal — sample.pdf must still be there
    await page.getByTestId("files-button").click();
    await expect(page.getByText(/sample\.pdf/i).first()).toBeVisible({
      timeout: 5_000,
    });
  });
});
