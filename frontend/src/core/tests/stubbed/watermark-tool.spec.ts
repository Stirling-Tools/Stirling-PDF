import { test, expect } from "@app/tests/helpers/stub-test-base";
import { uploadFiles } from "@app/tests/helpers/ui-helpers";
import path from "path";

const SAMPLE_PDF = path.join(__dirname, "../test-fixtures/sample.pdf");

/**
 * Watermark has three modes — text / image / file overlay — selected via
 * card chooser, each driving a different settings step. The chooser only
 * renders after a file has been uploaded; today the page-loads smoke test
 * covers the bare URL only, so this spec extends to the post-upload flow.
 */
test.describe("Watermark tool — mode selection after upload", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/v1/security/add-watermark", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/pdf",
        headers: {
          "Content-Disposition": 'attachment; filename="watermarked.pdf"',
        },
        body: Buffer.from("%PDF-1.4 stub\n"),
      }),
    );
    await page.goto("/watermark");
    await page.waitForLoadState("domcontentloaded");
    await uploadFiles(page, SAMPLE_PDF);
  });

  test("post-upload UI renders mode cards or settings (whatever the chooser is)", async ({
    page,
  }) => {
    // The chooser may render as Mantine cards or buttons depending on the build.
    // Either flavour is fine; what we want to catch is "post-upload watermark
    // page is empty / errored".
    const choices = page.locator(
      '.mantine-Card-root, button:has-text("Text"), button:has-text("Image"), button:has-text("File")',
    );
    await expect
      .poll(async () => choices.count(), { timeout: 10_000 })
      .toBeGreaterThan(0);
  });
});
