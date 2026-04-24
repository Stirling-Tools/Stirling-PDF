import { test, expect } from "@app/tests/helpers/stub-test-base";

test.describe("10. Reader Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/read");
    await page.waitForLoadState("domcontentloaded");
  });

  test.describe("10.1 Reader - Layout", () => {
    test("should load with sidebar and upload area", async ({ page }) => {
      // Step 1: Verify the Reader page loads with navigation visible
      await expect(page.getByText("Reader").first()).toBeVisible({
        timeout: 10000,
      });

      // Step 2: Verify the file upload area is present
      await expect(page.getByText(/upload/i).first()).toBeVisible();

      // Step 3: Verify the Reader link in the navigation
      const readerLink = page.locator('a[href="/read"]').first();
      await expect(readerLink).toBeVisible();
    });
  });
});
