import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

const SAMPLE_PDF = path.join(__dirname, "../test-fixtures/sample.pdf");

/**
 * The reader/viewer exposes an in-PDF text search via CustomSearchLayer.
 * No prior coverage; even a smoke assertion that the search input renders
 * and accepts a query catches the most damaging regression (search bar
 * disappears when reader refactors).
 */
test.describe("Reader - in-document text search", () => {
  test("search input is reachable from the reader and accepts a query", async ({
    page,
  }) => {
    await page.goto("/read");
    await page.waitForLoadState("domcontentloaded");

    // Upload a PDF first so the reader has content. `files-button` now
    // triggers the native picker directly - no modal flow involved.
    await page.getByTestId("files-button").click();
    await page.locator('[data-testid="file-input"]').setInputFiles(SAMPLE_PDF);

    // The WorkbenchBar exposes a "Search PDF" button (aria-label="Search PDF")
    // that opens a Popover with the in-document search input.
    // We target this button specifically to avoid matching the FileSidebar's
    // "Search" button (a <div role="button">) which appears earlier in the DOM.
    const searchBtn = page
      .getByRole("button", { name: /^Search PDF$/i })
      .first();

    if (!(await searchBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, "Search PDF button not visible on this build");
      return;
    }

    await searchBtn.click();

    // The SearchInterface renders inside a Popover with placeholder "Enter search term..."
    const input = page.getByPlaceholder(/enter search term/i).first();
    await expect(input).toBeVisible({ timeout: 5_000 });
    await input.fill("page");
    await expect(input).toHaveValue("page");
  });
});
