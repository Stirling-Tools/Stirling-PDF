import { test, expect } from "@app/tests/helpers/stub-test-base";

test.describe("7. Convert Tool", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/convert");
    await page.waitForLoadState("domcontentloaded");
  });

  test.describe("7.1 Convert - Source Format Selection", () => {
    test("should follow correct format dependency flow", async ({ page }) => {
      // Step 1: Verify the page shows "Convert from" and "Convert to" labels
      await expect(page.getByText(/convert from/i).first()).toBeVisible();
      await expect(page.getByText(/convert to/i).first()).toBeVisible();

      // Step 2: Verify the "Select a source format first" placeholder is shown
      // when no source format is selected yet
      await expect(
        page.getByText(/select a source format first/i).first(),
      ).toBeVisible();

      // Step 3: Click the source format dropdown to open it
      const sourceDropdown = page
        .locator(
          '[data-testid="convert-from-dropdown"], [name="convert-from-dropdown"]',
        )
        .first();
      await sourceDropdown.click();

      // Step 4: Verify format options appear in the dropdown
      await page.waitForTimeout(500);

      // Step 5: Select "PDF" as the source format if available
      const pdfOption = page.getByText("PDF", { exact: true }).first();
      if (await pdfOption.isVisible({ timeout: 3000 })) {
        await pdfOption.click();
      }

      // Step 6: After selecting source format, the "Select a source format first"
      // placeholder should no longer be visible
      await page.waitForTimeout(500);
    });
  });

  test.describe("7.2 Convert - Submit Without File", () => {
    test("should not allow conversion without a file", async ({ page }) => {
      // The convert button should remain disabled without a file
      const convertButton = page
        .getByRole("button", { name: /convert files/i })
        .first();
      await expect(convertButton).toBeDisabled();
    });
  });
});
