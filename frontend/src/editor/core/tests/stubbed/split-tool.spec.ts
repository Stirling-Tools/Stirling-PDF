import { test, expect } from "@editor/tests/helpers/stub-test-base";

test.describe("6. Split Tool", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/split");
    await page.waitForLoadState("domcontentloaded");
  });

  test.describe("6.1 Split - Method Selection", () => {
    test("should display all split methods", async ({ page }) => {
      // Step 1: Verify the page shows a multi-step workflow (Files and Settings)
      await expect(page.locator("text=/^Files$|^File$/i").first()).toBeVisible({
        timeout: 10000,
      });
      const methodSelect = page.getByRole("textbox", { name: /Method/i });
      await expect(methodSelect).toBeVisible();

      // Step 2: Verify the following split methods are listed in the Method dropdown
      await methodSelect.click();
      const splitMethods = [
        /Page Numbers/i,
        /Chapters/i,
        /Sections/i,
        /File Size/i,
        /Page Count/i,
        /Document Count/i,
        /Page Divider/i,
        /Printable Chunks/i,
      ];

      for (const method of splitMethods) {
        await expect(page.getByRole("option", { name: method })).toBeVisible({
          timeout: 5000,
        });
      }
      await page.keyboard.press("Escape");

      // Step 3: Verify the "Split" button is disabled
      const splitButton = page.locator('[data-tour="run-button"]');
      await expect(splitButton).toBeVisible();
      await expect(splitButton).toBeDisabled();
    });
  });

  test.describe("6.2 Split - Submit Without File", () => {
    test("should not allow split without a file", async ({ page }) => {
      // Step 1: Select a split method from the Method dropdown
      await page.getByRole("textbox", { name: /Method/i }).click();
      await page.getByRole("option", { name: /Page Numbers/i }).click();

      // Step 2: Verify the "Split" button remains disabled without a file uploaded
      const splitButton = page.locator('[data-tour="run-button"]');
      await expect(splitButton).toBeDisabled();
    });
  });
});
